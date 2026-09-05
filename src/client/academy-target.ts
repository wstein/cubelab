import * as PieceReducer from "../State/PieceReducer.res.mjs";
import * as BeginnerSolver from "../Solver/BeginnerSolver.res.mjs";

export type Result<T, E = string> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};
export type CubeState = {size: number; facelets: string[][]};
export type PieceState = {size: number; cp: number[]; co: number[]; ep: number[]; eo: number[]};

/** Return the cubie transform that reverses `pieces`. */
export const invertPieceState = (pieces: PieceState): PieceState => {
  const cp = Array.from({length: 8}, () => 0);
  const co = Array.from({length: 8}, () => 0);
  const ep = Array.from({length: 12}, () => 0);
  const eo = Array.from({length: 12}, () => 0);
  pieces.cp.forEach((piece, slot) => {
    cp[piece] = slot;
    co[piece] = (3 - pieces.co[slot]) % 3;
  });
  pieces.ep.forEach((piece, slot) => {
    ep[piece] = slot;
    eo[piece] = (2 - pieces.eo[slot]) % 2;
  });
  return {size: pieces.size, cp, co, ep, eo};
};

/**
 * Convert a setup → target request into the setup-relative state expected by
 * Academy solvers, which always plan a route to their canonical solved state.
 * A solution for target⁻¹ ∘ setup maps the original setup to target.
 */
const standardCentreOrder = "U, R, F, D, L, B";

/** Centre facelet of each face block, in slot order, for the error diagnostic below. */
const centreOrder = (state: CubeState): string =>
  state.facelets.map((face) => face[4]).join(", ");

const nonCanonicalFrameError = (role: "Setup" | "Target", state: CubeState): string =>
  `${role} must use the standard U/R/F centre orientation (expected ${standardCentreOrder}; ` +
  `received ${centreOrder(state)}). Use x, y, or z in moves to regrip instead.`;

export const relativeAcademyState = (
  setup: CubeState,
  target: CubeState,
): Result<CubeState> => {
  if (setup.size !== 3 || target.size !== 3) {
    return {TAG: "Error", _0: "Academy setup and target must both be valid 3×3 cube states."};
  }
  const setupPieces = PieceReducer.reduce(setup) as Result<PieceState, unknown>;
  const targetPieces = PieceReducer.reduce(target) as Result<PieceState, unknown>;
  if (setupPieces.TAG === "Error" || targetPieces.TAG === "Error") {
    return {TAG: "Error", _0: "Academy setup and target must both be valid 3×3 cube states."};
  }
  // PieceReducer.reduce is centre-driven and accepts any of the 24 whole-cube
  // rotations, but relativeAcademyState and its callers assume the standard
  // frame (face turns never relocate centres, so a rotated setup can never
  // replay to a standard-frame target's exact facelets). Reject early with a
  // diagnostic instead of silently solving in the wrong frame.
  const canonicalSetup = PieceReducer.reconstruct(setupPieces._0) as Result<CubeState, unknown>;
  if (canonicalSetup.TAG === "Error" || !sameFacelets(canonicalSetup._0, setup)) {
    return {TAG: "Error", _0: nonCanonicalFrameError("Setup", setup)};
  }
  const canonicalTarget = PieceReducer.reconstruct(targetPieces._0) as Result<CubeState, unknown>;
  if (canonicalTarget.TAG === "Error" || !sameFacelets(canonicalTarget._0, target)) {
    return {TAG: "Error", _0: nonCanonicalFrameError("Target", target)};
  }
  const relativePieces = BeginnerSolver.applyCubie(
    invertPieceState(targetPieces._0),
    setupPieces._0,
  ) as PieceState;
  const reconstructed = PieceReducer.reconstruct(relativePieces) as Result<CubeState, unknown>;
  return reconstructed.TAG === "Ok"
    ? {TAG: "Ok", _0: reconstructed._0}
    : {TAG: "Error", _0: "Could not construct the relative setup-to-target state."};
};

const sameFacelets = (left: CubeState, right: CubeState): boolean =>
  left.size === right.size
  && left.facelets.every((face, index) => face.join("") === right.facelets[index]?.join(""));
