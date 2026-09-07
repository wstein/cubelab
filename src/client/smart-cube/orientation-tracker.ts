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

/** Nearest of the 24 URFDLB cardinal poses; boundaries lie 45° between neighbours. */
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
    tracker: {...tracker, baseline: current, frame, orientation, candidate: null},
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
 */
export const observeThresholdOrientation = (
  tracker: StableOrientationTracker,
  current: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  minimumRotationDegrees = 65,
): {tracker: StableOrientationTracker; tokens: RegripToken[]} => {
  if (tracker.frame !== frame) return {tracker: createStableOrientationTracker(current, frame, tracker.deltaFrame), tokens: []};
  const delta = deviceOrientationDelta(tracker.baseline, current, frame, tracker.deltaFrame);
  const angleDegrees = 2 * Math.acos(Math.min(1, Math.abs(delta.w))) * 180 / Math.PI;
  if (angleDegrees < minimumRotationDegrees) return {tracker, tokens: []};
  const nearest = closestCardinalOrientation(delta);
  if (nearest.index === 0) return {tracker, tokens: []};
  const cardinal = orientations[nearest.index]!.quaternion;
  const orientation = normalize(tracker.deltaFrame === "world"
    ? multiplyQuaternions(cardinal, tracker.orientation)
    : multiplyQuaternions(tracker.orientation, cardinal));
  return {
    tracker: {...tracker, baseline: current, frame, orientation, candidate: null},
    tokens: orientations[nearest.index]!.tokens.map(clockwiseNotationToken),
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

// A positive sensor quaternion is counter-clockwise in the cube's local
// right-hand frame. Singmaster whole-cube x/y/z is clockwise, so only the
// emitted notation token must be inverted; the sensor quaternion itself is
// still the correct physical pose for viewport reconciliation.
const clockwiseNotationToken = (token: RegripToken): RegripToken => token.endsWith("'")
  ? token.slice(0, -1) as RegripToken
  : `${token}'` as RegripToken;

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
 * Emits on entry into a 30° circle around the next six quarter-turn targets.
 *
 * The accepted *virtual* orientation advances exactly 90°; the next capture
 * circle is therefore always the next quarter turn. At each capture the raw
 * gyro delta is corrected onto that exact virtual target. This absorbs gyro
 * bias without rebasing to the 60° circle boundary, which otherwise makes
 * the next target only ~60° away and loses a long x/y/z sequence.
 */
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
      ...tracker,
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

const BODY_FACES: Array<{face: string; normal: [number, number, number]}> = [
  {face: "U", normal: [0, 1, 0]},
  {face: "R", normal: [1, 0, 0]},
  {face: "F", normal: [0, 0, 1]},
  {face: "D", normal: [0, -1, 0]},
  {face: "L", normal: [-1, 0, 0]},
  {face: "B", normal: [0, 0, -1]},
];

const WORLD_AXES: Array<[number, number, number]> = [
  [0, 1, 0],   // Up (U)
  [1, 0, 0],   // Right (R)
  [0, 0, 1],   // Front (F)
  [0, -1, 0],  // Down (D)
  [-1, 0, 0],  // Left (L)
  [0, 0, -1],  // Back (B)
];

const rotateVectorByQuaternion = (
  quaternion: OrientationQuaternion,
  vector: [number, number, number],
): [number, number, number] => {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) || 1;
  const qx = quaternion.x / length;
  const qy = quaternion.y / length;
  const qz = quaternion.z / length;
  const qw = quaternion.w / length;
  const [vx, vy, vz] = vector;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
};

/**
 * Expresses a cardinal orientation quaternion in URFDLB face notation,
 * indicating which body face occupies each world position (Up, Right, Front, Down, Left, Back).
 * Identity is "URFDLB".
 */
export const cardinalOrientationFaces = (orientation: OrientationQuaternion): string => {
  const inv: OrientationQuaternion = {
    x: -orientation.x,
    y: -orientation.y,
    z: -orientation.z,
    w: orientation.w,
  };
  return WORLD_AXES.map((worldAxis) => {
    const body = rotateVectorByQuaternion(inv, worldAxis);
    let best = {face: "U", dot: -Infinity};
    for (const candidate of BODY_FACES) {
      const dot = body[0] * candidate.normal[0] + body[1] * candidate.normal[1] + body[2] * candidate.normal[2];
      if (dot > best.dot) best = {face: candidate.face, dot};
    }
    return best.face;
  }).join("");
};
