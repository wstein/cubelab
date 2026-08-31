import assert from "node:assert/strict";
import test from "node:test";

import * as MoveNormalizer from "../src/Move/MoveNormalizer.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";

const parse = (size, input) => {
  const result = MoveParser.parse(size, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

const rejects = (size, input, message) => {
  const result = MoveParser.parse(size, input);
  assert.equal(result.TAG, "Error");
  assert.match(result._0.message, message);
  return result._0;
};

test("normalization preserves source length while replacing common Unicode aliases", () => {
  const input = "Ｒ".replace("Ｒ", "R") + "’\u00a0（U–D）";
  const normalized = MoveNormalizer.normalize(input);
  assert.equal(normalized, "R' (U-D)");
  assert.equal(normalized.length, input.length);
});

test("parses face, wide, range, slice, and rotation moves with signed repeats", () => {
  const units = parse(4, "R U' R2 2Rw 2-3Fw2' x3");
  assert.equal(units.length, 6);
  assert.deepEqual(units.map((unit) => unit.desc._1), [1, -1, 2, 1, -2, 3]);
  assert.deepEqual(units[3].desc._0._1, {from_: 1, to_: 2});
  assert.deepEqual(units[4].desc._0._1, {from_: 2, to_: 3});

  const slices = parse(3, "M E' S2");
  assert.deepEqual(slices.map((unit) => unit.desc._0.TAG), ["SliceTurn", "SliceTurn", "SliceTurn"]);
});

test("parses nested groups, commutators, conjugates, and composite suffixes", () => {
  const units = parse(3, "(R U R' U')3 [R, U]' [R: U2]2");
  assert.deepEqual(units.map((unit) => unit.desc.TAG), ["Group", "Commutator", "Conjugate"]);
  assert.equal(units[0].desc._1, 3);
  assert.equal(units[1].desc._2, -1);
  assert.equal(units[2].desc._2, 2);
});

test("keeps parenthesized r as a wide-move group and accepts bracket rotations", () => {
  const grouped = parse(3, "(r)");
  assert.equal(grouped[0].desc.TAG, "Group");
  assert.equal(grouped[0].desc._0[0].desc._0.TAG, "FaceTurn");

  for (const notation of ["[r]", "{u'}", "<f>2"]) {
    const unit = parse(3, notation)[0];
    assert.equal(unit.desc.TAG, "Move");
    assert.equal(unit.desc._0.TAG, "Rotation");
  }
});

test("comments and timing annotations separate units without changing spans", () => {
  const units = parse(3, "R// reconstruction\nU @1.53s R’");
  assert.equal(units.length, 3);
  assert.deepEqual(units[0].loc, {start: 0, end_: 1});
  assert.equal(units[2].desc._1, -1);
  assert.equal(units[2].loc.end_ - units[2].loc.start, 2);
});

test("rejects unsupported dimensions, invalid ranges, and malformed grammar with spans", () => {
  rejects(4, "M", /only on 3×3×3/);
  rejects(3, "3Rw", /between 2 and N-1/);
  rejects(2, "Rw", /between 2 and N-1/);
  rejects(3, "RUR", /separated by whitespace/);
  rejects(3, "[R U]", /requires ',' or ':'/);
  const error = rejects(3, "(R U", /Unclosed/);
  assert.deepEqual(error.loc, {start: 0, end_: 4});
});

test("enforces the parser nesting limit", () => {
  const nested = "(".repeat(65) + "R" + ")".repeat(65);
  rejects(3, nested, /may not exceed 64 levels/);
});
