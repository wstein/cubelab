import {
  deviceOrientationDelta,
  followSmartCubeOrientationOffset,
  multiplyQuaternions,
  type OrientationCoordinateFrame,
  type OrientationQuaternion,
} from "../cube-gl";

export type RegripToken = "x" | "x'" | "y" | "y'" | "z" | "z'";

type CardinalOrientation = {
  quaternion: OrientationQuaternion;
  tokens: RegripToken[];
};

export type StableOrientationTracker = {
  baseline: OrientationQuaternion;
  frame: OrientationCoordinateFrame;
  deltaFrame: "local" | "world";
  orientation: OrientationQuaternion;
  candidate: {index: number; samples: number} | null;
  /** Wall-clock time baseline was last touched, for the drift follow below. */
  baselineUpdatedAt: number | null;
  /**
   * How many degrees short of the exact 90° mark the last confirm's raw
   * triggering sample was (always <= 0). Only observeThresholdOrientation
   * uses this — see there for why it exists.
   */
  pendingCarryoverDegrees: number;
};

const normalize = (quaternion: OrientationQuaternion): OrientationQuaternion => {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) || 1;
  return {
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
    w: quaternion.w / length,
  };
};

const quarter = (axis: "X" | "Y" | "Z", turns: 1 | -1): OrientationQuaternion => {
  const half = Math.SQRT1_2 * turns;
  return axis === "X"
    ? {x: half, y: 0, z: 0, w: Math.SQRT1_2}
    : axis === "Y"
      ? {x: 0, y: half, z: 0, w: Math.SQRT1_2}
      : {x: 0, y: 0, z: half, w: Math.SQRT1_2};
};

const candidates = ([
  {axis: "X", token: "x"},
  {axis: "X", token: "x'"},
  {axis: "Y", token: "y"},
  {axis: "Y", token: "y'"},
  {axis: "Z", token: "z"},
  {axis: "Z", token: "z'"},
] as const).map(({axis, token}) => ({
  quaternion: quarter(axis, token.endsWith("'") ? -1 : 1),
  token,
}));

const equivalent = (left: OrientationQuaternion, right: OrientationQuaternion): boolean => {
  const dot = Math.abs(left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w);
  return dot > 1 - 1e-8;
};

const cardinalOrientations = (): CardinalOrientation[] => {
  const all: CardinalOrientation[] = [{quaternion: {x: 0, y: 0, z: 0, w: 1}, tokens: []}];
  for (let index = 0; index < all.length; index += 1) {
    const current = all[index]!;
    for (const next of candidates) {
      const quaternion = normalize(multiplyQuaternions(current.quaternion, next.quaternion));
      if (all.some((existing) => equivalent(existing.quaternion, quaternion))) continue;
      all.push({quaternion, tokens: [...current.tokens, next.token]});
    }
  }
  return all;
};

const orientations = cardinalOrientations();

/** The rotation group of a cube: every legal cardinal pose, exactly once. */
export const cardinalOrientationCount = orientations.length;

const closestCardinalOrientation = (quaternion: OrientationQuaternion): {index: number; alignment: number} => {
  const normalized = normalize(quaternion);
  let result = {index: 0, alignment: -1};
  orientations.forEach((candidate, index) => {
    const alignment = Math.abs(
      normalized.x * candidate.quaternion.x
      + normalized.y * candidate.quaternion.y
      + normalized.z * candidate.quaternion.z
      + normalized.w * candidate.quaternion.w,
    );
    if (alignment > result.alignment) result = {index, alignment};
  });
  return result;
};

/**
 * Same nearest search, restricted to identity plus the six direct
 * quarter-turn neighbours (orientations[1..6], guaranteed by
 * cardinalOrientations' BFS construction to be exactly those six, in
 * `candidates` order). A single detected event can never legitimately
 * represent two simultaneous turns, so unlike closestCardinalOrientation this
 * never returns a multi-token pose — needed because staying quiet for longer
 * between confirms (baseline drift correction, threshold carryover) means
 * the raw delta occasionally goes stale enough, across a real gap between
 * unrelated actions, to land numerically closer to some 2-hop composite than
 * to any single neighbour, which is essentially always spurious.
 */
const closestSingleHopCardinal = (quaternion: OrientationQuaternion): {index: number; alignment: number} => {
  const normalized = normalize(quaternion);
  let result = {index: 0, alignment: -1};
  for (let index = 0; index <= candidates.length; index += 1) {
    const candidate = orientations[index]!;
    const alignment = Math.abs(
      normalized.x * candidate.quaternion.x
      + normalized.y * candidate.quaternion.y
      + normalized.z * candidate.quaternion.z
      + normalized.w * candidate.quaternion.w,
    );
    if (alignment > result.alignment) result = {index, alignment};
  }
  return result;
};

export const createStableOrientationTracker = (
  baseline: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  deltaFrame: "local" | "world" = "local",
): StableOrientationTracker => ({
  baseline,
  frame,
  deltaFrame,
  orientation: {x: 0, y: 0, z: 0, w: 1},
  candidate: null,
  baselineUpdatedAt: null,
  pendingCarryoverDegrees: 0,
});

/**
 * Emits a regrip only after repeated samples settle near one of the 24 legal
 * cube orientations. Each accepted pose becomes the next raw baseline, so
 * small IMU heading drift cannot accumulate across successive regrips.
 */
export const observeStableOrientation = (
  tracker: StableOrientationTracker,
  current: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  minimumAlignment = Math.cos(10 * Math.PI / 360),
  dwellSamples = 3,
): {tracker: StableOrientationTracker; tokens: RegripToken[]} => {
  if (tracker.frame !== frame) return {tracker: createStableOrientationTracker(current, frame, tracker.deltaFrame), tokens: []};
  const delta = deviceOrientationDelta(tracker.baseline, current, frame, tracker.deltaFrame);
  const nearest = closestCardinalOrientation(delta);
  if (nearest.alignment < minimumAlignment || nearest.index === 0) {
    return {tracker: {...tracker, candidate: null}, tokens: []};
  }
  const samples = tracker.candidate?.index === nearest.index ? tracker.candidate.samples + 1 : 1;
  if (samples < dwellSamples) {
    return {tracker: {...tracker, candidate: {index: nearest.index, samples}}, tokens: []};
  }
  const cardinal = orientations[nearest.index]!.quaternion;
  const orientation = normalize(tracker.deltaFrame === "world"
    ? multiplyQuaternions(cardinal, tracker.orientation)
    : multiplyQuaternions(tracker.orientation, cardinal));
  return {
    tracker: {
      baseline: current,
      frame,
      deltaFrame: tracker.deltaFrame,
      orientation,
      candidate: null,
      baselineUpdatedAt: tracker.baselineUpdatedAt,
      pendingCarryoverDegrees: 0,
    },
    tokens: orientations[nearest.index]!.tokens,
  };
};

/**
 * Emits a regrip as soon as the cumulative rotation from the last accepted
 * pose crosses a threshold, with no dwell and no tight alignment gate. Every
 * pair of the 24 legal poses is exactly 90° apart, so a threshold comfortably
 * past the 45° Voronoi boundary between neighbours (65° by default) already
 * guarantees nearest-cardinal picks the correct neighbour over identity,
 * however imprecisely the hand actually lands — precision only has to be
 * good enough to tell two 90°-apart poses apart, not to hit one exactly.
 * Ordinary handling jostle, which rarely accumulates past the threshold
 * before the cube settles back down, never triggers at all.
 *
 * When timestampMs is supplied, the baseline itself continuously drifts
 * toward the raw sample at up to driftDegreesPerSecond (2°/s by default,
 * matching cube-gl.ts's SMART_CUBE_OFFSET_RADIANS_PER_SECOND) between
 * confirms. This damps out slow sensor heading bias — the cube sitting still
 * for a while must not be able to accumulate enough apparent rotation to
 * cross the threshold on its own — without touching real regrips, which turn
 * far faster than 2°/s and so easily outrun this cap and register normally.
 * Confirms still rebase to the exact raw triggering sample, not this drifted
 * value: that discrete snap is what stops small heading bias from
 * accumulating *across* regrips (see the docs for the case this broke on).
 *
 * pendingCarryoverDegrees fixes a subtler issue: rebasing to the raw sample
 * (needed above) means each confirm's baseline sits wherever it happened to
 * cross the threshold, not the exact 90° mark — for a continuous, unbroken
 * spin this makes every *subsequent* confirm fire ~65° later instead of
 * ~90° later, since the leftover shortfall from firing early never gets paid
 * back (verified against the real capture and a clean synthetic sweep: this
 * literally fired every 65° — 65°, 130°, 195°, 260°... instead of the
 * physically correct 65°, 155°, 245°, 335°...). Folding the *previous*
 * confirm's shortfall into the *next* threshold check reproduces the correct
 * spacing: effectiveDegrees crossing minimumRotationDegrees is equivalent to
 * rawCumulative crossing 90×n − (90 − minimumRotationDegrees) for every n,
 * not just n=1. The nearest-cardinal search still uses the raw (uncarried)
 * delta — carryover only ever shifts *when* a confirm fires, never *which
 * axis* it resolves to. Between confirms this same shortfall also decays
 * back toward 0 at driftDegreesPerSecond (reusing the drift-follow's own
 * rate and elapsed time), so a genuine pause — a fresh, unrelated regrip
 * after the spin stops — is not left carrying stale debt that could push an
 * otherwise-valid detection below threshold.
 */
export const observeThresholdOrientation = (
  tracker: StableOrientationTracker,
  current: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  minimumRotationDegrees = 65,
  timestampMs?: number,
  driftDegreesPerSecond = 2,
): {tracker: StableOrientationTracker; tokens: RegripToken[]; angleDegrees: number; effectiveDegrees: number} => {
  if (tracker.frame !== frame) {
    return {
      tracker: createStableOrientationTracker(current, frame, tracker.deltaFrame),
      tokens: [],
      angleDegrees: 0,
      effectiveDegrees: 0,
    };
  }
  const elapsedMs = timestampMs !== undefined && tracker.baselineUpdatedAt !== null
    ? Math.max(0, timestampMs - tracker.baselineUpdatedAt)
    : 0;
  const baseline = elapsedMs > 0
    ? followSmartCubeOrientationOffset(tracker.baseline, current, elapsedMs, driftDegreesPerSecond * Math.PI / 180)
    : tracker.baseline;
  const baselineUpdatedAt = timestampMs ?? tracker.baselineUpdatedAt;
  // pendingCarryoverDegrees is always <= 0 (a shortfall); recovering it
  // toward 0 over elapsed time is what lets a genuine pause forgive it.
  const pendingCarryoverDegrees = Math.min(0, tracker.pendingCarryoverDegrees + driftDegreesPerSecond * elapsedMs / 1000);
  const delta = deviceOrientationDelta(baseline, current, frame, tracker.deltaFrame);
  const angleDegrees = 2 * Math.acos(Math.min(1, Math.abs(delta.w))) * 180 / Math.PI;
  const effectiveDegrees = angleDegrees + pendingCarryoverDegrees;
  if (effectiveDegrees < minimumRotationDegrees) {
    return {tracker: {...tracker, baseline, baselineUpdatedAt, pendingCarryoverDegrees}, tokens: [], angleDegrees, effectiveDegrees};
  }
  const nearest = closestSingleHopCardinal(delta);
  if (nearest.index === 0) {
    return {tracker: {...tracker, baseline, baselineUpdatedAt, pendingCarryoverDegrees}, tokens: [], angleDegrees, effectiveDegrees};
  }
  const cardinal = orientations[nearest.index]!.quaternion;
  const orientation = normalize(tracker.deltaFrame === "world"
    ? multiplyQuaternions(cardinal, tracker.orientation)
    : multiplyQuaternions(tracker.orientation, cardinal));
  const nextCarryoverDegrees = Math.max(
    -(90 - minimumRotationDegrees),
    Math.min(0, effectiveDegrees - 90),
  );
  return {
    tracker: {
      baseline: current,
      frame,
      deltaFrame: tracker.deltaFrame,
      orientation,
      candidate: null,
      baselineUpdatedAt,
      pendingCarryoverDegrees: nextCarryoverDegrees,
    },
    tokens: orientations[nearest.index]!.tokens,
    angleDegrees,
    effectiveDegrees,
  };
};

const AXIS_TOKENS: Array<{axis: [number, number, number]; token: RegripToken}> = [
  {axis: [1, 0, 0], token: "x"},
  {axis: [-1, 0, 0], token: "x'"},
  {axis: [0, 1, 0], token: "y"},
  {axis: [0, -1, 0], token: "y'"},
  {axis: [0, 0, 1], token: "z"},
  {axis: [0, 0, -1], token: "z'"},
];

/**
 * Nearest of the six quarter-turn directions to a raw rotation axis (as from
 * quaternionAxisAngle). Unlike closestCardinalOrientation, this only looks at
 * direction, not the full 24-pose group, so it stays meaningful mid-rotation
 * for a live progress readout rather than just at confirm time.
 */
export const nearestRegripAxis = (axis: [number, number, number]): RegripToken | null => {
  const magnitude = Math.hypot(...axis);
  if (magnitude < 1e-6) return null;
  let best: {token: RegripToken; dot: number} | null = null;
  for (const candidate of AXIS_TOKENS) {
    const dot = (
      axis[0] * candidate.axis[0] + axis[1] * candidate.axis[1] + axis[2] * candidate.axis[2]
    ) / magnitude;
    if (!best || dot > best.dot) best = {token: candidate.token, dot};
  }
  return best!.token;
};

/**
 * Commits a cardinal pose that another sensor window has already proven still.
 * Face-turn anchors supply that proof after their own three-sample dwell, so a
 * regrip immediately followed by a face turn is not mistaken for 180° drift.
 */
export const settleStableOrientation = (
  tracker: StableOrientationTracker,
  current: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  minimumAlignment = Math.cos(10 * Math.PI / 360),
): {tracker: StableOrientationTracker; tokens: RegripToken[]} => {
  if (tracker.frame !== frame) return {tracker: createStableOrientationTracker(current, frame, tracker.deltaFrame), tokens: []};
  const delta = deviceOrientationDelta(tracker.baseline, current, frame, tracker.deltaFrame);
  const nearest = closestCardinalOrientation(delta);
  if (nearest.alignment < minimumAlignment || nearest.index === 0) {
    return {tracker, tokens: []};
  }
  return {
    tracker: {
      baseline: current,
      frame,
      deltaFrame: tracker.deltaFrame,
      orientation: normalize(tracker.deltaFrame === "world"
        ? multiplyQuaternions(orientations[nearest.index]!.quaternion, tracker.orientation)
        : multiplyQuaternions(tracker.orientation, orientations[nearest.index]!.quaternion)),
      candidate: null,
      baselineUpdatedAt: tracker.baselineUpdatedAt,
      pendingCarryoverDegrees: 0,
    },
    tokens: orientations[nearest.index]!.tokens,
  };
};
