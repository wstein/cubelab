import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import {
  decodeOptimal2x2Tables,
  OPTIMAL_2X2_MOVES,
  OPTIMAL_2X2_TABLE_URL,
  packedDistance,
  type Optimal2x2Tables,
} from "./Optimal2x2Table";

const moveTokens = ["U", "U2", "U'", "D", "D2", "D'", "R", "R2", "R'", "L", "L2", "L'", "F", "F2", "F'", "B", "B2", "B'"];
const actions = moveTokens.map((token) => {
  const parsed = MoveParser.parse(2, token);
  if (parsed.TAG !== "Ok") throw new Error(`CubeLab could not prepare the ${token} move.`);
  return parsed._0;
});

let tablesPromise: Promise<Optimal2x2Tables> | undefined;

export const prepareTables = (): Promise<Optimal2x2Tables> => {
  tablesPromise ??= fetch(OPTIMAL_2X2_TABLE_URL)
    .then(async (response) => {
      if (!response.ok) throw new Error("The optimal 2×2 solver table could not be downloaded.");
      return decodeOptimal2x2Tables(await response.arrayBuffer());
    })
    .catch((error: unknown) => {
      tablesPromise = undefined;
      throw error;
    });
  return tablesPromise;
};

const permutationCoordinate = (permutation: readonly number[]): number => {
  let coordinate = 0;
  for (let left = 0; left < 7; left += 1) {
    let smaller = 0;
    for (let right = left + 1; right < 8; right += 1) {
      if (permutation[right]! < permutation[left]!) smaller += 1;
    }
    coordinate = coordinate * (8 - left) + smaller;
  }
  return coordinate;
};

const orientationCoordinate = (orientation: readonly number[]): number =>
  orientation.slice(0, 7).reduce((coordinate, value) => coordinate * 3 + value, 0);

type Coordinates = {permutation: number; orientation: number};
export type Optimal2x2Solution = {alg: unknown; moveCount: number};

const coordinates = (state: unknown): Coordinates => {
  const cube = state as {size?: unknown};
  if (cube.size !== 2) throw new Error("The optimal solver supports only 2×2 cubes.");
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") throw new Error(PieceReducer.describeError(reduced._0));
  return {permutation: permutationCoordinate(reduced._0.cp), orientation: orientationCoordinate(reduced._0.co)};
};

const face = (move: number): number => Math.floor(move / 3);
const isCanonicalSuccessor = (previous: number, next: number): boolean => {
  if (previous < 0) return true;
  const previousFace = face(previous);
  const nextFace = face(next);
  if (previousFace === nextFace) return false;
  // Opposite faces commute. Retaining one order removes duplicate branches
  // without removing any shortest face-turn solution.
  return !(previousFace % 2 === 0 && nextFace === previousFace + 1);
};

const nextCoordinates = (tables: Optimal2x2Tables, current: Coordinates, move: number): Coordinates => ({
  permutation: tables.permutationMoves[current.permutation * OPTIMAL_2X2_MOVES + move]!,
  orientation: tables.orientationMoves[current.orientation * OPTIMAL_2X2_MOVES + move]!,
});

const lowerBound = (tables: Optimal2x2Tables, current: Coordinates): number => Math.max(
  packedDistance(tables.permutationDistance, current.permutation),
  packedDistance(tables.orientationDistance, current.orientation),
);

const search = (
  tables: Optimal2x2Tables,
  current: Coordinates,
  remaining: number,
  previousMove: number,
  path: number[],
): boolean => {
  if (current.permutation === 0 && current.orientation === 0) return true;
  if (lowerBound(tables, current) > remaining || remaining === 0) return false;
  for (let move = 0; move < OPTIMAL_2X2_MOVES; move += 1) {
    if (!isCanonicalSuccessor(previousMove, move)) continue;
    path.push(move);
    if (search(tables, nextCoordinates(tables, current, move), remaining - 1, move, path)) return true;
    path.pop();
  }
  return false;
};

export const solve = async (state: unknown): Promise<Optimal2x2Solution> => {
  const tables = await prepareTables();
  const initial = coordinates(state);
  for (let depth = lowerBound(tables, initial); depth <= 11; depth += 1) {
    const path: number[] = [];
    if (!search(tables, initial, depth, -1, path)) continue;
    const notation = path.map((move) => moveTokens[move]).join(" ");
    const parsed = MoveParser.parse(2, notation);
    if (parsed.TAG !== "Ok") throw new Error("The optimal 2×2 solution could not be encoded.");
    const replay = MoveExecutor.applyAlg(state, parsed._0);
    if (replay.TAG !== "Ok") throw new Error("The optimal 2×2 solution could not be replayed.");
    const final = coordinates(replay._0);
    if (final.permutation !== 0 || final.orientation !== 0) throw new Error("The optimal 2×2 solution failed verification.");
    return {alg: parsed._0, moveCount: path.length};
  }
  throw new Error("No 2×2 solution was found within 11 HTM.");
};
