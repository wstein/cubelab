import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import {applyTransform, coordinateForCubies, cubiesForCoordinate, moveTokens, rotationTokensToIdentity, transformations, type Cubies} from "./Canonical2x2";
import {decodeOptimal2x2Tables, OPTIMAL_2X2_STATES, OPTIMAL_2X2_TABLE_URL, packedDistance, type Optimal2x2Tables} from "./Optimal2x2Table";

let preparedTables: Optimal2x2Tables | undefined;
let tablesPromise: Promise<Optimal2x2Tables> | undefined;
export const hasPreparedTables = (): boolean => preparedTables !== undefined;
export const prepareTables = (): Promise<Optimal2x2Tables> => {
  if (preparedTables) return Promise.resolve(preparedTables);
  tablesPromise ??= fetch(OPTIMAL_2X2_TABLE_URL).then(async (response) => {
    if (!response.ok) throw new Error("The optimal 2×2 solver table could not be downloaded.");
    preparedTables = decodeOptimal2x2Tables(await response.arrayBuffer());
    return preparedTables;
  }).catch((error: unknown) => { tablesPromise = undefined; throw error; });
  return tablesPromise;
};
const cubies = (state: unknown): Cubies => {
  if ((state as {size?: unknown}).size !== 2) throw new Error("The optimal solver supports only 2×2 cubes.");
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") throw new Error(PieceReducer.describeError(reduced._0));
  return {cp: reduced._0.cp, co: reduced._0.co};
};
export type Optimal2x2Solution = {alg: unknown; moveCount: number};
export type Random2x2StateScramble = {coordinate: number; state: unknown; scramble: unknown; moveCount: number};
export type Random2x2Difficulty = "any" | "3" | "4" | "5+";

const inverseMoveIndex = (move: number): number => {
  const offset = move % 3;
  return move - offset + (offset === 0 ? 2 : offset === 2 ? 0 : 1);
};

const solutionMoves = (tables: Optimal2x2Tables, initial: Cubies): {moves: number[]; final: Cubies} => {
  let current = initial;
  let distance = packedDistance(tables.distance, coordinateForCubies(current));
  const moves: number[] = [];
  while (distance > 0) {
    let found = false;
    for (let move = 0; move < 18; move += 1) {
      const next = applyTransform(current, transformations()[move]!);
      if (packedDistance(tables.distance, coordinateForCubies(next)) !== distance - 1) continue;
      current = next;
      moves.push(move);
      distance -= 1;
      found = true;
      break;
    }
    if (!found) throw new Error("The exact optimal 2×2 table could not reconstruct a solution.");
  }
  return {moves, final: current};
};

const reconstruct = (pieces: Cubies): unknown => {
  const reconstructed = PieceReducer.reconstruct({size: 2, cp: pieces.cp, co: pieces.co, ep: [], eo: []});
  if (reconstructed.TAG !== "Ok") throw new Error(PieceReducer.describeError(reconstructed._0));
  return reconstructed._0;
};

/** Samples each whole-cube-rotation equivalence class with exactly equal probability. */
export const randomCanonicalCoordinate = (random: () => number = Math.random): number => {
  const value = random();
  const bounded = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999999) : 0;
  return Math.floor(bounded * OPTIMAL_2X2_STATES);
};

const matchesDifficulty = (distance: number, difficulty: Random2x2Difficulty): boolean => (
  difficulty === "any" || distance === Number(difficulty) || (difficulty === "5+" && distance >= 5)
);

/** Reconstructs a sampled canonical state, then emits its optimal inverse as a scramble. */
export const randomStateScrambleFromTables = (
  tables: Optimal2x2Tables,
  random: () => number = Math.random,
  difficulty: Random2x2Difficulty = "5+",
): Random2x2StateScramble => {
  let coordinate = randomCanonicalCoordinate(random);
  let attempts = 0;
  while (!matchesDifficulty(packedDistance(tables.distance, coordinate), difficulty)) {
    if (attempts++ === 1_000) throw new Error("The random source did not produce a 2×2 state in the requested drill bucket.");
    coordinate = randomCanonicalCoordinate(random);
  }
  const pieces = cubiesForCoordinate(coordinate);
  const state = reconstruct(pieces);
  const solution = solutionMoves(tables, pieces);
  const solveTokens = [
    ...solution.moves.map((move) => moveTokens[move]!),
    ...rotationTokensToIdentity(solution.final),
  ];
  const scrambleTokens = solveTokens.slice().reverse().map((token) => {
    if (token.endsWith("2")) return token;
    const base = token.endsWith("'") ? token.slice(0, -1) : token;
    return token.endsWith("'") ? base : `${base}'`;
  });
  const parsed = MoveParser.parse(2, scrambleTokens.join(" "));
  if (parsed.TAG !== "Ok") throw new Error("The random 2×2 scramble could not be encoded.");
  const replay = MoveExecutor.applyAlg(reconstruct({cp: Array.from({length: 8}, (_, index) => index), co: Array<number>(8).fill(0)}), parsed._0);
  if (replay.TAG !== "Ok" || coordinateForCubies(cubies(replay._0)) !== coordinate) {
    throw new Error("The random 2×2 scramble did not replay to the sampled state.");
  }
  return {coordinate, state, scramble: parsed._0, moveCount: solution.moves.length};
};

export const randomStateScramble = async (
  random: () => number = Math.random,
  difficulty: Random2x2Difficulty = "5+",
): Promise<Random2x2StateScramble> => randomStateScrambleFromTables(await prepareTables(), random, difficulty);
export const solve = async (state: unknown): Promise<Optimal2x2Solution> => {
  const tables = await prepareTables();
  const solution = solutionMoves(tables, cubies(state));
  const moves = solution.moves;
  const parsed = MoveParser.parse(2, moves.map((move) => moveTokens[move]).join(" "));
  if (parsed.TAG !== "Ok") throw new Error("The optimal 2×2 solution could not be encoded.");
  const replay = MoveExecutor.applyAlg(state, parsed._0);
  const final = replay.TAG === "Ok" ? cubies(replay._0) : null;
  if (!final || coordinateForCubies(final) !== 0) {
    throw new Error("The optimal 2×2 solution failed verification.");
  }
  return {alg: parsed._0, moveCount: moves.length};
};
