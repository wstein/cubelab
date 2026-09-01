import {describe, expect, test} from "bun:test";

import {
  assessGyroRotation,
  detectGyroQuarterRotation,
} from "../../../src/client/smart-cube/orientation-verifier";
import {multiplyQuaternions} from "../../../src/client/cube-gl";

const rotation = (axis: "X" | "Y" | "Z", degrees: number) => {
  const radians = degrees * Math.PI / 180;
  const sine = Math.sin(radians / 2);
  return {
    x: axis === "X" ? sine : 0,
    y: axis === "Y" ? sine : 0,
    z: axis === "Z" ? sine : 0,
    w: Math.cos(radians / 2),
  };
};

describe("smart-cube gyro rotation feedback", () => {
  const identity = {x: 0, y: 0, z: 0, w: 1};

  test("matches the requested quarter-turn axis and direction", () => {
    expect(assessGyroRotation(identity, rotation("X", -75), "viewport", "X", 1).matched)
      .toBe(true);
    expect(assessGyroRotation(identity, rotation("X", 75), "viewport", "X", 1).matched)
      .toBe(false);
    expect(assessGyroRotation(identity, rotation("Y", -90), "viewport", "X", 1).matched)
      .toBe(false);
    expect(assessGyroRotation(identity, rotation("Z", 70), "viewport", "Z", -1).matched)
      .toBe(true);
  });

  test("accepts a half turn in either direction", () => {
    expect(assessGyroRotation(identity, rotation("Y", 150), "viewport", "Y", 2).matched)
      .toBe(true);
    expect(assessGyroRotation(identity, rotation("Y", -150), "viewport", "Y", 2).matched)
      .toBe(true);
    expect(assessGyroRotation(identity, rotation("Y", 110), "viewport", "Y", 2).matched)
      .toBe(false);
    expect(assessGyroRotation(identity, rotation("Y", 110), "viewport", "Y", 2).partial)
      .toBe(true);
    expect(assessGyroRotation(identity, rotation("Y", 40), "viewport", "Y", 2).partial)
      .toBe(false);
  });

  test("uses cube-local deltas after an arbitrary prior regrip", () => {
    const base = rotation("X", -90);
    const current = multiplyQuaternions(base, rotation("Z", -90));
    expect(assessGyroRotation(base, current, "viewport", "Z", 1, "local").matched)
      .toBe(true);
    expect(assessGyroRotation(base, current, "viewport", "Y", 1, "local").matched)
      .toBe(false);
  });

  test("detects a wrong-axis regrip so the caller can silently rebase", () => {
    expect(detectGyroQuarterRotation(
      identity,
      rotation("Y", -80),
      "viewport",
    )).toEqual({axis: "Y", turns: 1});
    expect(detectGyroQuarterRotation(
      identity,
      rotation("Y", -30),
      "viewport",
    )).toBeNull();
  });
});
