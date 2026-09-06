import {describe, expect, test} from "vitest";

import {defaultMotionProfile, motionProfileFor, parseMotionProfileRegistry} from "../../../src/client/smart-cube/motion-profile";

describe("smart-cube motion profiles", () => {
  test("selects a validated device override and keeps a conservative fallback", () => {
    const registry = parseMotionProfileRegistry({
      version: 1,
      default: defaultMotionProfile,
      profiles: {gocube: {...defaultMotionProfile, label: "GoCube", rotationDropThresholdDegrees: 5, correctionErrorDivisor: 5}},
    });
    expect(motionProfileFor(registry, "gocube").rotationDropThresholdDegrees).toBe(5);
    expect(motionProfileFor(registry, "gocube").correctionErrorDivisor).toBe(5);
    expect(motionProfileFor(registry, "gocube").orientationRingSamples).toBe(3);
    expect(motionProfileFor(registry, "gocube").rotationDropPreviousSamples).toBe(2);
    expect(motionProfileFor(registry, "gocube").rotationDropFollowingSamples).toBe(2);
    expect(motionProfileFor(registry, "gocube").maximumTargetErrorDegrees).toBe(defaultMotionProfile.maximumTargetErrorDegrees);
    expect(motionProfileFor(registry, "gan")).toEqual(defaultMotionProfile);
  });

  test("rejects malformed server data", () => {
    expect(parseMotionProfileRegistry({version: 1, default: {label: "bad"}, profiles: {}})).toBeNull();
  });

  test("rejects a non-positive maximum target error", () => {
    expect(parseMotionProfileRegistry({
      version: 1,
      default: {...defaultMotionProfile, maximumTargetErrorDegrees: 0},
      profiles: {},
    })).toBeNull();
  });
});
