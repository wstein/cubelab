import {describe, expect, test} from "vitest";

import {
  cardinalOrientationCount,
  createStableOrientationTracker,
  nearestCardinalOrientation,
  observeStableOrientation,
  settleStableOrientation,
} from "../../../src/client/smart-cube/orientation-tracker";

const identity = {x: 0, y: 0, z: 0, w: 1};
const x = (degrees: number) => ({x: Math.sin(degrees * Math.PI / 360), y: 0, z: 0, w: Math.cos(degrees * Math.PI / 360)});

describe("stable smart-cube orientation tracker", () => {
  test("enumerates the cube's complete 24-pose cardinal rotation group", () => {
    expect(cardinalOrientationCount).toBe(24);
  });

  test("snaps a badly aligned pose to its nearest of the 24 cardinal poses", () => {
    const nearIdentity = x(20);
    expect(nearestCardinalOrientation(nearIdentity)).toEqual(identity);

    const nearQuarterX = x(70);
    const quarterX = {x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2};
    const snapped = nearestCardinalOrientation(nearQuarterX);
    expect(snapped.x).toBeCloseTo(quarterX.x);
    expect(snapped.w).toBeCloseTo(quarterX.w);
  });

  test("never snaps further than the worst-case covering radius of the rotation group", () => {
    for (let degrees = 0; degrees <= 180; degrees += 5) {
      const nearest = nearestCardinalOrientation(x(degrees));
      const dot = Math.abs(x(degrees).x * nearest.x + x(degrees).w * nearest.w);
      const distanceDegrees = 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
      expect(distanceDegrees).toBeLessThanOrEqual(63);
    }
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
