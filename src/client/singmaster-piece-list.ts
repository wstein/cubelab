import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";
import type {CubeState} from "./cube-gl";
import {
  manualStateCornerSlots,
  manualStateEdgeSlots,
  type ManualStateSize,
} from "./manual-state";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};

/**
 * The numbered position order used by CubeLab's Singmaster piece-list card.
 * Keep the labels, their display order, and their matching facelet slots in
 * one place: this format is deliberately designed for humans to audit and
 * for Setup to paste back without an implicit piece-order convention.
 */
const cornerOrder = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"] as const;
const edgeOrder = ["DR", "UB", "DL", "UF", "UR", "DB", "UL", "DF", "FL", "FR", "BR", "BL"] as const;

const canonicalCorners = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"] as const;
const canonicalEdges = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"] as const;

const slotsFor = (size: ManualStateSize, labels: readonly string[], canonical: readonly string[]): number[][] => {
  const slots = labels === cornerOrder ? manualStateCornerSlots(size) : manualStateEdgeSlots();
  return labels.map((label) => slots[canonical.indexOf(label)]!);
};

const parseLines = (input: string, kind: "Corner" | "Edge", expected: number): Result<string[], string> => {
  const matcher = new RegExp(`^${kind}\\s+(\\d+)\\s*:\\s*([URFDLB]+)\\s*$`, "i");
  const values = Array<string>(expected);
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const matching = lines.filter((line) => new RegExp(`^${kind}\\b`, "i").test(line));
  if (matching.length !== expected) {
    return {TAG: "Error", _0: `Expected ${expected} numbered ${kind.toLowerCase()} lines.`};
  }
  for (const line of matching) {
    const match = matcher.exec(line);
    if (!match) return {TAG: "Error", _0: `Invalid ${kind.toLowerCase()} line '${line}'.`};
    const number = Number(match[1]);
    const value = match[2]!.toUpperCase();
    const length = kind === "Corner" ? 3 : 2;
    if (!Number.isInteger(number) || number < 1 || number > expected || values[number - 1] !== undefined) {
      return {TAG: "Error", _0: `${kind} positions must be numbered 1 through ${expected} exactly once.`};
    }
    if (value.length !== length || new Set(value).size !== length) {
      return {TAG: "Error", _0: `'${value}' is not a valid ${kind.toLowerCase()} sticker spelling.`};
    }
    values[number - 1] = value;
  }
  return values.some((value) => value === undefined)
    ? {TAG: "Error", _0: `${kind} positions must be numbered 1 through ${expected} exactly once.`}
    : {TAG: "Ok", _0: values};
};

/** Whether text is intended as CubeLab's explicitly numbered piece-list format. */
export const looksLikeSingmasterPieceList = (input: string): boolean => /^\s*Corner\s+\d+\s*:/im.test(input);

/** Render a state in the fixed, numbered Singmaster piece-position order. */
export const renderSingmasterPieceList = (state: CubeState): Result<string, string> => {
  if (state.size !== 2 && state.size !== 3) {
    return {TAG: "Error", _0: "Singmaster piece-list output is available only for 2×2×2 and 3×3×3."};
  }
  const reduced = PieceReducer.reduce(state) as Result<unknown, unknown>;
  if (reduced.TAG === "Error") return {TAG: "Error", _0: PieceReducer.describeError(reduced._0) as string};
  const facelets = FaceletCodec.render(state);
  const size = state.size as ManualStateSize;
  const lines = slotsFor(size, cornerOrder, canonicalCorners)
    .map((slot, index) => `Corner ${index + 1}: ${slot.map((facelet) => facelets[facelet]).join("")}`);
  if (size === 3) {
    lines.push(...slotsFor(size, edgeOrder, canonicalEdges)
      .map((slot, index) => `Edge ${index + 1}: ${slot.map((facelet) => facelets[facelet]).join("")}`));
  }
  return {TAG: "Ok", _0: lines.join("\n")};
};

/** Parse the fixed numbered piece-list format and reject physically impossible cubes. */
export const parseSingmasterPieceList = (input: string, size: ManualStateSize): Result<CubeState, string> => {
  const corners = parseLines(input, "Corner", 8);
  if (corners.TAG === "Error") return corners;
  const edges = size === 3 ? parseLines(input, "Edge", 12) : {TAG: "Ok", _0: [] as string[]};
  if (edges.TAG === "Error") return edges;
  const knownLines = 8 + (size === 3 ? 12 : 0);
  if (input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length !== knownLines) {
    return {TAG: "Error", _0: "Piece lists may contain only numbered Corner and Edge lines."};
  }

  const facelets = FaceletCodec.render(StateTypes.solved(size)._0 as CubeState).split("");
  slotsFor(size, cornerOrder, canonicalCorners).forEach((slot, position) => {
    slot.forEach((facelet, sticker) => { facelets[facelet] = corners._0[position]![sticker]!; });
  });
  if (size === 3) {
    slotsFor(size, edgeOrder, canonicalEdges).forEach((slot, position) => {
      slot.forEach((facelet, sticker) => { facelets[facelet] = edges._0[position]![sticker]!; });
    });
  }
  const parsed = FaceletCodec.parse(size, facelets.join("")) as Result<CubeState, unknown>;
  if (parsed.TAG === "Error") return {TAG: "Error", _0: "The piece list has invalid facelet counts or symbols."};
  const reduced = PieceReducer.reduce(parsed._0) as Result<unknown, unknown>;
  return reduced.TAG === "Ok"
    ? {TAG: "Ok", _0: parsed._0}
    : {TAG: "Error", _0: PieceReducer.describeError(reduced._0) as string};
};
