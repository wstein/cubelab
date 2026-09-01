import {describe, expect, test} from "bun:test";

import {cameraMatrices, turnTransform, type MoveStep} from "../../src/client/cube-gl";
import {
  cubieIsFrontFacing,
  motionLabel,
  pieceColourLabel,
  projectPoint,
  turnArcPoints,
} from "../../src/client/motion-overlay";

describe("projected motion overlay math", () => {
  const matrices = cameraMatrices(4 / 3, -0.62, 0.48, 7.2);

  test("projects the cube origin into the viewport centre", () => {
    const projected = projectPoint([0, 0, 0], matrices.modelView, matrices.projection, 800, 600);
    expect(projected.x).toBeCloseTo(400);
    expect(projected.y).toBeCloseTo(300);
    expect(projected.inFront).toBe(true);
  });

  test("classifies exposed cubies against the live camera", () => {
    expect(cubieIsFrontFacing([1, 1, 1], matrices.modelView)).toBe(true);
    expect(cubieIsFrontFacing([-1, -1, -1], matrices.modelView)).toBe(false);
  });

  test("builds a face-anchored directional turn ring", () => {
    const step: MoveStep = {
      move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}},
      turns: 1,
    };
    const transform = turnTransform(3, step)!;
    const points = turnArcPoints(transform, step);
    expect(points).toHaveLength(44);
    expect(points.every(([x]) => Math.abs(x - 1.62) < 0.0001)).toBe(true);
    expect(points[0]).not.toEqual(points.at(-1));
    expect(motionLabel("R", step)).toBe("R · 90° CW");
    expect(motionLabel("R'", {...step, turns: -1})).toBe("R' · 90° CCW");
  });

  test("names focused pieces using the active colour scheme", () => {
    expect(pieceColourLabel("DFR", "Western")).toBe("yellow–green–red");
    expect(pieceColourLabel("DFR", "Japanese")).toBe("yellow–blue–red");
  });
});
