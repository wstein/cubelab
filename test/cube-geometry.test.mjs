import assert from "node:assert/strict";
import {test} from "vitest";

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
    for (const style of ["Standard", "Speed"]) {
      const one = generated(state, style);
      const two = generated(state, style);
      assert.equal(one.stride, 14);
      assert.equal(one.data.length, one.vertexCount * one.stride);
      assert.deepEqual(one, two);
      assert.ok(one.vertexCount > 0);
      for (const value of one.data) assert.ok(Number.isFinite(value));
    }
  }
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
  const invalid = CubeGeometry.generate({size: 3, facelets: []}, "Standard", "Western");
  assert.equal(invalid.TAG, "Error");
  assert.match(invalid._0, /six faces/);
});
