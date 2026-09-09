import {KPattern, type KPatternData} from "cubing/kpuzzle";
import {puzzles} from "cubing/puzzles";

import * as FaceletCodec from "./FaceletCodec.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as Orbit64Codec from "./Orbit64Codec.res.mjs";
import * as PieceReducer from "./PieceReducer.res.mjs";
import * as StateTypes from "./StateTypes.res.mjs";

type CubeState = {size: number; facelets: unknown};
type Result<T> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: string};

const cornerSlots = [0, 3, 2, 1, 4, 5, 6, 7];
const edgeSlots = [1, 0, 3, 2, 5, 4, 7, 6, 8, 9, 11, 10];
const centreIndices = [4, 13, 22, 31, 40, 49];

const frameRotations = [
  "", "y", "y2", "y'",
  "x", "x y", "x y2", "x y'",
  "x2", "x2 y", "x2 y2", "x2 y'",
  "x'", "x' y", "x' y2", "x' y'",
  "z", "z y", "z y2", "z y'",
  "z'", "z' y", "z' y2", "z' y'",
];

const ok = <T>(value: T): Result<T> => ({TAG: "Ok", _0: value});
const fail = <T>(message: string): Result<T> => ({TAG: "Error", _0: message});

const inverseRotation = (rotation: string): string => rotation
  .split(" ")
  .filter(Boolean)
  .reverse()
  .map(move => move.endsWith("2") ? move : move.endsWith("'") ? move.slice(0, -1) : `${move}'`)
  .join(" ");

const apply = (state: CubeState, algorithm: string): Result<CubeState> => {
  if (algorithm === "") return ok(state);
  const parsed = MoveParser.parse(state.size, algorithm);
  if (parsed.TAG === "Error") return fail(parsed._0.message);
  const applied = MoveExecutor.applyAlg(state, parsed._0);
  return applied.TAG === "Ok" ? ok(applied._0) : fail("could not apply a whole-cube rotation");
};

const centres = (state: CubeState): string => {
  const facelets = FaceletCodec.render(state);
  return centreIndices.map(index => facelets[index]).join("");
};

const rotationForState = (state: CubeState): Result<string> => {
  const solved = StateTypes.solved(3);
  if (solved.TAG === "Error") return fail("could not construct a solved 3x3x3");
  const wanted = centres(state);
  for (const rotation of frameRotations) {
    const candidate = apply(solved._0, rotation);
    if (candidate.TAG === "Ok" && centres(candidate._0) === wanted) return ok(rotation);
  }
  return fail("fixed centres are not a right-handed whole-cube frame");
};

const patternData = (pieces: {cp: number[]; co: number[]; ep: number[]; eo: number[]}): KPatternData => ({
  CORNERS: {
    pieces: cornerSlots.map(slot => cornerSlots.indexOf(pieces.cp[slot])),
    orientation: cornerSlots.map(slot => pieces.co[slot]),
  },
  EDGES: {
    pieces: edgeSlots.map(slot => edgeSlots.indexOf(pieces.ep[slot])),
    orientation: edgeSlots.map(slot => pieces.eo[slot]),
  },
  CENTERS: {
    pieces: [0, 1, 2, 3, 4, 5],
    orientation: [0, 0, 0, 0, 0, 0],
    orientationMod: [1, 1, 1, 1, 1, 1],
  },
});

const piecesFromPattern = (data: KPatternData) => {
  const cp = Array(8).fill(0);
  const co = Array(8).fill(0);
  const ep = Array(12).fill(0);
  const eo = Array(12).fill(0);
  for (const cubingSlot of cornerSlots.keys()) {
    const slot = cornerSlots[cubingSlot];
    cp[slot] = cornerSlots[data.CORNERS.pieces[cubingSlot]];
    co[slot] = data.CORNERS.orientation[cubingSlot];
  }
  for (const cubingSlot of edgeSlots.keys()) {
    const slot = edgeSlots[cubingSlot];
    ep[slot] = edgeSlots[data.EDGES.pieces[cubingSlot]];
    eo[slot] = data.EDGES.orientation[cubingSlot];
  }
  return {size: 3, cp, co, ep, eo};
};

const kpuzzle = async () => puzzles["3x3x3"].kpuzzle();

const rotationForPattern = async (pattern: KPattern): Promise<Result<string>> => {
  const puzzle = await kpuzzle();
  for (const rotation of frameRotations) {
    const candidate = puzzle.defaultPattern().applyAlg(rotation);
    if (candidate.patternData.CENTERS.pieces.join(",") === pattern.patternData.CENTERS.pieces.join(",")) {
      return ok(rotation);
    }
  }
  return fail("KPattern centres are not a right-handed whole-cube frame");
};

/** Convert a 3x3x3 Orbit64 facelet state into cubing.js's KPattern. */
export const toKPattern = async (state: CubeState): Promise<Result<KPattern>> => {
  if (state.size !== 3) return fail("cubing.js KPattern interop currently supports 3x3x3 only");
  const rotation = rotationForState(state);
  if (rotation.TAG === "Error") return rotation;
  const canonical = Orbit64Codec.canonicaliseState(state);
  if (canonical.TAG === "Error") return fail(canonical._0.message);
  const pieces = PieceReducer.reduce(canonical._0);
  if (pieces.TAG === "Error") return fail(PieceReducer.describeError(pieces._0));
  const pattern = new KPattern(await kpuzzle(), patternData(pieces._0));
  return ok(pattern.applyAlg(rotation._0));
};

/** Convert a cubing.js 3x3x3 KPattern into Orbit64's framed facelet state. */
export const fromKPattern = async (pattern: KPattern): Promise<Result<CubeState>> => {
  const rotation = await rotationForPattern(pattern);
  if (rotation.TAG === "Error") return rotation;
  const canonicalPattern = pattern.applyAlg(inverseRotation(rotation._0));
  const rebuilt = PieceReducer.reconstruct(piecesFromPattern(canonicalPattern.patternData));
  if (rebuilt.TAG === "Error") return fail(PieceReducer.describeError(rebuilt._0));
  return apply(rebuilt._0, rotation._0);
};

/** Decode an Orbit64 token directly into cubing.js's 3x3x3 KPattern. */
export const tokenToKPattern = async (token: string): Promise<Result<KPattern>> => {
  const state = Orbit64Codec.decodeState(token);
  return state.TAG === "Ok" ? toKPattern(state._0) : fail(state._0.message);
};

/** Encode a cubing.js 3x3x3 KPattern as its framed Orbit64 token. */
export const kPatternToToken = async (pattern: KPattern): Promise<Result<string>> => {
  const state = await fromKPattern(pattern);
  if (state.TAG === "Error") return state;
  const token = Orbit64Codec.encodeState(state._0);
  return token.TAG === "Ok" ? ok(token._0) : fail(token._0.message);
};
