import assert from "node:assert/strict";
import test from "node:test";

import * as CfopSolver from "../src/Solver/CfopSolver.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const solved = StateTypes.solved(3)._0;
const solvedCompact = FaceletCodec.render(solved);

const scramble = (algorithm) => {
  const result = MoveExecutor.parseAndApply(3, algorithm);
  assert.equal(result.TAG, "Ok");
  return result._0;
};

const solve = (state) => {
  const result = CfopSolver.solve(state);
  assert.equal(
    result.TAG,
    "Ok",
    result.TAG === "Error" ? CfopSolver.describeError(result._0) : "",
  );
  return result._0;
};

test("emits four replay-verified two-look CFOP phases", () => {
  const initial = scramble("R U2 F' L2 D B2 R' U F2 D' L B U2 R2 F D2 L' B' U R");
  const solution = solve(initial);
  assert.deepEqual(
    solution.phases.map(({title}) => title),
    ["Cross", "F2L Foundation", "Two-Look OLL", "Two-Look PLL"],
  );
  assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(initial, solution.alg)._0), solvedCompact);

  const serialized = MoveTransform.serialize(solution.alg);
  assert.equal((serialized.match(/CFOP [1-4]:/g) ?? []).length, 4);
  assert.match(MoveTransform.serialize(solution.phases[0].alg), /^\(x2\) @0\.5s/);
  assert.equal((serialized.match(/@1\.2s/g) ?? []).length, 3);
  assert.equal(MoveExecutor.expand(solution.alg)._0.filter(({move}) => move.TAG !== "Rotation").length, solution.moveCount);
});

test("keeps the cross and F2L work in a white-bottom frame", () => {
  const initial = scramble("(R U R' U')3 F2 D L2 B' U2");
  const solution = solve(initial);
  let state = initial;
  solution.phases.slice(0, 2).forEach((phase) => {
    state = MoveExecutor.applyAlg(state, phase.alg)._0;
    assert.equal(state.facelets[0][4], "D");
    assert.equal(state.facelets[5][4], "U");
  });
});

test("handles solved and unsupported inputs consistently with the verified solver", () => {
  const solution = solve(solved);
  assert.equal(solution.moveCount, 0);
  assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(solved, solution.alg)._0), solvedCompact);

  const unsupported = CfopSolver.solve(StateTypes.solved(2)._0);
  assert.equal(unsupported.TAG, "Error");
  assert.equal(unsupported._0.TAG, "UnsupportedSize");
});
