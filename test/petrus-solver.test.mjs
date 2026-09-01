import assert from "node:assert/strict";
import test from "node:test";

import * as BeginnerSolver from "../src/Solver/BeginnerSolver.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";
import * as PetrusSolver from "../src/Solver/PetrusSolver.res.mjs";
import * as PieceReducer from "../src/State/PieceReducer.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const solved = StateTypes.solved(3)._0;
const solvedCompact = FaceletCodec.render(solved);
const initial = MoveExecutor.parseAndApply(
  3,
  "R U2 F2 L2 D B2 R2 U F2 D2 L B U2 R2 F D2 L2 B2 U R",
)._0;

const solveWith = (solver) => {
  const result = solver(initial);
  assert.equal(
    result.TAG,
    "Ok",
    result.TAG === "Error" ? PetrusSolver.describeError(result._0) : "",
  );
  return result._0;
};

const pieces = (state) => {
  const reduced = PieceReducer.reduce(state);
  assert.equal(reduced.TAG, "Ok");
  return reduced._0;
};

const afterPhase = (state, phase) => {
  const result = MoveExecutor.applyAlg(state, phase.alg);
  assert.equal(result.TAG, "Ok");
  return result._0;
};

test("emits seven truthful, replay-verified Classical Petrus phases", () => {
  const solution = solveWith(PetrusSolver.solveClassical);
  assert.deepEqual(
    solution.phases.map(({title}) => title),
    [
      "Build a 2×2×2 Block",
      "Expand to 2×2×3",
      "Orient Bad Edges",
      "2-Generator F2L Finish",
      "Orient Last-Layer Corners",
      "Permute Last-Layer Corners",
      "Permute Last-Layer Edges",
    ],
  );

  let state = initial;
  state = afterPhase(state, solution.phases[0]);
  assert.equal(PetrusSolver.isBlock222(pieces(state)), true);
  state = afterPhase(state, solution.phases[1]);
  assert.equal(PetrusSolver.isBlock223(pieces(state)), true);
  state = afterPhase(state, solution.phases[2]);
  assert.equal(PetrusSolver.isPetrusEo(pieces(state)), true);
  state = afterPhase(state, solution.phases[3]);
  assert.equal(BeginnerSolver.firstTwoLayersGoal(pieces(state)), true);
  assert.equal(PetrusSolver.edgesOriented(pieces(state)), true);
  state = afterPhase(state, solution.phases[4]);
  assert.equal(BeginnerSolver.orientedLastCornersGoal(pieces(state)), true);
  state = afterPhase(state, solution.phases[5]);
  assert.equal(BeginnerSolver.positionedLastCornersGoal(pieces(state)), true);
  state = afterPhase(state, solution.phases[6]);
  assert.equal(FaceletCodec.render(state), solvedCompact);

  const twoGenMoves = MoveExecutor.expand(solution.phases[3].alg)._0
    .filter(({move}) => move.TAG !== "Rotation");
  assert.ok(twoGenMoves.length > 0);
  twoGenMoves.forEach(({move}) => {
    assert.equal(move.TAG, "FaceTurn");
    assert.ok(move._0 === "R" || move._0 === "U", `unexpected 2-gen move ${move._0}`);
  });
  assert.equal(
    MoveExecutor.expand(solution.alg)._0.filter(({move}) => move.TAG !== "Rotation").length,
    solution.moveCount,
  );
  assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(initial, solution.alg)._0), solvedCompact);
  assert.equal((MoveTransform.serialize(solution.alg).match(/PETRUS [1-7]:/g) ?? []).length, 7);
});

test("emits a five-phase Enhanced Petrus curriculum with a COLL/EPLL finish", () => {
  const solution = solveWith(PetrusSolver.solveEnhanced);
  assert.equal(solution.phases.length, 5);
  assert.equal(solution.phases[4].title, "COLL + EPLL Finish");
  assert.match(solution.phases[4].instruction, /COLL/);
  assert.deepEqual(solution.phases[4].sequences, [
    "COLL: orient and position all four last-layer corners with EO preserved.",
    "EPLL: finish the remaining Ua, Ub, H, or Z edge case.",
  ]);

  let state = initial;
  solution.phases.slice(0, 4).forEach((phase) => { state = afterPhase(state, phase); });
  assert.equal(BeginnerSolver.firstTwoLayersGoal(pieces(state)), true);
  assert.equal(PetrusSolver.edgesOriented(pieces(state)), true);
  state = afterPhase(state, solution.phases[4]);
  assert.equal(FaceletCodec.render(state), solvedCompact);
  assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(initial, solution.alg)._0), solvedCompact);
});

test("handles solved and unsupported inputs without weakening replay guarantees", () => {
  const alreadySolved = PetrusSolver.solveClassical(solved);
  assert.equal(alreadySolved.TAG, "Ok");
  assert.equal(alreadySolved._0.moveCount, 0);
  assert.equal(alreadySolved._0.phases.length, 7);

  const unsupported = PetrusSolver.solveEnhanced(StateTypes.solved(4)._0);
  assert.equal(unsupported.TAG, "Error");
  assert.match(PetrusSolver.describeError(unsupported._0), /supports 3×3×3/);
});

test("solves a seeded sample of unrelated block-building states", () => {
  const scrambles = [
    "R U F L D B R2 U2 F2 L2 D2 B2",
    "U R2 F D2 L B2 U2 R F2 D L2 B",
    "F2 U L2 R D2 B U2 F R2 D L B2",
  ];
  scrambles.forEach((scramble) => {
    const state = MoveExecutor.parseAndApply(3, scramble)._0;
    const result = PetrusSolver.solveClassical(state);
    assert.equal(
      result.TAG,
      "Ok",
      result.TAG === "Error" ? PetrusSolver.describeError(result._0) : "",
    );
    assert.equal(FaceletCodec.render(MoveExecutor.applyAlg(state, result._0.alg)._0), solvedCompact);
  });
});
