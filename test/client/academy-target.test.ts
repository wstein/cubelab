import assert from "node:assert/strict";
import {test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as PieceReducer from "../../src/State/PieceReducer.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import * as BeginnerSolver from "../../src/Solver/BeginnerSolver.res.mjs";
import {invertPieceState, relativeAcademyState, type CubeState, type PieceState} from "../../src/client/academy-target";

const solved = StateTypes.solved(3)._0 as CubeState;

const apply = (algorithm: string): CubeState => {
  const result = MoveExecutor.parseAndApply(3, algorithm);
  assert.equal(result.TAG, "Ok", result.TAG === "Error" ? result._0 : "");
  return result._0 as CubeState;
};

const piecesFor = (state: CubeState): PieceState => {
  const result = PieceReducer.reduce(state);
  assert.equal(result.TAG, "Ok");
  return result._0 as PieceState;
};

const stateForPieces = (pieces: PieceState): CubeState => {
  const result = PieceReducer.reconstruct(pieces);
  assert.equal(result.TAG, "Ok");
  return result._0 as CubeState;
};

test("Academy relative state makes an inverse relative transform map setup to target", () => {
  const setup = apply("R U F2 L'");
  const target = apply("R2 U' B");
  const relative = relativeAcademyState(setup, target);
  assert.equal(relative.TAG, "Ok", relative.TAG === "Error" ? relative._0 : "");

  const route = stateForPieces(invertPieceState(piecesFor(relative._0)));
  const reached = stateForPieces(
    // Academy plans solve `relative`; replaying its inverse transform from the
    // physical setup must therefore reach the requested target.
    BeginnerSolver.applyCubie(piecesFor(setup), piecesFor(route)) as PieceState,
  );
  assert.equal(FaceletCodec.render(reached), FaceletCodec.render(target));
});

test("Academy targets reject non-3×3 states", () => {
  const twoByTwo = StateTypes.solved(2)._0 as CubeState;
  const result = relativeAcademyState(solved, twoByTwo);
  assert.equal(result.TAG, "Error");
});

test("Academy targets reject a rotated centre frame", () => {
  const rotated = apply("x R2");
  const result = relativeAcademyState(solved, rotated);
  assert.equal(result.TAG, "Error");
  assert.match(result._0, /standard U\/R\/F centre orientation/);
});
