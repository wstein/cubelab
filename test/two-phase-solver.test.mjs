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
