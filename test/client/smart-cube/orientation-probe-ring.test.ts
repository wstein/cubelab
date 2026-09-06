import {describe, expect, test} from "vitest";

import {
  appendOrientationProbe,
  createOrientationProbeRing,
} from "../../../src/client/smart-cube/orientation-probe-ring";

const identity = {x: 0, y: 0, z: 0, w: 1};
const x = (degrees: number) => ({x: Math.sin(degrees * Math.PI / 360), y: 0, z: 0, w: Math.cos(degrees * Math.PI / 360)});
const policy = {
  capacity: 3,
  rotationDropThresholdDegrees: 5,
  dropPreviousSamples: 2,
  dropFollowingSamples: 2,
};
const probe = (quaternion: typeof identity, timestamp: number) => ({quaternion, coordinateFrame: "viewport" as const, timestamp});

describe("orientation probe ring", () => {
  test("drops the two preceding and two following probes around a rotation above 5 degrees", () => {
    let ring = createOrientationProbeRing();
    for (let timestamp = 0; timestamp < 3; timestamp += 1) {
      const appended = appendOrientationProbe(ring, probe(identity, timestamp), policy);
      ring = appended.ring;
      expect(appended.accepted).toBe(true);
    }

    const rotating = appendOrientationProbe(ring, probe(x(6), 3), policy);
    ring = rotating.ring;
    expect(rotating.accepted).toBe(false);
    expect(rotating.rotationDegrees).toBeCloseTo(6, 6);
    expect(ring.probes).toHaveLength(1);
    expect(ring.discardFollowing).toBe(2);

    for (const timestamp of [4, 5]) {
      const dropped = appendOrientationProbe(ring, probe(x(6), timestamp), policy);
      ring = dropped.ring;
      expect(dropped.accepted).toBe(false);
    }
    expect(ring.discardFollowing).toBe(0);

    expect(appendOrientationProbe(ring, probe(x(6), 6), policy).accepted).toBe(true);
  });
});
