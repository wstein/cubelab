import {
  deviceOrientationDelta,
  type OrientationCoordinateFrame,
  type OrientationQuaternion,
} from "../cube-gl";

export type TurnAnchor = {
  baseline: OrientationQuaternion;
  target: OrientationQuaternion;
  frame: OrientationCoordinateFrame;
  expiresAt: number;
  samples: number;
  orientations: OrientationQuaternion[];
};

export const createTurnAnchor = (
  baseline: OrientationQuaternion,
  target: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  now: number,
  durationMs = 700,
): TurnAnchor => ({baseline, target, frame, expiresAt: now + durationMs, samples: 0, orientations: []});

const angularDistance = (quaternion: OrientationQuaternion): number =>
  2 * Math.acos(Math.min(1, Math.abs(quaternion.w)));

const normalized = (quaternion: OrientationQuaternion): OrientationQuaternion => {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) || 1;
  return {x: quaternion.x / length, y: quaternion.y / length, z: quaternion.z / length, w: quaternion.w / length};
};

const averageOrientation = (orientations: OrientationQuaternion[]): OrientationQuaternion => {
  const reference = normalized(orientations[0]!);
  const total = orientations.reduce((sum, orientation) => {
    const current = normalized(orientation);
    const sign = reference.x * current.x + reference.y * current.y + reference.z * current.z + reference.w * current.w < 0 ? -1 : 1;
    return {
      x: sum.x + current.x * sign,
      y: sum.y + current.y * sign,
      z: sum.z + current.z * sign,
      w: sum.w + current.w * sign,
    };
  }, {x: 0, y: 0, z: 0, w: 0});
  return normalized(total);
};

/**
 * A face packet says cubies moved but the whole cube should not have. It opens
 * a short, deliberately strict window in which near-still IMU samples can
 * refine the display pose. Crossing the ten-degree boundary is a regrip, not
 * a calibration sample.
 */
export const observeTurnAnchor = (
  anchor: TurnAnchor,
  current: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  now: number,
  maximumDeviationRadians = 20 * Math.PI / 180,
  dwellSamples = 3,
): {
  anchor: TurnAnchor | null;
  target: OrientationQuaternion | null;
  stable: boolean;
  reason: "pending" | "settled" | "frame" | "expired" | "moved";
  deviationRadians: number | null;
  settledOrientation: OrientationQuaternion | null;
} => {
  if (anchor.frame !== frame) return {anchor: null, target: null, stable: false, reason: "frame", deviationRadians: null, settledOrientation: null};
  if (now > anchor.expiresAt) return {anchor: null, target: null, stable: false, reason: "expired", deviationRadians: null, settledOrientation: null};
  const delta = deviceOrientationDelta(anchor.baseline, current, frame, "world");
  const deviationRadians = angularDistance(delta);
  if (deviationRadians > maximumDeviationRadians) return {anchor: null, target: null, stable: false, reason: "moved", deviationRadians, settledOrientation: null};
  const samples = anchor.samples + 1;
  const orientations = [...anchor.orientations, current];
  return samples < dwellSamples
    ? {anchor: {...anchor, samples, orientations}, target: null, stable: false, reason: "pending", deviationRadians, settledOrientation: null}
    : {anchor: null, target: anchor.target, stable: true, reason: "settled", deviationRadians, settledOrientation: averageOrientation(orientations)};
};
