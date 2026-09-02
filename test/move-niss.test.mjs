import assert from "node:assert/strict";
import {test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveNiss from "../src/Move/MoveNiss.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";

const parse = (input) => {
  const result = MoveParser.parse(3, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

const compact = (input) => {
  const result = MoveExecutor.parseAndApply(3, input);
  assert.equal(result.TAG, "Ok", result._0);
  return FaceletCodec.render(result._0);
};

test("inverts a scramble without changing its structured notation semantics", () => {
  const scramble = parse("R U [F, R]");
  const inverse = MoveNiss.invertScramble(scramble);
  assert.equal(MoveTransform.serialize(inverse), "[F, R]' U' R'");
  assert.equal(compact(`${MoveTransform.serialize(scramble)} ${MoveTransform.serialize(inverse)}`), compact(""));
});

test("recombines normal and inverse-side work as N followed by inverse(I)", () => {
  const combined = MoveNiss.combine(parse("U'"), parse("R"));
  assert.equal(MoveTransform.serialize(combined), "U' R'");

  const result = MoveNiss.verify(3, parse("R U"), parse("U'"), parse("R"));
  assert.equal(result.TAG, "Ok", result.TAG === "Error" ? MoveNiss.describeError(result._0) : "");
  assert.equal(MoveTransform.serialize(result._0.solution), "U' R'");
  assert.equal(MoveTransform.serialize(result._0.inverseScramble), "U' R'");
  assert.equal(result._0.moveCount, 2);
});

test("rejects a recombination that does not solve the scramble", () => {
  const result = MoveNiss.verify(3, parse("R U"), parse("R'"), parse("U'"));
  assert.equal(result.TAG, "Error");
  assert.equal(result._0, "CandidateDoesNotSolve");
  assert.match(MoveNiss.describeError(result._0), /does not solve/);
});

test("reports unsupported puzzle sizes", () => {
  const result = MoveNiss.verify(6, [], [], []);
  assert.equal(result.TAG, "Error");
  assert.equal(result._0.TAG, "UnsupportedSize");
});
