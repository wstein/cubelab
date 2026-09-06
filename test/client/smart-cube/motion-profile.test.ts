import {describe, expect, test} from "vitest";

import {defaultMotionProfile, motionProfileFor, parseMotionProfileRegistry} from "../../../src/client/smart-cube/motion-profile";

describe("smart-cube motion profiles", () => {
  test("selects a validated device override and keeps a conservative fallback", () => {
    const registry = parseMotionProfileRegistry({
      version: 1,
      default: defaultMotionProfile,
      profiles: {gocube: {...defaultMotionProfile, label: "GoCube", maximumAnchorDeviationDegrees: 25, maximumCorrectionStepDegrees: 1, correctionResponsiveness: 1}},
    });
    expect(motionProfileFor(registry, "gocube").maximumAnchorDeviationDegrees).toBe(25);
    expect(motionProfileFor(registry, "gocube").maximumCorrectionStepDegrees).toBe(1);
    expect(motionProfileFor(registry, "gocube").anchorWindowMs).toBe(200);
    expect(motionProfileFor(registry, "gocube").maximumPostTurnDeviationDegrees).toBe(10);
    expect(motionProfileFor(registry, "gocube").correctionResponsiveness).toBe(1);
    expect(motionProfileFor(registry, "gocube").maximumTargetErrorDegrees).toBe(30);
    expect(motionProfileFor(registry, "gan")).toEqual(defaultMotionProfile);
  });

  test("rejects malformed server data", () => {
    expect(parseMotionProfileRegistry({version: 1, default: {label: "bad"}, profiles: {}})).toBeNull();
  });
});
