import {describe, expect, test} from "vitest";

import {
  cardinalOrientationCount,
  createStableOrientationTracker,
  nearestRegripAxis,
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

  test("nearest regrip axis: picks the closest of the six quarter-turn directions", () => {
    expect(nearestRegripAxis([1, 0, 0])).toBe("x");
    expect(nearestRegripAxis([-1, 0, 0])).toBe("x'");
    expect(nearestRegripAxis([0, 1, 0])).toBe("y");
    expect(nearestRegripAxis([0, -1, 0])).toBe("y'");
    expect(nearestRegripAxis([0, 0, 1])).toBe("z");
    expect(nearestRegripAxis([0, 0, -1])).toBe("z'");
    // Off-axis but still closer to +Y than any other candidate.
    expect(nearestRegripAxis([0.3, 0.9, 0.2])).toBe("y");
  });

  test("nearest regrip axis: undefined for a near-zero axis (no real rotation)", () => {
    expect(nearestRegripAxis([0, 0, 0])).toBeNull();
  });

  test("threshold: damps out slow sensor drift instead of falsely triggering", () => {
    // 1°/s of pure heading drift, sampled once a second, for 100 seconds:
    // uncorrected this would accumulate 100° of apparent rotation from a
    // fixed baseline, comfortably past the 65° threshold, despite the cube
    // never actually moving. With the 2°/s drift follow keeping up (1°/s
    // is well within its cap), it should never fire.
    let tracker = createStableOrientationTracker(identity, "viewport", "world");
    let tokens: string[] = [];
    for (let second = 1; second <= 100; second += 1) {
      const observed = observeThresholdOrientation(tracker, x(second), "viewport", 65, second * 1000);
      tracker = observed.tracker;
      tokens.push(...observed.tokens);
    }
    expect(tokens).toEqual([]);
  });

  test("threshold: a real fast turn still fires despite the drift follow being active", () => {
    // Same slow-drift setup, but then a genuine 90° turn happens in 200ms —
    // 450°/s, vastly outrunning the 2°/s drift cap, so it must still confirm.
    let tracker = createStableOrientationTracker(identity, "viewport", "world");
    for (let second = 1; second <= 30; second += 1) {
      tracker = observeThresholdOrientation(tracker, x(second), "viewport", 65, second * 1000).tracker;
    }
    const fastTurn = observeThresholdOrientation(tracker, x(30 + 90), "viewport", 65, 30_000 + 200);
    expect(fastTurn.tokens).toEqual(["x"]);
  });

  test("threshold: catches up to a real 90°-spaced grid instead of resonating every 65°", () => {
    // A perfectly smooth, continuous 360° sweep (1°/sample). No timestamps
    // here deliberately, to isolate this from drift correction (covered by
    // its own tests above) and test pendingCarryoverDegrees in isolation.
    // Without it this fires every ~65° forever (5 times in 360°, verified as
    // a real regression before this fix); with it, each confirm's shortfall
    // carries into the next threshold check, so cumulative rotation between
    // confirms averages back out to 90° and this fires exactly 4 times — the
    // physically correct 360°/90°.
    let tracker = createStableOrientationTracker(identity, "viewport", "world");
    const firedAtDegrees: number[] = [];
    for (let degrees = 1; degrees <= 360; degrees += 1) {
      const observed = observeThresholdOrientation(tracker, x(degrees), "viewport", 65);
      tracker = observed.tracker;
      if (observed.tokens.length > 0) firedAtDegrees.push(degrees);
    }
    expect(firedAtDegrees).toEqual([65, 155, 245, 335]);
  });

  test("threshold: a genuine pause forgives stale carryover instead of hiding the next regrip", () => {
    // A turn fires at 65° (worst-case carryover, -25°), then the hand truly
    // rests — repeated samples with no rotation — for 30 seconds, plenty of
    // time for the 2°/s decay to forgive that debt, before an entirely
    // unrelated, independently imprecise 66° turn. That later turn must fire
    // on its own merits (66 > 65), not get quietly swallowed because -25° of
    // stale debt from the earlier, unrelated motion was still being carried.
    let tracker = createStableOrientationTracker(identity, "viewport", "world");
    const first = observeThresholdOrientation(tracker, x(65), "viewport", 65, 0);
    expect(first.tokens).toEqual(["x"]);
    expect(first.tracker.pendingCarryoverDegrees).toBeCloseTo(-25, 6);
    tracker = first.tracker;
    for (let second = 1; second <= 30; second += 1) {
      tracker = observeThresholdOrientation(tracker, x(65), "viewport", 65, second * 1000).tracker;
    }
    expect(tracker.pendingCarryoverDegrees).toBeCloseTo(0, 6);
    const second = observeThresholdOrientation(tracker, x(65 + 66), "viewport", 65, 30_100);
    expect(second.tokens).toEqual(["x"]);
  });

  test("threshold: reports the raw angle that triggered (or fell short of) a confirm", () => {
    const tracker = createStableOrientationTracker(identity, "viewport", "world");
    const below = observeThresholdOrientation(tracker, x(40), "viewport", 65);
    expect(below.angleDegrees).toBeCloseTo(40, 6);
    const confirmed = observeThresholdOrientation(tracker, x(70), "viewport", 65);
    expect(confirmed.angleDegrees).toBeCloseTo(70, 6);
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
