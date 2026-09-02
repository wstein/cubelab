import assert from "node:assert/strict";
import {test} from "vitest";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import * as TwoPhaseSolver from "../src/Solver/TwoPhaseSolver.res.mjs";

const apply = (algorithm) => {
  const result = MoveExecutor.parseAndApply(3, algorithm);
  assert.equal(result.TAG, "Ok", result._0);
  return result._0;
};

test("two-phase membership identifies the G1 subgroup", () => {
  const solved = StateTypes.solved(3)._0;
  assert.equal(TwoPhaseSolver.isPhase1Solved(solved), true);
  assert.equal(TwoPhaseSolver.isPhase1Solved(apply("U R2 F2 D'")), true);
  assert.equal(TwoPhaseSolver.isPhase1Solved(apply("R")), false);
  assert.equal(TwoPhaseSolver.isPhase1Solved(apply("F")), false);
});

test("two-phase solver returns the empty optimal solution for solved input", () => {
  const result = TwoPhaseSolver.solve(StateTypes.solved(3)._0);
  assert.equal(result.TAG, "Ok");
  assert.deepEqual(result._0.alg, []);
  assert.equal(result._0.moveCount, 0);
});

test("two-phase solver replay-verifies a one-turn optimal solution", () => {
  const scrambled = apply("R");
  const result = TwoPhaseSolver.solve(scrambled);
  assert.equal(result.TAG, "Ok");
  assert.equal(result._0.moveCount, 1);
  const replay = MoveExecutor.applyAlg(scrambled, result._0.alg);
  assert.equal(replay.TAG, "Ok");
  assert.deepEqual(replay._0, StateTypes.solved(3)._0);
});

test("two-phase coordinates encode canonical solved and G1 states", () => {
  const solved = StateTypes.solved(3)._0;
  const solvedPhaseOne = TwoPhaseSolver.phase1Coordinates(solved);
  assert.equal(solvedPhaseOne.TAG, "Ok");
  assert.deepEqual(solvedPhaseOne._0, {twist: 0, flip: 0, slice: 0});
  const solvedPhaseTwo = TwoPhaseSolver.phase2Coordinates(solved);
  assert.equal(solvedPhaseTwo.TAG, "Ok");
  assert.deepEqual(solvedPhaseTwo._0, {
    corners: 0,
    edges: 0,
    slice: 0,
  });

  const phaseOne = TwoPhaseSolver.phase1Coordinates(apply("F"))._0;
  assert.notEqual(phaseOne.twist, 0);
  assert.notEqual(phaseOne.flip, 0);
  assert.ok(phaseOne.slice >= 0 && phaseOne.slice < 495);

  const g1 = apply("U R2 F2 D'");
  assert.equal(TwoPhaseSolver.isPhase1Solved(g1), true);
  const phaseTwo = TwoPhaseSolver.phase2Coordinates(g1)._0;
  assert.ok(phaseTwo.corners >= 0 && phaseTwo.corners < 40_320);
  assert.ok(phaseTwo.edges >= 0 && phaseTwo.edges < 40_320);
  assert.ok(phaseTwo.slice >= 0 && phaseTwo.slice < 24);
});

test("packed pruning tables store two four-bit distances per Uint8Array byte", () => {
  const table = TwoPhaseSolver.createPruningTable(5);
  assert.ok(table instanceof Uint8Array);
  assert.equal(table.length, 3);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 0), 15);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 4), 15);

  TwoPhaseSolver.setPruningDistance(table, 0, 3);
  TwoPhaseSolver.setPruningDistance(table, 1, 12);
  TwoPhaseSolver.setPruningDistance(table, 4, 7);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 0), 3);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 1), 12);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 4), 7);
});
