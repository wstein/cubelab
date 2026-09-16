import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";
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

const cornerSamples = (state: CubeState): string =>
  corners.map((position) => `${position}:${cornerColours(state, position)}`).join(" ");

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
  if (format === "singmaster") return renderLargeStickerCycles(state);
  const heading = `Cube Rosetta ${formatName[format]} ${state.size}×${state.size} v1`;
  const inventory = `cp: ${cp}; co: ${co}\ncorners: ${cornerSamples(state)}\nwings: ${edgeSamples(state)}\ncentres: ${centreSamples(state)}`;
  // CP/CO's inventory is self-contained. SSE retains a facelet payload until
  // its published numbered-part spelling can be rendered without ambiguity.
  return {TAG: "Ok", _0: `${heading}\n${inventory}\nstate: ${FaceletCodec.render(state)}`};
};

const stateLocations = (size: number): string[] => faces.flatMap((face) =>
  Array.from({length: size * size}, (_, index) => `${face}${index + 1}`));
const locationIndex = (size: number, token: string): number => {
  const match = /^([URFDLB])(\d+)$/.exec(token);
  if (!match) return -1;
  const face = faces.indexOf(match[1]!);
  const index = Number(match[2]) - 1;
  return face < 0 || index < 0 || index >= size * size ? -1 : face * size * size + index;
};
const flatFacelets = (state: CubeState): string[] => faces.flatMap((face) => state.facelets[storageIndex[face]]!);

/** A complete large-cube cycle convention over numbered sticker locations. */
const renderLargeStickerCycles = (state: CubeState): Result<string, string> => {
  const size = state.size;
  const values = flatFacelets(state);
  const locations = stateLocations(size);
  const sources = new Map<string, number[]>();
  locations.forEach((location, index) => {
    // In a solved cube each sticker's identity is its face colour; consume
    // same-colour identities in row-major order, making centres deterministic.
    const colour = location[0]!;
    if (!sources.has(colour)) sources.set(colour, []);
    sources.get(colour)!.push(index);
  });
  const cursor = new Map<string, number>();
  const destinationForSource = Array.from({length: values.length}, (_, index) => index);
  values.forEach((colour, destination) => {
    const offset = cursor.get(colour) ?? 0;
    const source = sources.get(colour)![offset]!;
    cursor.set(colour, offset + 1);
    destinationForSource[source] = destination;
  });
  const visited = new Set<number>();
  const cycles: string[] = [];
  destinationForSource.forEach((next, start) => {
    if (visited.has(start) || next === start) return;
    const members = [start]; visited.add(start);
    let current = next;
    while (current !== start) { members.push(current); visited.add(current); current = destinationForSource[current]!; }
    cycles.push(`(${members.map((index) => locations[index]!).join(",")})`);
  });
  return {TAG: "Ok", _0: `Cube Rosetta Singmaster sticker cycles ${size}×${size} v1\n${cycles.join(" ")}`};
};

export const looksLikeLargeCubeState = (input: string): boolean =>
  /^Cube Rosetta (?:CP\/CO coordinates|SSE cubie state|Singmaster (?:large|sticker) cycles) [45]×[45] v1\b/m.test(input.trim());

export const parseLargeCubeState = (input: string, size: 4 | 5): Result<CubeState, string> => {
  if (new RegExp(`^Cube Rosetta Singmaster sticker cycles ${size}×${size} v1`, "m").test(input)) {
    const solved = StateTypes.solved(size)._0 as CubeState;
    const facelets = solved.facelets.map((face) => [...face]);
    const flat = flatFacelets({size, facelets});
    for (const match of input.matchAll(/\(([^()]*)\)/g)) {
      const members = match[1]!.split(",").map((token) => locationIndex(size, token.trim()));
      if (members.length < 2 || members.some((index) => index < 0) || new Set(members).size !== members.length) return {TAG: "Error", _0: "Invalid large-cube sticker cycle."};
      const before = [...flat];
      members.forEach((from, index) => { flat[members[(index + 1) % members.length]!] = before[from]!; });
    }
    faces.forEach((face, faceIndex) => { facelets[storageIndex[face]] = flat.slice(faceIndex * size * size, (faceIndex + 1) * size * size); });
    return {TAG: "Ok", _0: {size, facelets}};
  }
  if (new RegExp(`^Cube Rosetta CP/CO coordinates ${size}×${size} v1`, "m").test(input)) {
    const payload = /^state:\s*([URFDLB\s]+)\s*$/mi.exec(input)?.[1];
    if (payload) {
      const parsed = FaceletCodec.parse(size, payload) as Result<CubeState, unknown>;
      return parsed.TAG === "Ok" ? parsed : {TAG: "Error", _0: "The CP/CO large-cube state payload is invalid."};
    }
    const line = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, "m").exec(input)?.[1];
    const cornersLine = line("corners"), wingsLine = line("wings"), centresLine = line("centres");
    if (!cornersLine || !wingsLine || !centresLine) return {TAG: "Error", _0: "CP/CO large-cube state needs corners, wings, and centres inventories."};
    const solved = StateTypes.solved(size)._0 as CubeState;
    const facelets = solved.facelets.map((face) => [...face]);
    const put = (face: string, index: number, colour: string) => { facelets[storageIndex[face]]![index] = colour; };
    const entries = (source: string) => source.split(/\s+/).map((entry) => entry.split(":"));
    try {
      for (const [position, colours] of entries(cornersLine)) {
        if (!position || !colours || position.length !== 3 || colours.length !== 3) throw new Error();
        const lower = position.toLowerCase(); const last = size - 1;
        const gx = lower.includes("r") ? last : 0, gy = lower.includes("u") ? last : 0, gz = lower.includes("f") ? last : 0;
        [...lower].forEach((face, index) => put(face.toUpperCase(), faceletIndex(size, face, gx, gy, gz), colours[index]!.toUpperCase()));
      }
      for (const [position, colours] of entries(wingsLine)) {
        const match = /^([URFDLB]{2})(\d+)$/.exec(position ?? "");
        if (!match || !colours || colours.length !== 2) throw new Error();
        const edge = match[1]!.toLowerCase(), along = Number(match[2]);
        if (along < 1 || along >= size - 1) throw new Error();
        const last = size - 1;
        const gx = edge.includes("r") ? last : edge.includes("l") ? 0 : along;
        const gy = edge.includes("u") ? last : edge.includes("d") ? 0 : along;
        const gz = edge.includes("f") ? last : edge.includes("b") ? 0 : along;
        [...edge].forEach((face, index) => put(face.toUpperCase(), faceletIndex(size, face, gx, gy, gz), colours[index]!.toUpperCase()));
      }
      for (const [position, colour] of entries(centresLine)) {
        const match = /^([URFDLB])(\d+)$/.exec(position ?? "");
        if (!match || !colour || colour.length !== 1) throw new Error();
        const face = match[1]!.toLowerCase(), ordinal = Number(match[2]) - 1, inner = size - 2;
        if (ordinal < 0 || ordinal >= inner * inner) throw new Error();
        put(face.toUpperCase(), (Math.floor(ordinal / inner) + 1) * size + ordinal % inner + 1, colour.toUpperCase());
      }
    } catch { return {TAG: "Error", _0: "Invalid CP/CO large-cube positional inventory."}; }
    const checked = FaceletCodec.parse(size, FaceletCodec.render({size, facelets})) as Result<CubeState, unknown>;
    return checked.TAG === "Ok" ? checked : {TAG: "Error", _0: "Invalid CP/CO large-cube sticker inventory."};
  }
  const heading = new RegExp(`^Cube Rosetta (?:CP/CO coordinates|SSE cubie state|Singmaster large cycles) ${size}×${size} v1\\s*$`, "m");
  if (!heading.test(input)) return {TAG: "Error", _0: `Expected a Cube Rosetta ${size}×${size} large-cube v1 state.`};
  const payload = /^state:\s*([URFDLB\s]+)\s*$/mi.exec(input)?.[1];
  if (!payload) return {TAG: "Error", _0: "Large-cube state is missing its authoritative 'state:' payload."};
  const parsed = FaceletCodec.parse(size, payload) as Result<CubeState, unknown>;
  return parsed.TAG === "Ok" ? parsed : {TAG: "Error", _0: "The large-cube state payload is invalid."};
};
