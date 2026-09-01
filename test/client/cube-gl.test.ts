import {describe, expect, test} from "bun:test";

import * as CubeGeometry from "../../src/Render/CubeGeometry.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {
  autoOrbitYawDelta,
  cameraTween,
  cameraMatrices,
  clampedCanvasSize,
  turnTransform,
  turnPreviewTransform,
  turnPreviewCamera,
  vboCapacityFloats,
} from "../../src/client/cube-gl";

describe("cube viewport math", () => {
  test("advances auto orbit at a stable speed and clamps resumed frames", () => {
    expect(autoOrbitYawDelta(0)).toBe(0);
    expect(autoOrbitYawDelta(25)).toBeCloseTo(0.006);
    expect(autoOrbitYawDelta(1_000)).toBeCloseTo(0.012);
    expect(autoOrbitYawDelta(-10)).toBe(0);
  });

  test("preallocates enough VBO space as cube sizes increase", () => {
    const capacities = [2, 3, 4, 5].map(vboCapacityFloats);
    expect(capacities.every((value) => value > 0)).toBe(true);
    expect(capacities).toEqual([...capacities].sort((a, b) => a - b));
    expect(capacities.every((value) => value % 14 === 0)).toBe(true);
    for (const size of [2, 3, 4, 5]) {
      const generated = CubeGeometry.generate(StateTypes.solved(size)._0, "Speed", "Western");
      expect(generated.TAG).toBe("Ok");
      if (generated.TAG === "Ok") {
        expect(generated._0.data.length).toBeLessThanOrEqual(vboCapacityFloats(size));
      }
    }
  });

  test("maps logical face, slice, range, and rotation moves to shader transforms", () => {
    const right = turnTransform(3, {
      move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}},
      turns: 1,
    });
    expect(right?.axis).toEqual([1, 0, 0]);
    expect(right?.min).toBeCloseTo(0.9);
    expect(right?.max).toBeCloseTo(1.1);
    expect(right?.angle).toBeCloseTo(-Math.PI / 2);

    const range = turnTransform(5, {
      move: {TAG: "FaceTurn", _0: "R", _1: {from_: 2, to_: 3}},
      turns: 2,
    });
    expect(range?.min).toBeCloseTo(-0.06);
    expect(range?.max).toBeCloseTo(0.66);
    expect(range?.angle).toBeCloseTo(-Math.PI);

    expect(turnTransform(3, {move: {TAG: "SliceTurn", _0: "M"}, turns: 1})).toMatchObject({
      axis: [1, 0, 0],
      angle: Math.PI / 2,
    });
    expect(turnTransform(3, {move: {TAG: "Rotation", _0: "Y"}, turns: -1})).toEqual({
      axis: [0, 1, 0],
      min: -2,
      max: 2,
      angle: Math.PI / 2,
    });
  });

  test("previews every move direction with a fixed four-degree layer displacement", () => {
    const clockwise = turnPreviewTransform({axis: [1, 0, 0], min: 0.9, max: 1.1, angle: -Math.PI});
    const counterclockwise = turnPreviewTransform({
      axis: [1, 0, 0],
      min: 0.9,
      max: 1.1,
      angle: Math.PI / 2,
    });
    expect(clockwise.angle).toBeCloseTo(-4 * Math.PI / 180);
    expect(counterclockwise.angle).toBeCloseTo(4 * Math.PI / 180);
  });

  test("reframes turn previews to an oblique view of the involved layer", () => {
    const right = turnPreviewCamera({axis: [1, 0, 0], min: 0.9, max: 1.1, angle: -Math.PI / 2});
    const down = turnPreviewCamera({axis: [0, -1, 0], min: 0.9, max: 1.1, angle: -Math.PI / 2});
    expect(right.yaw).toBeLessThan(0);
    expect(right.pitch).toBeGreaterThan(0);
    expect(down.pitch).toBeLessThan(0);
    expect([right.yaw, right.pitch, down.yaw, down.pitch].every(Number.isFinite)).toBe(true);
  });

  test("clamps device pixel ratio without producing zero-sized canvases", () => {
    expect(clampedCanvasSize(0, 0, 3)).toEqual([1, 1]);
    expect(clampedCanvasSize(320, 240, 1)).toEqual([320, 240]);
    expect(clampedCanvasSize(320, 240, 3)).toEqual([640, 480]);
  });

  test("camera matrices remain finite for supported viewport shapes", () => {
    for (const aspect of [0.5, 1, 4 / 3, 2]) {
      const matrices = cameraMatrices(aspect, -0.62, -0.48, 6.4);
      expect(matrices.modelView).toHaveLength(16);
      expect(matrices.projection).toHaveLength(16);
      expect([...matrices.modelView, ...matrices.projection].every(Number.isFinite)).toBe(true);
    }
  });

  test("camera tween follows the shortest wrapped route with smooth endpoints", () => {
    expect(cameraTween(0, 1, 0)).toBe(0);
    expect(cameraTween(0, 1, 1)).toBeCloseTo(1);
    expect(cameraTween(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI);
  });
});
