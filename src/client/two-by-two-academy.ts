import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import {applyTransform, moveTokens, transformations} from "../Solver/Canonical2x2.res.mjs";

export type Cubies = {cp: number[]; co: number[]};

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
 * A Beginner/Ortega route fixes the four U-layer (white) corners first, then
 * orients the remaining D-layer (yellow) corners, and finally permutes them.
 */
export const twoByTwoPhaseStatus = (state: unknown): TwoByTwoPhaseStatus => {
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") {
    return {firstLayer: false, orientLastLayer: false, permuteLastLayer: false};
  }
  const {cp, co} = reduced._0 as {cp: number[]; co: number[]};
  const firstLayer = [0, 1, 2, 3].every((slot) => cp[slot] === slot && co[slot] === 0);
  const orientLastLayer = firstLayer && [4, 5, 6, 7].every((slot) => co[slot] === 0);
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
    instruction: "Place and orient the four white bottom-layer corners without relying on fixed centres.",
  },
  {
    number: 2,
    title: "Orient last-layer corners",
    instruction: "Keep the white first layer intact while turning every yellow last-layer corner upright.",
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
const whiteOllMoveIndices = [3, 4, 5, 6, 7, 8, 12, 13, 14]; // D, R, F and inverses/halves
const whiteFirstLayerMoveIndices = Array.from({length: 15}, (_, offset) => offset + 3); // every non-U face turn
const faceForMove = (move: number): number => Math.floor(move / 3);
const firstLayerGoal = (state: Cubies): boolean =>
  [0, 1, 2, 3].every((slot) => state.cp[slot] === slot && state.co[slot] === 0);
const ollGoal = (state: Cubies): boolean =>
  firstLayerGoal(state)
  && [4, 5, 6, 7].every((slot) => state.co[slot] === 0);

type TwoByTwoStagePlan = {ok: true; algorithm: unknown; moveCount: number} | {ok: false; message: string};
const searchStage = (
  initial: Cubies,
  goal: (state: Cubies) => boolean,
  maximumDepth: number,
  allowedMoves = whiteOllMoveIndices,
): number[] | null => {
  if (goal(initial)) return [];
  const transforms = transformations();
  const search = (current: Cubies, remaining: number, previousFace: number | null, path: number[]): number[] | null => {
    if (goal(current)) return path;
    if (remaining === 0) return null;
    for (const move of allowedMoves) {
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

type WhiteFirstLayerParent = {next: string | null; move: number | null};
let whiteFirstLayerParents: Map<string, WhiteFirstLayerParent> | null = null;

/**
 * The stage only cares about the four white-layer corner cubies. Searching
 * their projection backwards from the 648 legal completed-layer states avoids
 * spending the UI worker's time distinguishing irrelevant yellow-layer
 * permutations. The resulting table is shared by all Academy requests.
 */
const whiteFirstLayerKey = (state: Cubies): string => [0, 1, 2, 3].map((piece) => {
  const slot = state.cp.indexOf(piece);
  return `${slot}:${state.co[slot]}`;
}).join(",");

const inverseMoveIndex = (move: number): number => {
  const offset = move % 3;
  return move - offset + (offset === 0 ? 2 : offset === 2 ? 0 : 1);
};

const prepareWhiteFirstLayerParents = (): Map<string, WhiteFirstLayerParent> => {
  if (whiteFirstLayerParents !== null) return whiteFirstLayerParents;
  const solved: Cubies = {cp: Array.from({length: 8}, (_, index) => index), co: Array<number>(8).fill(0)};
  const key = whiteFirstLayerKey(solved);
  const parents = new Map<string, WhiteFirstLayerParent>([[key, {next: null, move: null}]]);
  const queue: Array<{state: Cubies; key: string; depth: number}> = [{state: solved, key, depth: 0}];
  const transforms = transformations();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (current.depth === 11) continue;
    for (const move of whiteFirstLayerMoveIndices) {
      const predecessor = applyTransform(current.state, transforms[inverseMoveIndex(move)]!);
      const predecessorKey = whiteFirstLayerKey(predecessor);
      if (parents.has(predecessorKey)) continue;
      parents.set(predecessorKey, {next: current.key, move});
      queue.push({state: predecessor, key: predecessorKey, depth: current.depth + 1});
    }
  }
  whiteFirstLayerParents = parents;
  return parents;
};

const planWhiteFirstLayer = (state: Cubies, maximumDepth: number): number[] | null => {
  const parents = prepareWhiteFirstLayerParents();
  let key = whiteFirstLayerKey(state);
  const moves: number[] = [];
  while (true) {
    const step = parents.get(key);
    if (step === undefined) return null;
    if (step.move === null || step.next === null) break;
    moves.push(step.move);
    key = step.next;
  }
  return moves.length <= maximumDepth ? moves : null;
};

/** Finds a table-backed non-U route to four correctly placed and oriented white-layer corners. */
export const planTwoByTwoFirstLayer = (state: unknown, maximumDepth = 11): TwoByTwoStagePlan => {
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") return {ok: false, message: "The 2×2 state could not be reduced to corners."};
  const moves = planWhiteFirstLayer(reduced._0 as Cubies, maximumDepth);
  return moves === null
    ? {ok: false, message: `No first-layer route was found within ${maximumDepth} moves.`}
    : encodeStage(moves);
};

/**
 * Searches the small first-layer-preserving OLL space with D/R/F turns. The
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

export type TwoByTwoBeginnerPlan =
  | {ok: true; phaseAlgorithms: [unknown, unknown, unknown]; moveCount: number}
  | {ok: false; message: string};

const applyAcademyPhase = (state: unknown, algorithm: unknown): {ok: true; state: unknown} | {ok: false; message: string} => {
  const replay = MoveExecutor.applyAlg(state, algorithm);
  return replay.TAG === "Ok"
    ? {ok: true, state: replay._0}
    : {ok: false, message: "A generated 2×2 Academy phase could not be replayed."};
};

/** Builds the complete Beginner/Ortega route, proving every phase boundary. */
export const planTwoByTwoBeginnerRoute = async (
  initialState: unknown,
  solveExactly: ExactTwoByTwoSolver,
): Promise<TwoByTwoBeginnerPlan> => {
  const firstLayer = planTwoByTwoFirstLayer(initialState);
  if (!firstLayer.ok) return firstLayer;
  const afterFirstLayer = applyAcademyPhase(initialState, firstLayer.algorithm);
  if (!afterFirstLayer.ok) return afterFirstLayer;

  const oll = planTwoByTwoOll(afterFirstLayer.state);
  if (!oll.ok) return oll;
  const afterOll = applyAcademyPhase(afterFirstLayer.state, oll.algorithm);
  if (!afterOll.ok) return afterOll;

  const pbl = await planTwoByTwoPblFinish(afterOll.state, solveExactly);
  if (!pbl.ok) return pbl;
  const phaseAlgorithms: [unknown, unknown, unknown] = [firstLayer.algorithm, oll.algorithm, pbl.phaseAlgorithms[2]];
  const verification = verifyTwoByTwoBeginnerRoute(initialState, phaseAlgorithms);
  if (!verification.ok) return {ok: false, message: verification.message};
  return {
    ok: true,
    phaseAlgorithms,
    moveCount: firstLayer.moveCount + oll.moveCount + pbl.moveCount,
  };
};

/**
 * A 2×2 has neither fixed centres nor edge cubies. This Academy calls its
 * small-corner route Petrus-inspired rather than Petrus: it teaches a square,
 * then the adjacent back pair, in a reference frame chosen once per setup.
 *
 * The four frames are equivalent views around the white first layer. Their
 * index is retained with the route so every phase is measured against the
 * same white-first teaching frame.
 */
const petrusFrameSlots = (frame: number): {firstSquare: readonly [number, number]; backPair: readonly [number, number]} => {
  const frames = [
    {firstSquare: [1, 2], backPair: [2, 6]}, // UFL, ULB · ULB, DBL
    {firstSquare: [2, 3], backPair: [3, 7]}, // ULB, UBR · UBR, DRB
    {firstSquare: [3, 0], backPair: [0, 4]}, // UBR, URF · URF, DFR
    {firstSquare: [0, 1], backPair: [1, 5]}, // URF, UFL · UFL, DLF
  ] as const;
  return frames[((frame % frames.length) + frames.length) % frames.length]!;
};

const petrusFrameLabels = ["ULB", "UBR", "URF", "UFL"] as const;

/** Human-readable name for the Academy-relative frame locked with a route. */
export const twoByTwoPetrusFrameLabel = (frame: number): string =>
  petrusFrameLabels[((frame % petrusFrameLabels.length) + petrusFrameLabels.length) % petrusFrameLabels.length]!;

const correctlySolvedSlots = (state: Cubies, slots: readonly number[]): boolean =>
  slots.every((slot) => state.cp[slot] === slot && state.co[slot] === 0);

export type TwoByTwoPetrusPhaseStatus = {
  firstSquare: boolean;
  backPair: boolean;
  finish: boolean;
};

export const twoByTwoPetrusPhaseStatus = (state: unknown, frame: number): TwoByTwoPetrusPhaseStatus => {
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") return {firstSquare: false, backPair: false, finish: false};
  const slots = petrusFrameSlots(frame);
  const cubies = reduced._0 as Cubies;
  const firstSquare = correctlySolvedSlots(cubies, slots.firstSquare);
  return {
    firstSquare,
    backPair: firstSquare && correctlySolvedSlots(cubies, slots.backPair),
    finish: isMonochromeSolved2x2(state),
  };
};

export const twoByTwoPetrusPhaseDefinitions = [
  {
    number: 1,
    title: "Build the first square / block",
    instruction: "Build the two-corner square on the white first layer in the Academy-relative frame selected for this setup.",
  },
  {
    number: 2,
    title: "Complete the back pair",
    instruction: "Keep that square and complete its adjacent back-corner pair in the locked frame.",
  },
  {
    number: 3,
    title: "Finish the corner relation",
    instruction: "Use the remaining corner relation to finish; any monochrome whole-cube orientation is solved.",
  },
] as const;

export type TwoByTwoPetrusRouteVerification =
  | {ok: true; finalState: unknown}
  | {ok: false; phase: 1 | 2 | 3; message: string};

export const verifyTwoByTwoPetrusRoute = (
  initialState: unknown,
  frame: number,
  phaseAlgorithms: readonly [unknown, unknown, unknown],
): TwoByTwoPetrusRouteVerification => {
  let state = initialState;
  for (let index = 0; index < phaseAlgorithms.length; index += 1) {
    const replay = MoveExecutor.applyAlg(state, phaseAlgorithms[index]);
    if (replay.TAG !== "Ok") {
      return {ok: false, phase: (index + 1) as 1 | 2 | 3, message: "The Petrus-inspired phase algorithm could not be replayed."};
    }
    state = replay._0;
    const status = twoByTwoPetrusPhaseStatus(state, frame);
    if (index === 0 && !status.firstSquare) {
      return {ok: false, phase: 1, message: "Phase 1 did not build the selected first square."};
    }
    if (index === 1 && !status.backPair) {
      return {ok: false, phase: 2, message: "Phase 2 did not complete the selected back pair."};
    }
    if (index === 2 && !status.finish) {
      return {ok: false, phase: 3, message: "Phase 3 did not leave every face monochrome."};
    }
  }
  return {ok: true, finalState: state};
};

const petrusFrameScore = (state: Cubies, frame: number): number => {
  const slots = petrusFrameSlots(frame);
  const firstSquare = slots.firstSquare.filter((slot) => state.cp[slot] === slot && state.co[slot] === 0).length;
  const backPair = slots.backPair.filter((slot) => state.cp[slot] === slot && state.co[slot] === 0).length;
  return firstSquare * 10 + backPair;
};

/** Select once, deterministically, then preserve the most promising white-first view throughout the lesson. */
export const selectTwoByTwoPetrusFrame = (state: unknown): number => {
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") return 0;
  const cubies = reduced._0 as Cubies;
  return [0, 1, 2, 3].reduce((best, frame) =>
    petrusFrameScore(cubies, frame) > petrusFrameScore(cubies, best) ? frame : best, 0);
};

export type TwoByTwoPetrusPlan =
  | {ok: true; frame: number; phaseAlgorithms: [unknown, unknown, unknown]; moveCount: number}
  | {ok: false; message: string};

/** Plans and replay-verifies a three-phase, frame-locked 2×2 Petrus-inspired route. */
export const planTwoByTwoPetrusRoute = async (
  initialState: unknown,
  solveExactly: ExactTwoByTwoSolver,
): Promise<TwoByTwoPetrusPlan> => {
  const reduced = PieceReducer.reduce(initialState);
  if (reduced.TAG !== "Ok") return {ok: false, message: "The 2×2 state could not be reduced to corners."};
  const frame = selectTwoByTwoPetrusFrame(initialState);
  const slots = petrusFrameSlots(frame);
  const firstMoves = searchStage(reduced._0 as Cubies, (state) => correctlySolvedSlots(state, slots.firstSquare), 8, whiteOllMoveIndices);
  if (firstMoves === null) return {ok: false, message: "No first-square route was found within 8 moves."};
  const firstSquare = encodeStage(firstMoves);
  if (!firstSquare.ok) return firstSquare;
  const afterFirstSquare = applyAcademyPhase(initialState, firstSquare.algorithm);
  if (!afterFirstSquare.ok) return afterFirstSquare;

  const afterFirstReduced = PieceReducer.reduce(afterFirstSquare.state);
  if (afterFirstReduced.TAG !== "Ok") return {ok: false, message: "The first-square state could not be reduced to corners."};
  const allBackSlots = [...new Set([...slots.firstSquare, ...slots.backPair])];
  const backMoves = searchStage(afterFirstReduced._0 as Cubies, (state) => correctlySolvedSlots(state, allBackSlots), 8, whiteOllMoveIndices);
  if (backMoves === null) return {ok: false, message: "No first-square-preserving back-pair route was found within 8 moves."};
  const backPair = encodeStage(backMoves);
  if (!backPair.ok) return backPair;
  const afterBackPair = applyAcademyPhase(afterFirstSquare.state, backPair.algorithm);
  if (!afterBackPair.ok) return afterBackPair;

  const finish = await solveExactly(afterBackPair.state);
  const phaseAlgorithms: [unknown, unknown, unknown] = [firstSquare.algorithm, backPair.algorithm, finish.alg];
  const verification = verifyTwoByTwoPetrusRoute(initialState, frame, phaseAlgorithms);
  if (!verification.ok) return {ok: false, message: verification.message};
  return {ok: true, frame, phaseAlgorithms, moveCount: firstSquare.moveCount + backPair.moveCount + finish.moveCount};
};
