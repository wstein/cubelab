import {describe, expect, test} from "vitest";

import {
  cardinalOrientationCount,
  createStableOrientationTracker,
  observeStableOrientation,
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
});
