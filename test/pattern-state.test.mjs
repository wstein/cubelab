import assert from "node:assert/strict";
import test from "node:test";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";
import * as PatternState from "../src/State/PatternState.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const {
  algorithmSolvesState,
  inverseAlgorithm,
  orientationAlgorithms,
  patternStateFromAlgorithm,
  patternStateKey,
  solutionForPatternState,
} = PatternState;

test("generates 24 distinct cube orientations for sizes 2 through 5", () => {
  for (const size of [2, 3, 4, 5]) {
    const orientations = orientationAlgorithms(size);
    assert.equal(orientations.length, 24, `Size ${size} must have exactly 24 orientations`);
  }
});

test("computes invariant pattern keys across different holding orientations", () => {
  const size3Solved = StateTypes.solved(3)._0;
  assert.equal(typeof patternStateKey(size3Solved), "string");

  const normalPons = patternStateFromAlgorithm(3, "R2 L2 U2 D2 F2 B2");
  const parsed = MoveParser.parse(3, "R2 L2 U2 D2 F2 B2");
  assert.equal(parsed.TAG, "Ok");
  const rotated = MoveTransform.rotate(parsed._0, "X", 1);
  const rotatedPons = MoveExecutor.applyAlg(StateTypes.solved(3)._0, rotated);
  assert.equal(rotatedPons.TAG, "Ok");
  assert.equal(patternStateKey(normalPons), patternStateKey(rotatedPons._0));
});

test("adapts pattern solutions to reheld and rotated cube states", () => {
  const size3State = patternStateFromAlgorithm(3, "R2 L2 U2 D2 F2 B2");
  const solution = solutionForPatternState(size3State, "R2 L2 U2 D2 F2 B2");
  assert.ok(solution);
  assert.equal(algorithmSolvesState(size3State, solution), true);
});

test("inverts algorithms canonically", () => {
  assert.equal(inverseAlgorithm(3, "R U R' U'"), "U R U' R'");
  assert.equal(inverseAlgorithm(2, "R U"), "U' R'");
});
