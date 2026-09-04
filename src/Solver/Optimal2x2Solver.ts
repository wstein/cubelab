import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import {applyTransform, coordinateForCubies, moveTokens, transformations, type Cubies} from "./Canonical2x2";
import {decodeOptimal2x2Tables, OPTIMAL_2X2_TABLE_URL, packedDistance, type Optimal2x2Tables} from "./Optimal2x2Table";

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
export const solve = async (state: unknown): Promise<Optimal2x2Solution> => {
  const tables = await prepareTables();
  let current = cubies(state);
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
  const parsed = MoveParser.parse(2, moves.map((move) => moveTokens[move]).join(" "));
  if (parsed.TAG !== "Ok") throw new Error("The optimal 2×2 solution could not be encoded.");
  const replay = MoveExecutor.applyAlg(state, parsed._0);
  const final = replay.TAG === "Ok" ? cubies(replay._0) : null;
  if (!final || coordinateForCubies(final) !== 0) {
    throw new Error("The optimal 2×2 solution failed verification.");
  }
  return {alg: parsed._0, moveCount: moves.length};
};
