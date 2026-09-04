import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import type {CubeState} from "./cube-gl";
import {faceletOrder} from "./manual-state";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};

/** The exact portable JSON facelet shape emitted by manual state entry. */
export const renderJsonFacelets = (state: CubeState): string => {
  const perFace = state.size * state.size;
  const facelets = FaceletCodec.render(state);
  return JSON.stringify(Object.fromEntries(faceletOrder.map((face, index) => [
    face,
    [...facelets.slice(index * perFace, (index + 1) * perFace)],
  ])), null, 2);
};

/** Parse only the strict URFDLB array-of-stickers JSON CubeLab exports. */
export const parseJsonFacelets = (input: string, size: number): Result<CubeState, string> => {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return {TAG: "Error", _0: "Invalid JSON facelet state."};
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {TAG: "Error", _0: "JSON facelets must be an object with U, R, F, D, L, and B arrays."};
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== faceletOrder.length || keys.some((key) => !faceletOrder.includes(key as typeof faceletOrder[number]))) {
    return {TAG: "Error", _0: "JSON facelets must contain exactly U, R, F, D, L, and B."};
  }
  const expected = size * size;
  const compact: string[] = [];
  for (const face of faceletOrder) {
    const stickers = record[face];
    if (!Array.isArray(stickers) || stickers.length !== expected || stickers.some((sticker) => typeof sticker !== "string" || !/^[URFDLB]$/.test(sticker))) {
      return {TAG: "Error", _0: `JSON face '${face}' must contain exactly ${expected} U/R/F/D/L/B stickers.`};
    }
    compact.push(...stickers);
  }
  const parsed = FaceletCodec.parse(size, compact.join("")) as Result<CubeState, unknown>;
  return parsed.TAG === "Ok"
    ? parsed
    : {TAG: "Error", _0: "JSON facelets have invalid facelet counts or symbols."};
};
