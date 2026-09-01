import assert from "node:assert/strict";
import test from "node:test";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";

const parse = (size, input) => {
  const result = MoveParser.parse(size, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

const serialize = (alg) => MoveTransform.serialize(alg);

const compact = (size, input) => {
  const result = MoveExecutor.parseAndApply(size, input);
  assert.equal(result.TAG, "Ok", result._0);
  return FaceletCodec.render(result._0);
};

test("serializes every supported structured editor node canonically", () => {
  const input = "(Rw U)3 [R, U]' 2R [F: U2] . /* inspect */";
  const rendered = serialize(parse(4, input));
  assert.equal(rendered, "(Rw U)3 [R, U]' 2R [F: U2] . /* inspect */");
  assert.equal(compact(4, rendered), compact(4, input));
});

test("inverts structured algorithms without flattening them", () => {
  const source = "R U [F, R] (U D)2 . /* finish */";
  const inverse = serialize(MoveTransform.invert(parse(3, source)));
  assert.equal(inverse, "/* finish */ . (U D)2' [F, R]' U' R'");
  assert.equal(compact(3, `${source} ${inverse}`), compact(3, ""));
});

test("simplifies same-axis runs and preserves editor boundaries", () => {
  const result = MoveTransform.simplify(parse(3, "R L R' U U U' . F4 /* keep */ B B2 B"));
  assert.equal(result.TAG, "Ok");
  const rendered = serialize(result._0);
  assert.equal(rendered, "L U . /* keep */");
  assert.equal(
    compact(3, rendered),
    compact(3, "R L R' U U U' . F4 /* keep */ B B2 B"),
  );
});

test("mirrors all three coordinate planes as involutions", () => {
  const source = parse(3, "R U F M E S x y z [R: U]");
  assert.equal(serialize(MoveTransform.mirror(source, "LR")), "L' U' F' M E' S' x y' z' [L': U']");
  for (const plane of ["LR", "FB", "UD"]) {
    const twice = MoveTransform.mirror(MoveTransform.mirror(source, plane), plane);
    assert.equal(serialize(twice), serialize(source));
  }
});

test("rotates notation by conjugating the selected coordinate frame", () => {
  const source = parse(3, "R U R' M E S x y z");
  const rotated = serialize(MoveTransform.rotate(source, "Y", 1));
  assert.equal(rotated, "F U F' S' E M z y x'");
  assert.equal(compact(3, rotated), compact(3, "y' R U R' M E S x y z y"));
  assert.equal(serialize(MoveTransform.rotate(source, "Y", 4)), serialize(source));
});

test("generates bounded size-aware practice scrambles without adjacent equal axes", () => {
  const expectedLengths = new Map([[2, 11], [3, 25], [4, 45], [5, 60]]);
  for (const [size, expectedLength] of expectedLengths) {
    const result = MoveTransform.practiceScrambleWithRandom(size, () => 0);
    assert.equal(result.TAG, "Ok", result._0);
    const units = parse(size, result._0);
    assert.equal(units.length, expectedLength);
    const axes = units.map((unit) => MoveTransform.moveAxis(unit.desc._0));
    for (let index = 1; index < axes.length; index += 1) {
      assert.notEqual(axes[index], axes[index - 1]);
    }
  }
  assert.equal(MoveTransform.practiceScramble(6).TAG, "Error");
});
