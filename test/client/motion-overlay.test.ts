import {describe, expect, test} from "bun:test";

import {cameraMatrices, turnTransform, type MoveStep} from "../../src/client/cube-gl";
import {
  cubieFaceOutline,
  cubieSurfaceAnchor,
  cubieIsFrontFacing,
  motionLabel,
  pieceColourLabel,
  projectPoint,
  surfaceFacingScore,
  turnArcPoints,
  turnFaceNormal,
  turnSurfaceArrowPaths,
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
    const anchor = cubieSurfaceAnchor([1, 1, 1], matrices.modelView);
    expect(anchor.visible).toBe(true);
    expect(anchor.point.filter((coordinate) => Math.abs(coordinate) > 1.5)).toHaveLength(1);
    const outline = cubieFaceOutline([1, 1, 1], matrices.modelView);
    expect(outline).toHaveLength(4);
    expect(outline.every((point) =>
      point.some((coordinate, axis) => Math.abs(coordinate - anchor.point[axis]) < 0.0001)
    )).toBe(true);
  });

  test("builds a face-plane directional turn arrow", () => {
    const step: MoveStep = {
      move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}},
      turns: 1,
    };
    const transform = turnTransform(3, step)!;
    const points = turnArcPoints(transform, step);
    expect(points).toHaveLength(44);
    expect(points.every(([x]) => Math.abs(x - 1.76) < 0.0001)).toBe(true);
    expect(points[0]).not.toEqual(points.at(-1));
    expect(motionLabel("R", step)).toBe("R · 90° CW");
    expect(motionLabel("R'", {...step, turns: -1})).toBe("R' · 90° CCW");
  });

  test("locks opposite-face arrows to their guide planes and sticker surfaces", () => {
    const left: MoveStep = {
      move: {TAG: "FaceTurn", _0: "L", _1: {from_: 1, to_: 1}},
      turns: 2,
    };
    const transform = turnTransform(3, left)!;
    const ring = turnArcPoints(transform, left);
    const surfaceArrows = turnSurfaceArrowPaths(transform, left);
    expect(turnFaceNormal(left)).toEqual([-1, 0, 0]);
    expect(ring.every(([x]) => Math.abs(x + 1.76) < 0.0001)).toBe(true);
    expect(surfaceArrows).toHaveLength(4);
    expect(surfaceArrows.every(({normal, points}) => points.every((point) =>
      Math.abs(point[normal.findIndex((value) => value !== 0)] - 1.505 * normal.find((value) => value !== 0)!) < 0.0001
    ))).toBe(true);
    expect(Math.max(...surfaceArrows.map(({normal, points}) =>
      surfaceFacingScore(normal, points[Math.floor(points.length / 2)], matrices.modelView)
    ))).toBeGreaterThan(0);
  });

  test("names focused pieces using the active colour scheme", () => {
    expect(pieceColourLabel("DFR", "Western")).toBe("yellow–green–red");
    expect(pieceColourLabel("DFR", "Japanese")).toBe("yellow–blue–red");
  });
});
