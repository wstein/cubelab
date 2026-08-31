import assert from "node:assert/strict";
import test from "node:test";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const apply = (size, algorithm) => {
  const result = MoveExecutor.parseAndApply(size, algorithm);
  assert.equal(result.TAG, "Ok", result._0);
  return result._0;
};

const compact = (size, algorithm) => FaceletCodec.render(apply(size, algorithm));
const solved = (size) => FaceletCodec.render(StateTypes.solved(size)._0);

test("each outer move has order four on every supported cube size", () => {
  for (const size of [2, 3, 4, 5]) {
    for (const move of ["U", "R", "F", "D", "L", "B"]) {
      assert.equal(compact(size, `${move} ${move} ${move} ${move}`), solved(size));
    }
  }
});

test("move suffixes and inverses produce equivalent states", () => {
  assert.equal(compact(3, "R2"), compact(3, "R R"));
  assert.equal(compact(3, "R'"), compact(3, "R R R"));
  assert.equal(compact(3, "R U F F' U' R'"), solved(3));
  assert.equal(compact(5, "3Uw2"), compact(5, "3Uw 3Uw"));
});

test("U uses the declared fixed-frame face orientation", () => {
  assert.equal(
    compact(3, "U"),
    "UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB",
  );
});

test("groups, commutators, and conjugates execute their algebraic identities", () => {
  assert.equal(compact(3, "(R U R' U')6"), solved(3));
  assert.equal(compact(3, "[R, U]"), compact(3, "R U R' U'"));
  assert.equal(compact(3, "[R: U2]"), compact(3, "R U2 R'"));
  assert.equal(compact(3, "[R, U]'"), compact(3, "[U, R]"));
});

test("wide, slice, inner-layer, and rotation moves are internally consistent", () => {
  assert.equal(compact(3, "Rw"), compact(3, "R M'"));
  assert.equal(compact(3, "M M M M"), solved(3));
  assert.equal(compact(4, "2-3Rw 2-3Rw'"), solved(4));
  assert.equal(compact(5, "2R 2R' 3Fw 3Fw'"), solved(5));
  assert.equal(compact(3, "x x x x y y y y z z z z"), solved(3));
});

test("slice turns and rotations carry centre stickers through their geometric layers", () => {
  const centreIndices = [4, 13, 22, 31, 40, 49];
  const afterSlice = compact(3, "M E S");
  const afterRotation = compact(3, "x");
  const solvedState = solved(3);
  assert.notDeepEqual(
    centreIndices.map((index) => afterSlice[index]),
    centreIndices.map((index) => solvedState[index]),
  );
  assert.notDeepEqual(
    centreIndices.map((index) => afterRotation[index]),
    centreIndices.map((index) => solvedState[index]),
  );
});

test("M2 E2 S2 produces the standard checkerboard", () => {
  assert.equal(
    compact(3, "M2 E2 S2"),
    "UDUDUDUDURLRLRLRLRFBFBFBFBFDUDUDUDUDLRLRLRLRLBFBFBFBFB",
  );
});

test("execution preserves sticker counts and does not mutate its input", () => {
  const initial = StateTypes.solved(5)._0;
  const before = FaceletCodec.render(initial);
  const parsed = MoveParser.parse(5, "3Uw 2-3Rw2 F'");
  assert.equal(parsed.TAG, "Ok");
  const result = MoveExecutor.applyAlg(initial, parsed._0);
  assert.equal(result.TAG, "Ok");
  assert.equal(FaceletCodec.render(initial), before);
  const rendered = FaceletCodec.render(result._0);
  for (const face of "URFDLB") {
    assert.equal([...rendered].filter((value) => value === face).length, 25);
  }
});

test("expansion rejects algorithms beyond the configured safety limit", () => {
  const result = MoveExecutor.parseAndApply(3, "(R R)60000");
  assert.equal(result.TAG, "Error");
  assert.match(result._0, /may not exceed 100000 moves/);
});
