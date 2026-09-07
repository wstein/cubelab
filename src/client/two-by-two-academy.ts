import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import {applyTransform, moveTokens, transformations, type Cubies} from "../Solver/Canonical2x2";

/**
 * A 2×2 has no fixed centres. The final Academy goal therefore accepts every
 * monochrome whole-cube orientation rather than one particular URFDLB frame.
 */
export const isMonochromeSolved2x2 = (state: unknown): boolean => {
  const facelets = FaceletCodec.render(state);
  return facelets.length === 24
    && Array.from({length: 6}, (_, face) => {
      const stickers = facelets.slice(face * 4, face * 4 + 4);
      return stickers.length === 4 && stickers.split("").every((colour) => colour === stickers[0]);
    }).every(Boolean);
};

export type TwoByTwoPhaseStatus = {
  firstLayer: boolean;
  orientLastLayer: boolean;
  permuteLastLayer: boolean;
};

/**
 * The reducer's corner order is URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB.
 * A Beginner/Ortega route fixes the four D-layer corners first, then orients
 * the remaining U-layer corners, and finally permutes those corners.
 */
export const twoByTwoPhaseStatus = (state: unknown): TwoByTwoPhaseStatus => {
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") {
    return {firstLayer: false, orientLastLayer: false, permuteLastLayer: false};
  }
  const {cp, co} = reduced._0 as {cp: number[]; co: number[]};
  const firstLayer = [4, 5, 6, 7].every((slot) => cp[slot] === slot && co[slot] === 0);
  const orientLastLayer = firstLayer && [0, 1, 2, 3].every((slot) => co[slot] === 0);
  return {
    firstLayer,
    orientLastLayer,
    permuteLastLayer: isMonochromeSolved2x2(state),
  };
};

export const twoByTwoBeginnerPhaseDefinitions = [
  {
    number: 1,
    title: "Build the first layer",
    instruction: "Place and orient the four bottom-layer corners without relying on fixed centres.",
  },
  {
    number: 2,
    title: "Orient last-layer corners",
    instruction: "Keep the first layer intact while turning every last-layer corner upright.",
  },
  {
    number: 3,
    title: "Permute last-layer corners",
    instruction: "Cycle the oriented last-layer corners until all six faces are monochrome.",
  },
] as const;

export type TwoByTwoBeginnerRouteVerification =
  | {ok: true; finalState: unknown}
  | {ok: false; phase: 1 | 2 | 3; message: string};

/**
 * Verifies the exact staged promise shown by the Academy cards. A planner may
 * choose any algorithms, but it cannot promote a route to the UI unless every
 * boundary reaches the corresponding teaching goal.
 */
export const verifyTwoByTwoBeginnerRoute = (
  initialState: unknown,
  phaseAlgorithms: readonly [unknown, unknown, unknown],
): TwoByTwoBeginnerRouteVerification => {
  let state = initialState;
  for (let index = 0; index < phaseAlgorithms.length; index += 1) {
    const replay = MoveExecutor.applyAlg(state, phaseAlgorithms[index]);
    if (replay.TAG !== "Ok") {
      return {ok: false, phase: (index + 1) as 1 | 2 | 3, message: "The phase algorithm could not be replayed."};
    }
    state = replay._0;
    const status = twoByTwoPhaseStatus(state);
    if (index === 0 && !status.firstLayer) {
      return {ok: false, phase: 1, message: "Phase 1 did not build the first layer."};
    }
    if (index === 1 && !status.orientLastLayer) {
      return {ok: false, phase: 2, message: "Phase 2 did not orient the last-layer corners."};
    }
    if (index === 2 && !status.permuteLastLayer) {
      return {ok: false, phase: 3, message: "Phase 3 did not leave every face monochrome."};
    }
  }
  return {ok: true, finalState: state};
};

type ExactTwoByTwoSolution = {alg: unknown; moveCount: number};
type ExactTwoByTwoSolver = (state: unknown) => Promise<ExactTwoByTwoSolution>;
export type TwoByTwoPblPlan =
  | {ok: true; phaseAlgorithms: [unknown, unknown, unknown]; moveCount: number}
  | {ok: false; message: string};

/**
 * The final Beginner/Ortega stage is exactly the remaining corner
 * permutation. The exact solver is permitted here only after the preceding
 * instructional states are already true, then its output is rechecked through
 * the same three-boundary contract used by the future full planner.
 */
export const planTwoByTwoPblFinish = async (
  state: unknown,
  solveExactly: ExactTwoByTwoSolver,
): Promise<TwoByTwoPblPlan> => {
  const status = twoByTwoPhaseStatus(state);
  if (!status.firstLayer || !status.orientLastLayer) {
    return {ok: false, message: "PBL planning requires the first layer and OLL to be complete."};
  }
  const solution = await solveExactly(state);
  const verification = verifyTwoByTwoBeginnerRoute(state, [[], [], solution.alg]);
  if (!verification.ok) return {ok: false, message: verification.message};
  return {ok: true, phaseAlgorithms: [[], [], solution.alg], moveCount: solution.moveCount};
};

type TwoByTwoOllPlan = {ok: true; algorithm: unknown; moveCount: number} | {ok: false; message: string};
const ollMoveIndices = [0, 1, 2, 6, 7, 8, 12, 13, 14]; // U, R, F and inverses/halves
const faceForMove = (move: number): number => Math.floor(move / 3);
const firstLayerGoal = (state: Cubies): boolean =>
  [4, 5, 6, 7].every((slot) => state.cp[slot] === slot && state.co[slot] === 0);
const ollGoal = (state: Cubies): boolean =>
  firstLayerGoal(state)
  && [0, 1, 2, 3].every((slot) => state.co[slot] === 0);

type TwoByTwoStagePlan = {ok: true; algorithm: unknown; moveCount: number} | {ok: false; message: string};
const searchStage = (
  initial: Cubies,
  goal: (state: Cubies) => boolean,
  maximumDepth: number,
): number[] | null => {
  if (goal(initial)) return [];
  const transforms = transformations();
  const search = (current: Cubies, remaining: number, previousFace: number | null, path: number[]): number[] | null => {
    if (goal(current)) return path;
    if (remaining === 0) return null;
    for (const move of ollMoveIndices) {
      const face = faceForMove(move);
      if (face === previousFace) continue;
      const found = search(applyTransform(current, transforms[move]!), remaining - 1, face, [...path, move]);
      if (found !== null) return found;
    }
    return null;
  };
  for (let depth = 1; depth <= maximumDepth; depth += 1) {
    const found = search(initial, depth, null, []);
    if (found !== null) return found;
  }
  return null;
};
const encodeStage = (moves: number[]): TwoByTwoStagePlan => {
  const parsed = MoveParser.parse(2, moves.map((move) => moveTokens[move]).join(" "));
  return parsed.TAG === "Ok"
    ? {ok: true, algorithm: parsed._0, moveCount: moves.length}
    : {ok: false, message: "The staged 2×2 route could not be encoded."};
};

/** Finds a bounded U/R/F route to four correctly placed and oriented D-layer corners. */
export const planTwoByTwoFirstLayer = (state: unknown, maximumDepth = 8): TwoByTwoStagePlan => {
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") return {ok: false, message: "The 2×2 state could not be reduced to corners."};
  const moves = searchStage(reduced._0 as Cubies, firstLayerGoal, maximumDepth);
  return moves === null
    ? {ok: false, message: `No first-layer route was found within ${maximumDepth} moves.`}
    : encodeStage(moves);
};

/**
 * Searches the small first-layer-preserving OLL space with U/R/F turns. The
 * search is deliberately bounded: it is a phase planner, not a fallback full
 * 2×2 solver (PBL remains delegated to the verified exact table).
 */
export const planTwoByTwoOll = (state: unknown, maximumDepth = 8): TwoByTwoOllPlan => {
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") return {ok: false, message: "The 2×2 state could not be reduced to corners."};
  const initial = reduced._0 as Cubies;
  if (!twoByTwoPhaseStatus(state).firstLayer) {
    return {ok: false, message: "OLL planning requires the first layer to be complete."};
  }
  const moves = searchStage(initial, ollGoal, maximumDepth);
  if (moves !== null) return encodeStage(moves);
  return {ok: false, message: `No first-layer-preserving OLL route was found within ${maximumDepth} moves.`};
};
