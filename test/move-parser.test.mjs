import assert from "node:assert/strict";
import {test} from "vitest";

import * as MoveNormalizer from "../src/Move/MoveNormalizer.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const parse = (size, input) => {
  const result = MoveParser.parse(size, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

const parseWithLowercaseMode = (size, lowercaseMode, input) => {
  const result = MoveParser.parseWithLowercaseMode(size, lowercaseMode, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

const parseWithOptions = (size, lowercaseMode, notationDialect, input) => {
  const result = MoveParser.parseWithOptions(size, lowercaseMode, notationDialect, input);
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
  const input = "Ｒ".replace("Ｒ", "R") + "’\u00a0（U‑D）";
  const normalized = MoveNormalizer.normalize(input);
  assert.equal(normalized, "R' (U-D)");
  assert.equal(normalized.length, input.length);

  const subscript = "F₂' B₃2";
  assert.equal(MoveNormalizer.normalize(subscript), subscript);
  assert.equal(MoveNormalizer.normalize(subscript).length, subscript.length);
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

test("lowercase mode explicitly selects modern wide or legacy inner-layer semantics", () => {
  const modern = parseWithLowercaseMode(4, "Wide", "r")[0];
  const legacy = parseWithLowercaseMode(4, "InnerSlice", "r")[0];
  assert.deepEqual(modern.desc._0._1, {from_: 1, to_: 2});
  assert.deepEqual(legacy.desc._0._1, {from_: 2, to_: 2});

  const explicitWide = parseWithLowercaseMode(4, "InnerSlice", "Rw")[0];
  assert.deepEqual(explicitWide.desc._0._1, {from_: 1, to_: 2});
  const threeByThree = parseWithLowercaseMode(3, "InnerSlice", "r")[0];
  assert.deepEqual(threeByThree.desc._0._1, {from_: 1, to_: 2});

  const prefixed = MoveParser.parseWithLowercaseMode(5, "InnerSlice", "3r");
  assert.equal(prefixed.TAG, "Error");
  assert.match(prefixed._0.message, /cannot have a layer prefix/);
});

test("parses nested groups, commutators, conjugates, and composite suffixes", () => {
  const units = parse(3, "(R U R' U') 3 [R, U] ' [R: U2] 2");
  assert.deepEqual(units.map((unit) => unit.desc.TAG), ["Group", "Commutator", "Conjugate"]);
  assert.equal(units[0].desc._1, 3);
  assert.equal(units[1].desc._2, -1);
  assert.equal(units[2].desc._2, 2);
});

test("accepts self-delimiting units without artificial whitespace", () => {
  const adjacent = parse(3, "(M2 E2 S2)(R L) [R,U][D,L] (R U)R' R(U R')");
  assert.deepEqual(adjacent.map((unit) => unit.desc.TAG), [
    "Group",
    "Group",
    "Commutator",
    "Commutator",
    "Group",
    "Move",
    "Move",
    "Group",
  ]);
  rejects(3, "RUR", /separated by whitespace/);
});

test("accepts explicit composite multiplier symbols and flexible operator spacing", () => {
  for (const notation of ["(R U)*6", "(R U) * 6", "(R U)^6", "(R U) x 6"]) {
    const unit = parse(3, notation)[0];
    assert.equal(unit.desc.TAG, "Group");
    assert.equal(unit.desc._1, 6);
  }
  for (const notation of ["[R,U]", "[R , U]", "[R:U]", "[R : U]"]) {
    assert.equal(parse(3, notation).length, 1);
  }
  assert.equal(parse(3, "(R)x2").at(-1).desc._0.TAG, "Rotation");
  const nestedAsterisk = parse(3, "((M' U)*4 x y (M' U)*4)");
  assert.equal(nestedAsterisk.length, 1);
  assert.equal(nestedAsterisk[0].desc.TAG, "Group");
  const nestedBody = nestedAsterisk[0].desc._0;
  assert.deepEqual(nestedBody.map((unit) => unit.desc.TAG), ["Group", "Move", "Move", "Group"]);
  assert.deepEqual([nestedBody[0].desc._1, nestedBody[3].desc._1], [4, 4]);
  rejects(3, "(R)*", /requires a positive integer/);
});

test("keeps modern suffix turns distinct from explicit Ruwix layer suffixes", () => {
  const modern = parse(5, "F2'")[0];
  assert.deepEqual(modern.desc._0._1, {from_: 1, to_: 1});
  assert.equal(modern.desc._1, -2);

  const unicodeLayer = parse(5, "F₂'")[0];
  assert.deepEqual(unicodeLayer.desc._0._1, {from_: 1, to_: 2});
  assert.equal(unicodeLayer.desc._1, -1);

  const ruwix = parseWithOptions(5, "Wide", "Ruwix", "F2' B22 F3");
  assert.deepEqual(ruwix.map((unit) => unit.desc._0._1), [
    {from_: 1, to_: 2},
    {from_: 1, to_: 2},
    {from_: 1, to_: 3},
  ]);
  assert.deepEqual(ruwix.map((unit) => unit.desc._1), [-1, 2, 1]);
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

test("maps SSE 3×3 tier, mid-layer, slice, and cube turns to equivalent CubeLab moves", () => {
  const sse = parseWithOptions(3, "Wide", "Sse", "TR MR MU MF SR SU SF CR CU CF R-");
  const modern = parse(3, "Rw M' E' S R L' U D' F B' x y z R'");
  const sseState = MoveExecutor.applyAlg(StateTypes.solved(3)._0, sse);
  const modernState = MoveExecutor.applyAlg(StateTypes.solved(3)._0, modern);
  assert.equal(sseState.TAG, "Ok");
  assert.equal(modernState.TAG, "Ok");
  assert.equal(FaceletCodec.render(sseState._0), FaceletCodec.render(modernState._0));
  assert.equal(MoveTransform.serialize(sse), "Rw M' E' S (R L') (U D') (F B') x y z R'");

  const wrongSize = MoveParser.parseWithOptions(4, "Wide", "Sse", "TR");
  assert.equal(wrongSize.TAG, "Error");
  assert.match(wrongSize._0.message, /only for 3×3×3/);
});

test("accepts SSE's compact adjacent move sequences without relaxing other dialects", () => {
  const spaced = parseWithOptions(3, "Wide", "Sse", "CD2 MR2 MD MR2 MD'");
  const compact = parseWithOptions(3, "Wide", "Sse", "CD2MR2MDMR2MD'");
  assert.equal(MoveTransform.serialize(compact), MoveTransform.serialize(spaced));
  rejects(3, "RUR", /separated by whitespace/);
});

test("comments and timing annotations separate units without changing spans", () => {
  const units = parse(3, "R// reconstruction\nU # second line\nF @1.53s R’");
  assert.equal(units.length, 5);
  assert.deepEqual(units[0].loc, {start: 0, end_: 1});
  assert.equal(units[3].desc.TAG, "TimedPause");
  assert.equal(units[3].desc._0, 1.53);
  assert.equal(units[4].desc._1, -1);
  assert.equal(units[4].loc.end_ - units[4].loc.start, 2);

  const groupedWithTiming = parse(3, "(R U R' U' @1.3s) [R, U @0.8s]");
  assert.equal(groupedWithTiming.length, 2);
  assert.equal(groupedWithTiming[0].desc.TAG, "Group");
  assert.equal(groupedWithTiming[0].desc._0.at(-1).desc.TAG, "TimedPause");
  assert.equal(groupedWithTiming[1].desc.TAG, "Commutator");
  assert.equal(groupedWithTiming[1].desc._1.at(-1).desc._0, 0.8);
});

test("retains internal pauses and block comments as located editor nodes", () => {
  const units = parse(3, "R . /* inspection\npoint */ U");
  assert.deepEqual(units.map((unit) => typeof unit.desc === "string" ? unit.desc : unit.desc.TAG), [
    "Move",
    "Pause",
    "BlockComment",
    "Move",
  ]);
  assert.deepEqual(units[1].loc, {start: 2, end_: 3});
  assert.equal(units[2].desc._0, " inspection\npoint ");
  assert.deepEqual(units[2].loc, {start: 4, end_: 26});
  assert.equal(parse(3, "R/* inline */U").length, 3);
});

test("strips only sentence punctuation at the end of complete input", () => {
  assert.equal(parse(3, "R U'.;").length, 2);
  assert.equal(parse(3, "R U; # copied sentence").length, 2);
  assert.equal(parse(3, "R .").at(-1).desc, "Pause");
  rejects(3, "R.U", /separated by whitespace/);
});

test("rejects unsupported dimensions, invalid ranges, and malformed grammar with spans", () => {
  rejects(4, "M", /only on 3×3×3/);
  rejects(3, "3Rw", /between 2 and N-1/);
  rejects(4, "1-2Rw", /must start at layer 2/);
  rejects(2, "Rw", /between 2 and N-1/);
  rejects(3, "RUR", /separated by whitespace/);
  rejects(3, "[R U]", /requires ',' or ':'/);
  const error = rejects(3, "(R U", /Unclosed/);
  assert.deepEqual(error.loc, {start: 0, end_: 4});
  const commentError = rejects(3, "R /* unfinished", /Unclosed block comment/);
  assert.deepEqual(commentError.loc, {start: 2, end_: 15});
  rejects(3, "R @1.3", /must end in 's'/);
  rejects(3, "R @1.2345s", /millisecond precision/);
  rejects(3, "R @61s", /may not exceed 60 seconds/);
});

test("enforces the parser nesting limit", () => {
  const nested = "(".repeat(65) + "R" + ")".repeat(65);
  rejects(3, nested, /may not exceed 64 levels/);
});
