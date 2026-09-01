import {describe, expect, test} from "bun:test";

import * as CubeGeometry from "../../src/Render/CubeGeometry.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {cameraMatrices, clampedCanvasSize, vboCapacityFloats} from "../../src/client/cube-gl";

describe("cube viewport math", () => {
  test("preallocates enough VBO space as cube sizes increase", () => {
    const capacities = [2, 3, 4, 5].map(vboCapacityFloats);
    expect(capacities.every((value) => value > 0)).toBe(true);
    expect(capacities).toEqual([...capacities].sort((a, b) => a - b));
    expect(capacities.every((value) => value % 10 === 0)).toBe(true);
    for (const size of [2, 3, 4, 5]) {
      const generated = CubeGeometry.generate(StateTypes.solved(size)._0, "Speed", "Western");
      expect(generated.TAG).toBe("Ok");
      if (generated.TAG === "Ok") {
        expect(generated._0.data.length).toBeLessThanOrEqual(vboCapacityFloats(size));
      }
    }
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
});
