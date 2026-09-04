import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import type {CubeState} from "./cube-gl";
type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};

/** The de-facto Kociemba JSON wrapper around its 54-character URFDLB facelet string. */
export const renderKociembaJsonFacelets = (state: CubeState): Result<string, string> => {
  if (state.size !== 3) {
    return {TAG: "Error", _0: "Kociemba JSON facelets are defined for 3×3×3 only."};
  }
  return {TAG: "Ok", _0: JSON.stringify({facelets: FaceletCodec.render(state)}, null, 2)};
};

/** Parse the strict 3×3 Kociemba JSON wrapper; no application-specific JSON schema. */
export const parseKociembaJsonFacelets = (input: string, size: number): Result<CubeState, string> => {
  if (size !== 3) return {TAG: "Error", _0: "Kociemba JSON facelets are available for 3×3×3 only."};
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return {TAG: "Error", _0: "Invalid JSON facelet state."};
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {TAG: "Error", _0: "Kociemba JSON must be an object with a facelets string."};
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "facelets" || typeof record.facelets !== "string") {
    return {TAG: "Error", _0: "Kociemba JSON must contain exactly one string property: facelets."};
  }
  if (!/^[URFDLB]{54}$/.test(record.facelets)) {
    return {TAG: "Error", _0: "Kociemba JSON facelets must be a 54-character URFDLB string."};
  }
  const parsed = FaceletCodec.parse(3, record.facelets) as Result<CubeState, unknown>;
  return parsed.TAG === "Ok"
    ? parsed
    : {TAG: "Error", _0: "Kociemba JSON facelets have invalid facelet counts or symbols."};
};
