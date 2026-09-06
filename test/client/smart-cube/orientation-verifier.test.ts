import {describe, expect, test} from "vitest";

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
    // Pitch forward (X = 1): negative degrees on X (clockwise around +X)
    expect(assessGyroRotation(identity, rotation("X", -75), "viewport", "X", 1).matched)
      .toBe(true);
    expect(assessGyroRotation(identity, rotation("X", 75), "viewport", "X", 1).matched)
      .toBe(false);
    expect(assessGyroRotation(identity, rotation("Y", -90), "viewport", "X", 1).matched)
      .toBe(false);
    // Yaw left (Y = 1): negative degrees on Y (clockwise around +Y)
    expect(assessGyroRotation(identity, rotation("Y", -75), "viewport", "Y", 1).matched)
      .toBe(true);
    // Roll clockwise (Z = 1): negative degrees on Z (clockwise around +Z)
    expect(assessGyroRotation(identity, rotation("Z", -70), "viewport", "Z", 1).matched)
      .toBe(true);
    // Roll counter-clockwise (Z = -1): positive degrees on Z
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

  test("accurately verifies rotations in gocube-wire frame across all axes", () => {
    const half = Math.sqrt(0.5);
    // gocube-wire's axis mapping (see deviceOrientationDelta's "gocube-wire"
    // branch) is a same-axis sign flip on X and Z only, Y unchanged — not a
    // permutation. Verified directly against a live hardware test: 180° CW
    // then CCW turns around each of the three BOY-corner axes (White/Red/
    // Green) on a real GoCube.
    expect(assessGyroRotation(identity, {x: -half, y: 0, z: 0, w: half}, "gocube-wire", "X", -1).matched)
      .toBe(true);
    expect(assessGyroRotation(identity, {x: 0, y: half, z: 0, w: half}, "gocube-wire", "Y", -1).matched)
      .toBe(true);
    expect(assessGyroRotation(identity, {x: 0, y: 0, z: -half, w: half}, "gocube-wire", "Z", -1).matched)
      .toBe(true);
  });

  test("accurately verifies rotations in gan-wire frame across all axes", () => {
    const half = Math.sqrt(0.5);
    // GAN wire: +X is Red (Right), +Y is Blue (Back), +Z is White (Up)
    // 1. R rotation (around Red/+X_gan): x is negative for clockwise x
    expect(assessGyroRotation(identity, {x: -half, y: 0, z: 0, w: half}, "gan-wire", "X", 1).matched)
      .toBe(true);
    // 2. U rotation (around White/+Z_gan): z is negative for clockwise y
    expect(assessGyroRotation(identity, {x: 0, y: 0, z: -half, w: half}, "gan-wire", "Y", 1).matched)
      .toBe(true);
    // 3. F rotation (around Green/-Y_gan): y is positive for clockwise z
    expect(assessGyroRotation(identity, {x: 0, y: half, z: 0, w: half}, "gan-wire", "Z", 1).matched)
      .toBe(true);
  });

  test("verifies sequential local rotations from an arbitrary base pose", () => {
    const half = Math.sqrt(0.5);
    const basePose = {x: -half, y: 0, z: 0, w: half}; // after an X rotation
    // User performs local Y rotation on the cube:
    const rotY = {x: 0, y: -half, z: 0, w: half};
    const currentPose = multiplyQuaternions(basePose, rotY);
    expect(assessGyroRotation(basePose, currentPose, "viewport", "Y", 1, "local").matched)
      .toBe(true);
    expect(assessGyroRotation(basePose, currentPose, "viewport", "X", 1, "local").matched)
      .toBe(false);
  });
});
