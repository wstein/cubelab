import assert from "node:assert/strict";
import {test} from "vitest";

import * as AlgorithmOptimizer from "../src/Solver/AlgorithmOptimizer.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";
import * as PieceReducer from "../src/State/PieceReducer.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const solved = StateTypes.solved(3)._0;

// No-payload variant cases (NoShorterFound, SearchTooExpensive) compile to
// bare strings; only the Shortened({...}) case carries a {TAG, ...} object.
const outcomeTag = (outcome) => (typeof outcome === "string" ? outcome : outcome.TAG);

const targetFor = (notation) => {
  const parsed = MoveParser.parse(3, notation);
  assert.equal(parsed.TAG, "Ok", notation);
  const applied = MoveExecutor.applyAlg(solved, parsed._0);
  assert.equal(applied.TAG, "Ok", notation);
  const moveCount = MoveExecutor.expand(parsed._0)._0.filter(
    (step) => step.move.TAG !== "Rotation",
  ).length;
  return {target: PieceReducer.reduce(applied._0)._0, moveCount};
};

// A found result must always be a genuine, replay-verified equivalent that
// is strictly shorter than the input — never equal or longer, and never
// merely plausible.
const assertValidShortening = (notation) => {
  const {target, moveCount} = targetFor(notation);
  const result = AlgorithmOptimizer.shorten(solved, target, moveCount, undefined, undefined);
  assert.equal(result.TAG, "Ok", notation);
  const outcome = result._0;
  if (outcomeTag(outcome) === "Shortened") {
    assert.ok(outcome.moveCount < moveCount, `${notation}: ${outcome.moveCount} < ${moveCount}`);
    const replay = MoveExecutor.applyAlg(solved, outcome.alg);
    assert.equal(replay.TAG, "Ok", notation);
    const replayPieces = PieceReducer.reduce(replay._0)._0;
    assert.deepEqual(replayPieces, target, `${notation}: replay must reach the exact same state`);
  }
  return outcome;
};

test("collapses a doubled quarter turn to its half-turn form", () => {
  const outcome = assertValidShortening("R R");
  assert.equal(outcomeTag(outcome), "Shortened");
  assert.equal(outcome.moveCount, 1);
  assert.equal(MoveTransform.serialize(outcome.alg), "R2");
});

test("finds the zero-move identity hidden behind independent-face commutators", () => {
  for (const notation of ["U D U' D'", "R L R' L'", "F B F' B'"]) {
    const outcome = assertValidShortening(notation);
    assert.equal(outcomeTag(outcome), "Shortened", notation);
    assert.equal(outcome.moveCount, 0, notation);
    assert.equal(MoveTransform.serialize(outcome.alg), "", notation);
  }
});

test("reports NoShorterFound rather than a false positive for an already-short trigger", () => {
  const outcome = assertValidShortening("R U R' U R U2 R'");
  assert.equal(outcomeTag(outcome), "NoShorterFound");
});

test("never returns an outcome other than Shortened, NoShorterFound, or SearchTooExpensive", () => {
  for (const notation of [
    "R U2 D F2 L B2 R2 U F R2",
    "R U R' U' R U R' U'",
    "R2 U2 R2 U2 R2 U2",
    "U R U R U R U R U R",
  ]) {
    const outcome = assertValidShortening(notation);
    assert.ok(["Shortened", "NoShorterFound", "SearchTooExpensive"].includes(outcomeTag(outcome)), notation);
  }
});

test("a single move or shorter has nothing to shorten", () => {
  const {target} = targetFor("R");
  const result = AlgorithmOptimizer.shorten(solved, target, 1, undefined, undefined);
  assert.equal(result.TAG, "Ok");
  assert.equal(outcomeTag(result._0), "NoShorterFound");
});
