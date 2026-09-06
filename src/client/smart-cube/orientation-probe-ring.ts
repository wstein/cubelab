import {
  orientationDistanceRadians,
  type OrientationCoordinateFrame,
  type OrientationQuaternion,
} from "../cube-gl";

export type OrientationProbe = {
  quaternion: OrientationQuaternion;
  coordinateFrame: OrientationCoordinateFrame;
  timestamp: number;
};

export type OrientationProbeRing = {
  probes: OrientationProbe[];
  previous: OrientationProbe | null;
  discardFollowing: number;
  rotationDropped: boolean;
};

export type OrientationProbeRingPolicy = {
  capacity: number;
  rotationDropThresholdDegrees: number;
  dropFollowingSamples: number;
};

export const createOrientationProbeRing = (): OrientationProbeRing => ({
  probes: [],
  previous: null,
  discardFollowing: 0,
  rotationDropped: false,
});

/** Consume retained samples without losing the raw predecessor used to spot rotation. */
export const consumeOrientationProbeRing = (ring: OrientationProbeRing): OrientationProbeRing => ({
  ...ring,
  probes: [],
  rotationDropped: false,
});

export const appendOrientationProbe = (
  ring: OrientationProbeRing,
  probe: OrientationProbe,
  policy: OrientationProbeRingPolicy,
): {ring: OrientationProbeRing; accepted: boolean; rotationDegrees: number | null} => {
  const rotationDegrees = ring.previous && ring.previous.coordinateFrame === probe.coordinateFrame
    ? orientationDistanceRadians(ring.previous.quaternion, probe.quaternion) * 180 / Math.PI
    : null;
  const previous = probe;
  if (rotationDegrees !== null && rotationDegrees > policy.rotationDropThresholdDegrees) {
    return {
      ring: {
        probes: [],
        previous,
        discardFollowing: policy.dropFollowingSamples,
        rotationDropped: true,
      },
      accepted: false,
      rotationDegrees,
    };
  }
  if (ring.discardFollowing > 0) {
    return {
      ring: {...ring, previous, discardFollowing: ring.discardFollowing - 1},
      accepted: false,
      rotationDegrees,
    };
  }
  const probes = [...ring.probes, probe].slice(-policy.capacity);
  return {ring: {...ring, probes, previous}, accepted: true, rotationDegrees};
};

export const averageOrientationProbes = (probes: OrientationProbe[]): OrientationQuaternion | null => {
  if (probes.length === 0) return null;
  const reference = probes[0]!.quaternion;
  const total = probes.reduce((sum, probe) => {
    const current = probe.quaternion;
    const sign = reference.x * current.x + reference.y * current.y + reference.z * current.z + reference.w * current.w < 0 ? -1 : 1;
    return {x: sum.x + current.x * sign, y: sum.y + current.y * sign, z: sum.z + current.z * sign, w: sum.w + current.w * sign};
  }, {x: 0, y: 0, z: 0, w: 0});
  const magnitude = Math.hypot(total.x, total.y, total.z, total.w) || 1;
  return {x: total.x / magnitude, y: total.y / magnitude, z: total.z / magnitude, w: total.w / magnitude};
};
