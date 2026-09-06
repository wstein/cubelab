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
};

export const createTurnAnchor = (
  baseline: OrientationQuaternion,
  target: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
  now: number,
  durationMs = 700,
): TurnAnchor => ({baseline, target, frame, expiresAt: now + durationMs, samples: 0});

const angularDistance = (quaternion: OrientationQuaternion): number =>
  2 * Math.acos(Math.min(1, Math.abs(quaternion.w)));

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
  maximumDeviationRadians = 10 * Math.PI / 180,
  dwellSamples = 3,
): {
  anchor: TurnAnchor | null;
  target: OrientationQuaternion | null;
  stable: boolean;
  reason: "pending" | "settled" | "frame" | "expired" | "moved";
} => {
  if (anchor.frame !== frame) return {anchor: null, target: null, stable: false, reason: "frame"};
  if (now > anchor.expiresAt) return {anchor: null, target: null, stable: false, reason: "expired"};
  const delta = deviceOrientationDelta(anchor.baseline, current, frame, "world");
  if (angularDistance(delta) > maximumDeviationRadians) return {anchor: null, target: null, stable: false, reason: "moved"};
  const samples = anchor.samples + 1;
  return samples < dwellSamples
    ? {anchor: {...anchor, samples}, target: null, stable: false, reason: "pending"}
    : {anchor: null, target: anchor.target, stable: true, reason: "settled"};
};
