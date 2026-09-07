import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";

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
