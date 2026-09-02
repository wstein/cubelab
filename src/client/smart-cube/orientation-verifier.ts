import {
  orientationInViewportFrame,
  relativeQuaternion,
  relativeQuaternionLocal,
  type OrientationCoordinateFrame,
  type OrientationQuaternion,
} from "../cube-gl";

export type GyroRotationAssessment = {
  matched: boolean;
  partial: boolean;
  axisAlignment: number;
  signedDegrees: number;
};

export type GyroDeltaFrame = "world" | "local";
export type DetectedGyroRotation = {axis: "X" | "Y" | "Z"; turns: -1 | 1};

const normalizedTurns = (turns: number): number => {
  const normalized = ((turns % 4) + 4) % 4;
  return normalized === 3 ? -1 : normalized;
};

/** Measures an x/y/z regrip from the orientation sample captured when its hint appeared. */
export const assessGyroRotation = (
  base: OrientationQuaternion,
  current: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  axis: "X" | "Y" | "Z",
  turns: number,
  deltaFrame: GyroDeltaFrame = "world",
): GyroRotationAssessment => {
  const baseViewport = orientationInViewportFrame(base, frame);
  const currentViewport = orientationInViewportFrame(current, frame);
  const relative = deltaFrame === "local"
    ? relativeQuaternionLocal(baseViewport, currentViewport)
    : relativeQuaternion(baseViewport, currentViewport);
  let delta = relative;
  // q and -q encode the same pose; select the representation at most 180° from the baseline.
  if (delta.w < 0) {
    delta = {x: -delta.x, y: -delta.y, z: -delta.z, w: -delta.w};
  }
  const vectorLength = Math.hypot(delta.x, delta.y, delta.z);
  const angle = 2 * Math.atan2(vectorLength, Math.max(0, delta.w));
  const component = axis === "X" ? delta.x : axis === "Y" ? delta.y : delta.z;
  const axisAlignment = vectorLength < 1e-6 ? 0 : Math.abs(component) / vectorLength;
  const signedDegrees = vectorLength < 1e-6
    ? 0
    : angle * component / vectorLength * 180 / Math.PI;
  const expectedTurns = normalizedTurns(turns);
  const halfTurn = Math.abs(expectedTurns) === 2;
  // turnTransform uses -turns around the positive logical axis.
  const direction = -Math.sign(expectedTurns || 1);
  const enoughRotation = halfTurn
    ? Math.abs(signedDegrees) >= 135
    : signedDegrees * direction >= 65;
  return {
    matched: axisAlignment >= 0.78 && enoughRotation,
    partial: halfTurn && axisAlignment >= 0.78 && Math.abs(signedDegrees) >= 65,
    axisAlignment,
    signedDegrees,
  };
};

/** Detects a deliberate quarter-turn regrip on any axis, independent of lesson expectations. */
export const detectGyroQuarterRotation = (
  base: OrientationQuaternion,
  current: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  deltaFrame: GyroDeltaFrame = "world",
): DetectedGyroRotation | null => {
  const candidates = (["X", "Y", "Z"] as const).flatMap((axis) => ([1, -1] as const).map((turns) => ({
    axis,
    turns,
    assessment: assessGyroRotation(base, current, frame, axis, turns, deltaFrame),
  })));
  const matched = candidates
    .filter((candidate) => candidate.assessment.matched)
    .sort((left, right) => right.assessment.axisAlignment - left.assessment.axisAlignment)[0];
  return matched ? {axis: matched.axis, turns: matched.turns} : null;
};
