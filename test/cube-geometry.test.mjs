import assert from "node:assert/strict";
import { test } from "vitest";

import * as CubeGeometry from "../src/Render/CubeGeometry.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const generated = (state, style = "Standard", palette = "Western") => {
  const result = CubeGeometry.generate(state, style, palette);
  assert.equal(result.TAG, "Ok", result._0);
  return result._0;
};

test("geometry is deterministic and interleaves material and cubie animation metadata", () => {
  for (const size of [2, 3, 4, 5]) {
    const state = StateTypes.solved(size)._0;
    for (const style of ["Standard", "Speed", "Ice"]) {
      const one = generated(state, style);
      const two = generated(state, style);
      assert.equal(one.stride, 14);
      assert.equal(one.data.length, one.vertexCount * one.stride);
      assert.deepEqual(one, two);
      assert.ok(one.vertexCount > 0);
      assert.equal(one.nearStickerVertexCount + one.iceBodyVertexCount, one.vertexCount);
      for (const value of one.data) assert.ok(Number.isFinite(value));
    }
  }
});

test("ice keeps opaque local stickers over a colourless outer shell", () => {
  const ice = generated(StateTypes.solved(3)._0, "Ice");
  assert.ok(ice.nearStickerVertexCount > 0);
  assert.ok(ice.iceBodyVertexCount > 0);
  const shellOffset = ice.nearStickerVertexCount * ice.stride;
  const shellAlpha = ice.data.slice(shellOffset).filter((_, index) => index % ice.stride === 9);
  assert.ok(shellAlpha.length > 0);
  assert.ok(shellAlpha.every((alpha) => alpha > 0 && alpha < 1));
  const stickerAlpha = ice.data.slice(0, shellOffset).filter((_, index) => index % ice.stride === 9);
  assert.deepEqual([...new Set(stickerAlpha)], [1]);
  assert.ok(ice.iceBodyVertexCount > 0);
});

test("ice reuses Standard's exposed beveled outline without internal glass planes", () => {
  const standard = generated(StateTypes.solved(3)._0, "Standard");
  const ice = generated(StateTypes.solved(3)._0, "Ice");
  const bodyPositions = (mesh, isBody) => {
    const positions = new Set();
    for (let index = 0; index < mesh.data.length; index += mesh.stride) {
      if (!isBody(mesh.data, index)) continue;
      positions.add(mesh.data.slice(index, index + 3).map((value) => value.toFixed(8)).join(","));
    }
    return [...positions].sort();
  };
  const standardOutline = bodyPositions(
    standard,
    (data, index) => data[index + 6] === 0.13 && data[index + 7] === 0.14 && data[index + 8] === 0.17,
  );
  const iceOutline = bodyPositions(ice, (data, index) => data[index + 9] < 1);
  assert.ok(standardOutline.length > 0);
  const standardOutlineSet = new Set(standardOutline);
  assert.ok(iceOutline.length < standardOutline.length);
  assert.ok(iceOutline.every((position) => standardOutlineSet.has(position)));
});

test("speed geometry has rolled edges while Standard has lifted stickers", () => {
  const state = StateTypes.solved(3)._0;
  const standard = generated(state, "Standard");
  const speed = generated(state, "Speed");
  assert.ok(speed.vertexCount > standard.vertexCount);

  const standardPositions = standard.data.filter((_, index) => index % standard.stride < 3);
  const speedPositions = speed.data.filter((_, index) => index % speed.stride < 3);
  assert.ok(Math.max(...standardPositions.map(Math.abs)) > 1.5);
  assert.ok(Math.max(...speedPositions.map(Math.abs)) <= 1.5);
  assert.ok(speed.data.some((value, index) => index % speed.stride === 13 && value > 0));
  assert.ok(standard.data.every((value, index) => index % standard.stride !== 13 || value === 0));
});

test("every vertex carries the centre of its owning cubie", () => {
  const mesh = generated(StateTypes.solved(3)._0, "Speed");
  const allowed = new Set([-1, 0, 1]);
  for (let index = 0; index < mesh.data.length; index += mesh.stride) {
    const centre = mesh.data.slice(index + 10, index + 13);
    assert.equal(centre.length, 3);
    assert.ok(centre.every((coordinate) => allowed.has(coordinate)));
  }
});

test("geometry preserves positions while recolouring a changed cube state", () => {
  const solved = StateTypes.solved(3)._0;
  const turnedResult = MoveExecutor.parseAndApply(3, "R U F");
  assert.equal(turnedResult.TAG, "Ok");
  const one = generated(solved, "Standard");
  const two = generated(turnedResult._0, "Standard");
  assert.equal(one.vertexCount, two.vertexCount);

  let changedColours = 0;
  for (let index = 0; index < one.data.length; index += one.stride) {
    assert.deepEqual(one.data.slice(index, index + 6), two.data.slice(index, index + 6));
    if (!one.data.slice(index + 6, index + 9).every((value, offset) => value === two.data[index + 6 + offset])) {
      changedColours += 1;
    }
  }
  assert.ok(changedColours > 0);
});

test("Japanese palette swaps the front and back colour assignments", () => {
  const state = StateTypes.solved(3)._0;
  const western = generated(state, "Standard", "Western");
  const japanese = generated(state, "Standard", "Japanese");
  assert.notDeepEqual(western.data, japanese.data);
  assert.equal(western.vertexCount, japanese.vertexCount);
});

test("geometry rejects malformed cube states", () => {
  const invalid = CubeGeometry.generate({ size: 3, facelets: [] }, "Standard", "Western");
  assert.equal(invalid.TAG, "Error");
  assert.match(invalid._0, /six faces/);
});

test("sticker bounds increase gap on outer edges and enlarge outer corner radius", () => {
  const cell = 1.0;
  // 3x3 U face (gy = 2, face = U)
  // Center cubie (gx = 1, gz = 1)
  const centerBounds = CubeGeometry.stickerBoundsForFace(2, 1, 2, 1, cell, "U");
  assert.equal(centerBounds.maxU, 0.42);
  assert.equal(centerBounds.minU, -0.42);
  assert.equal(centerBounds.maxV, 0.42);
  assert.equal(centerBounds.minV, -0.42);
  assert.equal(centerBounds.r0, 0.065);
  assert.equal(centerBounds.r1, 0.065);
  assert.equal(centerBounds.r2, 0.065);
  assert.equal(centerBounds.r3, 0.065);

  // Edge cubie (gx = 1, gz = 2, U/F edge)
  const edgeBounds = CubeGeometry.stickerBoundsForFace(2, 1, 2, 2, cell, "U");
  // F face is +v direction on U face, so maxV is outer edge (0.380)
  assert.equal(edgeBounds.maxV, 0.38);
  assert.equal(edgeBounds.minV, -0.42);
  assert.equal(edgeBounds.maxU, 0.42);
  assert.equal(edgeBounds.minU, -0.42);
  // Outer-facing corners have hybrid radius 0.078
  assert.equal(edgeBounds.r0, 0.078);
  assert.equal(edgeBounds.r1, 0.078);
  assert.equal(edgeBounds.r2, 0.065);
  assert.equal(edgeBounds.r3, 0.065);

  // Corner cubie (gx = 2, gz = 2, U/R/F corner)
  const cornerBounds = CubeGeometry.stickerBoundsForFace(2, 2, 2, 2, cell, "U");
  assert.equal(cornerBounds.maxU, 0.38);
  assert.equal(cornerBounds.maxV, 0.38);
  assert.equal(cornerBounds.minU, -0.42);
  assert.equal(cornerBounds.minV, -0.42);
  // Corner 0 is outer-outer corner (+u, +v) and has enlarged outer corner radius (0.100)
  assert.equal(cornerBounds.r0, 0.100);
  assert.equal(cornerBounds.r1, 0.078);
  assert.equal(cornerBounds.r2, 0.065);
  assert.equal(cornerBounds.r3, 0.078);
});

test("speed cube bevel uses increased 0.06 fase on all edges", () => {
  const cell = 1.0;
  // All edges on speed cube have increased 0.06 * cell fase across both inner and outer edges
  const outerBevel = CubeGeometry.speedBevelForEdge(2, 2, 2, 2, cell, "U", "R");
  assert.equal(outerBevel, 0.06);

  const innerBevel = CubeGeometry.speedBevelForEdge(2, 1, 2, 1, cell, "U", "R");
  assert.equal(innerBevel, 0.06);
});

test("speed cube inner phases are completely colorful with face color", () => {
  const state = StateTypes.solved(2)._0;
  const speed = CubeGeometry.generate(state, "Speed", "Western");
  assert.equal(speed.TAG, "Ok");
  const mesh = speed._0;
  // Check that on front-facing surfaces (z > 1.0, nz > 0.1), all vertices have non-body color (not black body)
  let frontVertices = 0;
  let bodyVerticesOnFront = 0;
  for (let i = 0; i < mesh.data.length; i += mesh.stride) {
    const z = mesh.data[i + 2];
    const nz = mesh.data[i + 5];
    const r = mesh.data[i + 6];
    const g = mesh.data[i + 7];
    const b = mesh.data[i + 8];
    if (z > 1.0 && nz > 0.1) {
      frontVertices++;
      if (Math.abs(r - 0.13) < 0.05 && Math.abs(g - 0.14) < 0.05 && Math.abs(b - 0.17) < 0.05) {
        bodyVerticesOnFront++;
      }
    }
  }
  assert.ok(frontVertices > 0);
  assert.equal(bodyVerticesOnFront, 0);
});
