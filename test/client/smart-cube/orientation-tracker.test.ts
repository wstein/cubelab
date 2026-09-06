import {describe, expect, test} from "vitest";

import {
  cardinalOrientationCount,
  createStableOrientationTracker,
  observeStableOrientation,
  observeThresholdOrientation,
  settleStableOrientation,
} from "../../../src/client/smart-cube/orientation-tracker";

const identity = {x: 0, y: 0, z: 0, w: 1};
const x = (degrees: number) => ({x: Math.sin(degrees * Math.PI / 360), y: 0, z: 0, w: Math.cos(degrees * Math.PI / 360)});

describe("stable smart-cube orientation tracker", () => {
  test("enumerates the cube's complete 24-pose cardinal rotation group", () => {
    expect(cardinalOrientationCount).toBe(24);
  });

  test("waits for a settled cardinal pose instead of committing at 65 degrees", () => {
    let tracker = createStableOrientationTracker(identity, "viewport");
    for (const degrees of [65, 72, 78]) {
      const observed = observeStableOrientation(tracker, x(degrees), "viewport");
      tracker = observed.tracker;
      expect(observed.tokens).toEqual([]);
    }
    const first = observeStableOrientation(tracker, x(90), "viewport");
    const second = observeStableOrientation(first.tracker, x(90), "viewport");
    const settled = observeStableOrientation(second.tracker, x(90), "viewport");
    expect(settled.tokens).toEqual(["x"]);
  });

  test("confirms a single sample immediately when the gate and dwell are disabled", () => {
    const tracker = createStableOrientationTracker(identity, "viewport", "world");
    const badlyAligned = x(70);
    const resolved = observeStableOrientation(tracker, badlyAligned, "viewport", -1, 1);
    expect(resolved.tokens).toEqual(["x"]);
    expect(resolved.tracker.baseline).toEqual(badlyAligned);
  });

  test("preserves the local delta frame across a confirmed turn", () => {
    let tracker = createStableOrientationTracker(identity, "viewport", "local");
    for (let sample = 0; sample < 3; sample += 1) {
      tracker = observeStableOrientation(tracker, x(90), "viewport").tracker;
    }
    expect(tracker.deltaFrame).toBe("local");
  });

  test("rebases each accepted turn so small heading bias cannot accumulate", () => {
    let tracker = createStableOrientationTracker(identity, "viewport");
    let currentDegrees = 0;
    const tokens: string[] = [];
    for (let turn = 0; turn < 10; turn += 1) {
      currentDegrees += 92.5;
      for (let sample = 0; sample < 3; sample += 1) {
        const observed = observeStableOrientation(tracker, x(currentDegrees), "viewport");
        tracker = observed.tracker;
        tokens.push(...observed.tokens);
      }
    }
    expect(tokens).toEqual(Array(10).fill("x"));
  });

  test("threshold: ignores rotation below the minimum, no dwell required", () => {
    const tracker = createStableOrientationTracker(identity, "viewport", "world");
    const below = observeThresholdOrientation(tracker, x(60), "viewport", 65);
    expect(below.tokens).toEqual([]);
    expect(below.tracker.baseline).toEqual(identity);
  });

  test("threshold: confirms from a single sample the instant the threshold is crossed", () => {
    const tracker = createStableOrientationTracker(identity, "viewport", "world");
    const resolved = observeThresholdOrientation(tracker, x(66), "viewport", 65);
    expect(resolved.tokens).toEqual(["x"]);
  });

  test("threshold: resolves to the nearest cardinal without requiring precision", () => {
    // 78° is 12° short of a clean 90° turn, well outside observeStableOrientation's
    // 5° gate, but past the 65° threshold and still unambiguously closer to the
    // 90° neighbour than to identity (45° would be the ambiguous midpoint).
    const tracker = createStableOrientationTracker(identity, "viewport", "world");
    const resolved = observeThresholdOrientation(tracker, x(78), "viewport", 65);
    expect(resolved.tokens).toEqual(["x"]);
  });

  test("threshold: rebases to the triggering sample so it does not immediately refire", () => {
    const tracker = createStableOrientationTracker(identity, "viewport", "world");
    const first = observeThresholdOrientation(tracker, x(90), "viewport", 65);
    expect(first.tokens).toEqual(["x"]);
    const second = observeThresholdOrientation(first.tracker, x(91), "viewport", 65);
    expect(second.tokens).toEqual([]);
  });

  test("threshold: composes each confirmed step onto the running orientation", () => {
    let tracker = createStableOrientationTracker(identity, "viewport", "world");
    let currentDegrees = 0;
    const tokens: string[] = [];
    for (let turn = 0; turn < 4; turn += 1) {
      currentDegrees += 90;
      const observed = observeThresholdOrientation(tracker, x(currentDegrees), "viewport", 65);
      tracker = observed.tracker;
      tokens.push(...observed.tokens);
    }
    expect(tokens).toEqual(["x", "x", "x", "x"]);
    // A full 360° turn is identity up to quaternion double-cover (w may be -1).
    expect(Math.abs(tracker.orientation.w)).toBeCloseTo(1);
  });

  test("uses an independently settled anchor to accept a delayed half-turn regrip", () => {
    const tracker = createStableOrientationTracker(identity, "viewport");
    const x2 = {x: 1, y: 0, z: 0, w: 0};
    const settled = settleStableOrientation(tracker, x2, "viewport");
    expect(settled.tokens).toEqual(["x", "x"]);
    expect(settled.tracker.orientation).toEqual(x2);
    expect(settled.tracker.baseline).toEqual(x2);
  });

  test("can use a device anchor's 25-degree verified-still tolerance for an imprecise half-turn", () => {
    const tracker = createStableOrientationTracker(identity, "viewport");
    const nearX2 = x(163);
    expect(settleStableOrientation(tracker, nearX2, "viewport").tokens).toEqual([]);
    const settled = settleStableOrientation(
      tracker,
      nearX2,
      "viewport",
      Math.cos(25 * Math.PI / 360),
    );
    expect(settled.tokens).toEqual(["x", "x"]);
  });

});
