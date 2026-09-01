import assert from "node:assert/strict";
import test from "node:test";

import * as CfopSolver from "../src/Solver/CfopSolver.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";
import * as PieceReducer from "../src/State/PieceReducer.res.mjs";
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

const pieces = (state) => {
  const result = PieceReducer.reduce(state);
  assert.equal(result.TAG, "Ok");
  return result._0;
};

const solvedPieces = (state, corners, edges) => {
  const value = pieces(state);
  corners.forEach((piece) => {
    assert.equal(value.cp[piece], piece);
    assert.equal(value.co[piece], 0);
  });
  edges.forEach((piece) => {
    assert.equal(value.ep[piece], piece);
    assert.equal(value.eo[piece], 0);
  });
};

test("emits four replay-verified two-look CFOP phases", () => {
  const initial = scramble("R U2 F' L2 D B2 R' U F2 D' L B U2 R2 F D2 L' B' U R");
  const solution = solve(initial);
  assert.deepEqual(
    solution.phases.map(({title}) => title),
    ["Cross", "F2L Pairs", "Two-Look OLL", "Two-Look PLL"],
  );
  assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(initial, solution.alg)._0), solvedCompact);

  const serialized = MoveTransform.serialize(solution.alg);
  assert.equal((serialized.match(/CFOP [1-4]:/g) ?? []).length, 4);
  assert.match(MoveTransform.serialize(solution.phases[0].alg), /^\(x2\) @0\.5s/);
  assert.equal((serialized.match(/@1\.2s/g) ?? []).length, 3);
  assert.equal(MoveExecutor.expand(solution.alg)._0.filter(({move}) => move.TAG !== "Rotation").length, solution.moveCount);
  assert.equal(solution.phases[1].sequences.length, 4);
  solution.phases[1].sequences.forEach((description) => {
    assert.match(description, /pair —/);
    assert.match(description, /white sticker faces/);
    assert.match(description, /edge (oriented|flipped)/);
  });
});

test("labels the three-corner PLL sequence as an A-perm", () => {
  const initial = scramble("y' R2 B2 R F R' B2 R F' R y");
  const solution = solve(initial);
  assert.ok(solution.phases[3].sequences.some((description) =>
    description.includes("Permute three last-layer corners — A-perm")
  ));
});

test("independently verifies every CFOP phase invariant in the white-bottom frame", () => {
  const initial = scramble("(R U R' U')3 F2 D L2 B' U2");
  const solution = solve(initial);
  let state = initial;
  state = MoveExecutor.applyAlg(state, solution.phases[0].alg)._0;
  assert.equal(state.facelets[0][4], "D");
  assert.equal(state.facelets[5][4], "U");
  solvedPieces(state, [], [0, 1, 2, 3]);

  state = MoveExecutor.applyAlg(state, solution.phases[1].alg)._0;
  assert.equal(state.facelets[0][4], "D");
  solvedPieces(state, [0, 1, 2, 3], [0, 1, 2, 3, 8, 9, 10, 11]);

  state = MoveExecutor.applyAlg(state, solution.phases[2].alg)._0;
  const afterOll = pieces(state);
  assert.deepEqual(afterOll.co, Array(8).fill(0));
  assert.deepEqual(afterOll.eo, Array(12).fill(0));

  state = MoveExecutor.applyAlg(state, solution.phases[3].alg)._0;
  assert.equal(FaceletCodec.render(state), solvedCompact);
});

test("handles solved and unsupported inputs consistently with the verified solver", () => {
  const solution = solve(solved);
  assert.equal(solution.moveCount, 0);
  assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(solved, solution.alg)._0), solvedCompact);

  const unsupported = CfopSolver.solve(StateTypes.solved(2)._0);
  assert.equal(unsupported.TAG, "Error");
  assert.equal(unsupported._0.TAG, "UnsupportedSize");
});
