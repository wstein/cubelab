import {
  deviceOrientationDelta,
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
 * Snaps any orientation to the nearest of the 24 legal cube poses, with no
 * alignment gate or dwell requirement. Every pose in the group is exactly 90°
 * from its neighbours, so this never moves an input by more than ~63°
 * (the group's worst-case covering radius) regardless of how far off it is.
 */
export const nearestCardinalOrientation = (quaternion: OrientationQuaternion): OrientationQuaternion =>
  orientations[closestCardinalOrientation(quaternion).index]!.quaternion;

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
    tracker: {baseline: current, frame, orientation, candidate: null},
    tokens: orientations[nearest.index]!.tokens,
  };
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
      orientation: normalize(tracker.deltaFrame === "world"
        ? multiplyQuaternions(orientations[nearest.index]!.quaternion, tracker.orientation)
        : multiplyQuaternions(tracker.orientation, orientations[nearest.index]!.quaternion)),
      candidate: null,
    },
    tokens: orientations[nearest.index]!.tokens,
  };
};
