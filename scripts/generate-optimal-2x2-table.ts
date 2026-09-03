import {mkdir, writeFile} from "node:fs/promises";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as PieceReducer from "../src/State/PieceReducer.res.mjs";
import {
  OPTIMAL_2X2_MOVES,
  OPTIMAL_2X2_ORIENTATIONS,
  OPTIMAL_2X2_PERMUTATIONS,
  encodeOptimal2x2Tables,
  type Optimal2x2Tables,
} from "../src/Solver/Optimal2x2Table";

const moveTokens = ["U", "U2", "U'", "D", "D2", "D'", "R", "R2", "R'", "L", "L2", "L'", "F", "F2", "F'", "B", "B2", "B'"];
const actions = moveTokens.map((token) => {
  const parsed = MoveParser.parse(2, token);
  if (parsed.TAG !== "Ok") throw new Error(`Could not parse ${token}.`);
  return parsed._0;
});

const permutationFromCoordinate = (coordinate: number): number[] => {
  const available = Array.from({length: 8}, (_, index) => index);
  const output: number[] = [];
  let remaining = coordinate;
  for (let slot = 0; slot < 8; slot += 1) {
    let factorial = 1;
    for (let factor = 2; factor < 8 - slot; factor += 1) factorial *= factor;
    const selected = factorial === 0 ? 0 : Math.floor(remaining / factorial);
    output.push(available.splice(selected, 1)[0]!);
    remaining = factorial === 0 ? 0 : remaining % factorial;
  }
  return output;
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

const orientationFromCoordinate = (coordinate: number): number[] => {
  const orientation = Array<number>(8).fill(0);
  let remaining = coordinate;
  let sum = 0;
  for (let slot = 6; slot >= 0; slot -= 1) {
    const value = remaining % 3;
    orientation[slot] = value;
    sum += value;
    remaining = Math.floor(remaining / 3);
  }
  orientation[7] = (3 - (sum % 3)) % 3;
  return orientation;
};

const orientationCoordinate = (orientation: readonly number[]): number =>
  orientation.slice(0, 7).reduce((coordinate, value) => coordinate * 3 + value, 0);

const transition = (cp: number[], co: number[], action: unknown): {cp: number[]; co: number[]} => {
  const state = PieceReducer.reconstruct({size: 2, cp, co, ep: [], eo: []});
  if (state.TAG !== "Ok") throw new Error("Could not reconstruct a legal 2×2 state.");
  const next = MoveExecutor.applyAlg(state._0, action);
  if (next.TAG !== "Ok") throw new Error("Could not apply a legal 2×2 move.");
  const pieces = PieceReducer.reduce(next._0);
  if (pieces.TAG !== "Ok") throw new Error("Could not reduce a legal 2×2 state.");
  return {cp: pieces._0.cp, co: pieces._0.co};
};

const packedDistances = (moves: Uint16Array, states: number): Uint8Array => {
  const distances = new Uint8Array(Math.ceil(states / 2)).fill(255);
  const get = (coordinate: number): number => {
    const value = distances[Math.floor(coordinate / 2)]!;
    return coordinate % 2 === 0 ? value & 15 : value >>> 4;
  };
  const set = (coordinate: number, distance: number): void => {
    const index = Math.floor(coordinate / 2);
    const value = distances[index]!;
    distances[index] = coordinate % 2 === 0 ? (value & 240) | distance : (value & 15) | (distance << 4);
  };
  const queue = new Uint32Array(states);
  let head = 0;
  let tail = 1;
  set(0, 0);
  while (head < tail) {
    const coordinate = queue[head++]!;
    const distance = get(coordinate);
    for (let move = 0; move < OPTIMAL_2X2_MOVES; move += 1) {
      const next = moves[coordinate * OPTIMAL_2X2_MOVES + move]!;
      if (get(next) !== 15) continue;
      set(next, distance + 1);
      queue[tail++] = next;
    }
  }
  return distances;
};

const buildTables = (): Optimal2x2Tables => {
  const permutationMoves = new Uint16Array(OPTIMAL_2X2_PERMUTATIONS * OPTIMAL_2X2_MOVES);
  const orientationMoves = new Uint16Array(OPTIMAL_2X2_ORIENTATIONS * OPTIMAL_2X2_MOVES);
  const solvedPermutation = Array.from({length: 8}, (_, index) => index);
  const solvedOrientation = Array<number>(8).fill(0);

  for (let coordinate = 0; coordinate < OPTIMAL_2X2_PERMUTATIONS; coordinate += 1) {
    const cp = permutationFromCoordinate(coordinate);
    for (let move = 0; move < OPTIMAL_2X2_MOVES; move += 1) {
      permutationMoves[coordinate * OPTIMAL_2X2_MOVES + move] = permutationCoordinate(transition(cp, solvedOrientation, actions[move]).cp);
    }
  }
  for (let coordinate = 0; coordinate < OPTIMAL_2X2_ORIENTATIONS; coordinate += 1) {
    const co = orientationFromCoordinate(coordinate);
    for (let move = 0; move < OPTIMAL_2X2_MOVES; move += 1) {
      orientationMoves[coordinate * OPTIMAL_2X2_MOVES + move] = orientationCoordinate(transition(solvedPermutation, co, actions[move]).co);
    }
  }
  return {
    permutationMoves,
    orientationMoves,
    permutationDistance: packedDistances(permutationMoves, OPTIMAL_2X2_PERMUTATIONS),
    orientationDistance: packedDistances(orientationMoves, OPTIMAL_2X2_ORIENTATIONS),
  };
};

const tables = buildTables();
await mkdir("public/solver", {recursive: true});
await writeFile("public/solver/optimal-2x2.v1.bin", new Uint8Array(encodeOptimal2x2Tables(tables)));
