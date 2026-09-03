import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";
import {OPTIMAL_2X2_STATES} from "./Optimal2x2Table";

export const moveTokens = ["U", "U2", "U'", "D", "D2", "D'", "R", "R2", "R'", "L", "L2", "L'", "F", "F2", "F'", "B", "B2", "B'"];
export type Cubies = {cp: number[]; co: number[]};
export type Transform = Cubies;
const identity = (): Cubies => ({cp: Array.from({length: 8}, (_, i) => i), co: Array<number>(8).fill(0)});
const stateKey = ({cp, co}: Cubies): string => `${cp.join(",")}/${co.join(",")}`;

export const applyTransform = (state: Cubies, transform: Transform): Cubies => ({
  cp: transform.cp.map((source) => state.cp[source]!),
  co: transform.cp.map((source, target) => (state.co[source]! + transform.co[target]!) % 3),
});
const compose = (left: Transform, right: Transform): Transform => applyTransform(right, left);
const transformFor = (token: string): Transform => {
  const parsed = MoveParser.parse(2, token);
  const solved = StateTypes.solved(2);
  if (parsed.TAG !== "Ok" || solved.TAG !== "Ok") throw new Error(`Could not prepare ${token}.`);
  const moved = MoveExecutor.applyAlg(solved._0, parsed._0);
  if (moved.TAG !== "Ok") throw new Error(`Could not apply ${token}.`);
  const reduced = PieceReducer.reduce(moved._0);
  if (reduced.TAG !== "Ok") throw new Error(`Could not reduce ${token}.`);
  return {cp: reduced._0.cp, co: reduced._0.co};
};
const moveTransforms = moveTokens.map(transformFor);
const rotations = (() => {
  const generators = [transformFor("x"), transformFor("y"), transformFor("z")];
  const values = [identity()];
  const seen = new Set([stateKey(values[0]!)]);
  for (let index = 0; index < values.length; index += 1) for (const generator of generators) {
    const next = compose(generator, values[index]!);
    if (!seen.has(stateKey(next))) { seen.add(stateKey(next)); values.push(next); }
  }
  if (values.length !== 24) throw new Error("Could not generate the 24 cube orientations.");
  return values;
})();
const anchor = (() => {
  const lookup = Array<number>(24).fill(-1);
  rotations.forEach((rotation, index) => { lookup[rotation.cp[0]! * 3 + (3 - rotation.co[0]!) % 3] = index; });
  if (lookup.some((value) => value < 0)) throw new Error("Could not anchor 2×2 orientations.");
  return lookup;
})();
const rank = (values: readonly number[]): number => {
  let output = 0;
  for (let left = 0; left < values.length - 1; left += 1) {
    let smaller = 0;
    for (let right = left + 1; right < values.length; right += 1) if (values[right]! < values[left]!) smaller += 1;
    output = output * (values.length - left) + smaller;
  }
  return output;
};
const unrank = (coordinate: number): number[] => {
  const available = Array.from({length: 7}, (_, i) => i + 1);
  const output = [0]; let remaining = coordinate;
  for (let slot = 0; slot < 7; slot += 1) {
    let factorial = 1; for (let i = 2; i < 7 - slot; i += 1) factorial *= i;
    const selected = factorial === 0 ? 0 : Math.floor(remaining / factorial);
    output.push(available.splice(selected, 1)[0]!);
    remaining = factorial === 0 ? 0 : remaining % factorial;
  }
  return output;
};
const orientationRank = (co: readonly number[]): number => co.slice(1, 7).reduce((value, next) => value * 3 + next, 0);
const orientationUnrank = (coordinate: number): number[] => {
  const co = Array<number>(8).fill(0); let remaining = coordinate; let sum = 0;
  for (let slot = 6; slot >= 1; slot -= 1) { co[slot] = remaining % 3; sum += co[slot]!; remaining = Math.floor(remaining / 3); }
  co[7] = (3 - sum % 3) % 3; return co;
};
export const canonical = (state: Cubies): Cubies => {
  const slot = state.cp.indexOf(0);
  if (slot < 0) throw new Error("The 2×2 corner permutation is invalid.");
  return applyTransform(state, rotations[anchor[slot * 3 + state.co[slot]!]!]!);
};
export const coordinateForCubies = (state: Cubies): number => {
  const value = canonical(state);
  const coordinate = rank(value.cp.slice(1).map((piece) => piece - 1)) * 729 + orientationRank(value.co);
  if (coordinate < 0 || coordinate >= OPTIMAL_2X2_STATES) throw new Error("The canonical 2×2 coordinate is invalid.");
  return coordinate;
};
export const cubiesForCoordinate = (coordinate: number): Cubies => ({cp: unrank(Math.floor(coordinate / 729)), co: orientationUnrank(coordinate % 729)});
export const transitionCoordinate = (coordinate: number, move: number): number => coordinateForCubies(applyTransform(cubiesForCoordinate(coordinate), moveTransforms[move]!));
export const transformations = (): readonly Transform[] => moveTransforms;
