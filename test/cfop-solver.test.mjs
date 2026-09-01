import assert from "node:assert/strict";
import test from "node:test";

import * as CfopSolver from "../src/Solver/CfopSolver.res.mjs";
import * as CfopCases from "../src/Solver/CfopCases.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";
import * as PieceReducer from "../src/State/PieceReducer.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const solved = StateTypes.solved(3)._0;
const solvedCompact = FaceletCodec.render(solved);

const lastLayerCase = (algorithm) => {
  const parsed = MoveParser.parse(3, algorithm);
  assert.equal(parsed.TAG, "Ok");
  const internal = MoveTransform.rotate(parsed._0, "X", 2);
  const setup = MoveExecutor.applyAlg(solved, MoveTransform.invert(internal));
  assert.equal(setup.TAG, "Ok");
  return setup._0;
};

const scramble = (algorithm) => {
  const result = MoveExecutor.parseAndApply(3, algorithm);
  assert.equal(result.TAG, "Ok");
  return result._0;
};

const solveWith = (solver, state) => {
  const result = solver(state);
  assert.equal(
    result.TAG,
    "Ok",
    result.TAG === "Error" ? CfopSolver.describeError(result._0) : "",
  );
  return result._0;
};

const solve = (state) => solveWith(CfopSolver.solveAdvanced, state);

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

test("emits four replay-verified full CFOP phases", () => {
  const initial = scramble("R U2 F' L2 D B2 R' U F2 D' L B U2 R2 F D2 L' B' U R");
  const solution = solve(initial);
  assert.deepEqual(
    solution.phases.map(({title}) => title),
    ["Cross", "F2L Pairs", "One-Look OLL", "One-Look PLL"],
  );
  assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(initial, solution.alg)._0), solvedCompact);

  const serialized = MoveTransform.serialize(solution.alg);
  assert.equal((serialized.match(/CFOP [1-4]:/g) ?? []).length, 4);
  assert.match(MoveTransform.serialize(solution.phases[0].alg), /^\(x2\) @0\.5s/);
  assert.equal((serialized.match(/@1\.2s/g) ?? []).length, 3);
  assert.equal(MoveExecutor.expand(solution.alg)._0.filter(({move}) => move.TAG !== "Rotation").length, solution.moveCount);
  assert.ok(solution.moveCount <= 60, `expected the full CFOP benchmark, received ${solution.moveCount} moves`);
  assert.equal(solution.phases[1].sequences.length, 4);
  solution.phases[1].sequences.forEach((description) => {
    assert.match(description, /pair —/);
    assert.match(description, /white sticker faces/);
    assert.match(description, /edge (oriented|flipped)/);
  });
});

test("exposes distinct replay-verified Beginner, Full, and Advanced CFOP strategies", () => {
  const initial = scramble("R U2 F' L2 D B2 R' U F2 D' L B U2 R2 F D2 L' B' U R");
  const beginner = solveWith(CfopSolver.solveBeginner, initial);
  const advancedLbl = solveWith(CfopSolver.solveAdvancedLbl, initial);
  const full = solveWith(CfopSolver.solveFull, initial);
  const advanced = solveWith(CfopSolver.solveAdvanced, initial);

  assert.deepEqual(
    beginner.phases.map(({title}) => title),
    ["Cross", "F2L Pairs", "Two-Look OLL", "Two-Look PLL"],
  );
  assert.deepEqual(
    advancedLbl.phases.map(({title}) => title),
    [
      "Direct White Cross",
      "First-Layer Corners",
      "Middle-Layer Edges",
      "Yellow Cross",
      "Orient Yellow Corners",
      "Permute Yellow Corners",
      "Permute Yellow Edges",
    ],
  );
  for (const solution of [full, advanced]) {
    assert.deepEqual(
      solution.phases.map(({title}) => title),
      ["Cross", "F2L Pairs", "One-Look OLL", "One-Look PLL"],
    );
  }
  for (const solution of [beginner, advancedLbl, full, advanced]) {
    assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(initial, solution.alg)._0), solvedCompact);
  }
  let advancedLblState = initial;
  advancedLblState = MoveExecutor.applyAlg(advancedLblState, advancedLbl.phases[0].alg)._0;
  solvedPieces(advancedLblState, [], [0, 1, 2, 3]);
  advancedLblState = MoveExecutor.applyAlg(advancedLblState, advancedLbl.phases[1].alg)._0;
  solvedPieces(advancedLblState, [0, 1, 2, 3], [0, 1, 2, 3]);
  advancedLblState = MoveExecutor.applyAlg(advancedLblState, advancedLbl.phases[2].alg)._0;
  solvedPieces(advancedLblState, [0, 1, 2, 3], [0, 1, 2, 3, 8, 9, 10, 11]);
  advancedLblState = MoveExecutor.applyAlg(advancedLblState, advancedLbl.phases[3].alg)._0;
  assert.deepEqual(pieces(advancedLblState).eo, Array(12).fill(0));
  advancedLblState = MoveExecutor.applyAlg(advancedLblState, advancedLbl.phases[4].alg)._0;
  assert.deepEqual(pieces(advancedLblState).co, Array(8).fill(0));
  advancedLblState = MoveExecutor.applyAlg(advancedLblState, advancedLbl.phases[5].alg)._0;
  assert.deepEqual(pieces(advancedLblState).cp, [0, 1, 2, 3, 4, 5, 6, 7]);
  advancedLblState = MoveExecutor.applyAlg(advancedLblState, advancedLbl.phases[6].alg)._0;
  assert.equal(FaceletCodec.render(advancedLblState), solvedCompact);
  assert.ok(advancedLbl.moveCount <= 76);
  assert.ok(full.moveCount < beginner.moveCount);
  assert.ok(advanced.moveCount <= full.moveCount);
  assert.doesNotMatch(full.phases[0].sequences.join(" "), /candidate plans/);
  assert.match(advanced.phases[0].sequences.join(" "), /candidate plans/);
});

test("recognizes and replay-verifies every one-look OLL case", () => {
  assert.equal(CfopCases.oll.length, 57);
  CfopCases.oll.forEach((entry) => {
    const initial = lastLayerCase(entry.algorithm);
    const solution = solveWith(CfopSolver.solveFull, initial);
    assert.ok(
      solution.phases[2].sequences.some((description) =>
        description.includes(`OLL ${entry.id} ·`)
      ),
      `OLL ${entry.id} was not recognized`,
    );
    assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(initial, solution.alg)._0), solvedCompact);
  });
});

test("recognizes and replay-verifies every one-look PLL case", () => {
  assert.equal(CfopCases.pll.length, 21);
  CfopCases.pll.forEach((entry) => {
    const initial = lastLayerCase(entry.algorithm);
    const solution = solveWith(CfopSolver.solveFull, initial);
    assert.ok(
      solution.phases[3].sequences.some((description) =>
        description.includes(`${entry.id}-Perm`)
      ),
      `${entry.id}-Perm was not recognized`,
    );
    assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(initial, solution.alg)._0), solvedCompact);
  });
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
