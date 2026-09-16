import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import type {CubeState} from "./cube-gl";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};
export type LargeStateFormat = "coordinates" | "sse" | "singmaster";

const formatName: Record<LargeStateFormat, string> = {
  coordinates: "CP/CO coordinates",
  sse: "SSE cubie state",
  singmaster: "Singmaster large cycles",
};

const corners = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"];
const edgeNames = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"];
const faces = ["U", "R", "F", "D", "L", "B"];
const storageIndex: Record<string, number> = {U: 0, L: 1, F: 2, R: 3, B: 4, D: 5};

const faceletIndex = (size: number, face: string, gx: number, gy: number, gz: number): number => {
  const last = size - 1;
  const [row, col] = face === "U" ? [gz, gx]
    : face === "D" ? [last - gz, gx]
    : face === "F" ? [last - gy, gx]
    : face === "B" ? [last - gy, last - gx]
    : face === "R" ? [last - gy, last - gz]
    : [last - gy, gz];
  return row * size + col;
};

const cornerColours = (state: CubeState, label: string): string => {
  const last = state.size - 1;
  const gx = label.includes("R") ? last : 0;
  const gy = label.includes("U") ? last : 0;
  const gz = label.includes("F") ? last : 0;
  return [...label].map((face) => state.facelets[storageIndex[face]!]![faceletIndex(state.size, face, gx, gy, gz)]!).join("");
};

const cornerCoordinates = (state: CubeState): {cp: string; co: string} => {
  const colours = corners.map((label) => cornerColours(state, label));
  const cp = colours.map((value) => {
    const found = corners.find((label) => [...label].sort().join("") === [...value].sort().join(""));
    return found ?? value;
  });
  const co = colours.map((value) => String([...value].findIndex((face) => face === "U" || face === "D")));
  return {cp: cp.join(" "), co: co.join(" ")};
};

const edgeSamples = (state: CubeState): string => {
  const n = state.size;
  const slots: string[] = [];
  for (const edge of edgeNames) {
    for (let index = 1; index < n - 1; index += 1) {
      // This is a readable positional inventory, not an asserted physical
      // identity: same-colour wings are deliberately interchangeable.
      const a = edge[0]!;
      const b = edge[1]!;
      const last = n - 1;
      const along = index;
      const gx = a === "R" || b === "R" ? last : a === "L" || b === "L" ? 0 : along;
      const gy = a === "U" || b === "U" ? last : a === "D" || b === "D" ? 0 : along;
      const gz = a === "F" || b === "F" ? last : a === "B" || b === "B" ? 0 : along;
      const colours = [a, b].map((face) => state.facelets[storageIndex[face]!]![faceletIndex(n, face, gx, gy, gz)]!).join("");
      slots.push(`${edge}${index}:${colours}`);
    }
  }
  return slots.join(" ");
};

const centreSamples = (state: CubeState): string => {
  const slots: string[] = [];
  for (const face of faces) {
    let index = 1;
    for (let row = 1; row < state.size - 1; row += 1) for (let col = 1; col < state.size - 1; col += 1) {
      slots.push(`${face}${index}:${state.facelets[storageIndex[face]]![row * state.size + col]!}`);
      index += 1;
    }
  }
  return slots.join(" ");
};

/**
 * Lossless, versioned large-cube interchange envelope.  The inventory gives
 * CP/CO and numbered wing/centre positions a stable, human-readable form;
 * `state` is authoritative because a 4×4/5×5 does not distinguish same-colour
 * wing and centre identities.
 */
export const renderLargeCubeState = (state: CubeState, format: LargeStateFormat): Result<string, string> => {
  if (state.size !== 4 && state.size !== 5) return {TAG: "Error", _0: "Large-cube state notation is available only for 4×4×4 and 5×5×5."};
  const {cp, co} = cornerCoordinates(state);
  const heading = `Cube Rosetta ${formatName[format]} ${state.size}×${state.size} v1`;
  const inventory = format === "singmaster"
    ? `corners: cp ${cp}; co ${co}\nwings: ${edgeSamples(state)}\ncentres: ${centreSamples(state)}`
    : `cp: ${cp}; co: ${co}\nwings: ${edgeSamples(state)}\ncentres: ${centreSamples(state)}`;
  return {TAG: "Ok", _0: `${heading}\n${inventory}\nstate: ${FaceletCodec.render(state)}`};
};

export const looksLikeLargeCubeState = (input: string): boolean =>
  /^Cube Rosetta (?:CP\/CO coordinates|SSE cubie state|Singmaster large cycles) [45]×[45] v1\b/m.test(input.trim());

export const parseLargeCubeState = (input: string, size: 4 | 5): Result<CubeState, string> => {
  const heading = new RegExp(`^Cube Rosetta (?:CP/CO coordinates|SSE cubie state|Singmaster large cycles) ${size}×${size} v1\\s*$`, "m");
  if (!heading.test(input)) return {TAG: "Error", _0: `Expected a Cube Rosetta ${size}×${size} large-cube v1 state.`};
  const payload = /^state:\s*([URFDLB\s]+)\s*$/mi.exec(input)?.[1];
  if (!payload) return {TAG: "Error", _0: "Large-cube state is missing its authoritative 'state:' payload."};
  const parsed = FaceletCodec.parse(size, payload) as Result<CubeState, unknown>;
  return parsed.TAG === "Ok" ? parsed : {TAG: "Error", _0: "The large-cube state payload is invalid."};
};
