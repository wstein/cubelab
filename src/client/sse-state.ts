import * as PieceReducer from "../State/PieceReducer.res.mjs";
import type {CubeState} from "./cube-gl";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};

type PartKind = "corner" | "edge" | "centre";
type Part = {prefix: "" | "+" | "-" | "++"; label: string; slot: number; kind: PartKind};

export type SseStateImport = {state: CubeState; ignoredCentreOrientations: string[]};

type LargePart = {prefix: "" | "+" | "-" | "++"; faces: string; index: number; kind: "corner" | "edge" | "centre"};

const cornerLabels = ["urf", "ufl", "ulb", "ubr", "dfr", "dlf", "dbl", "drb"];
const edgeLabels = ["ur", "uf", "ul", "ub", "dr", "df", "dl", "db", "fr", "fl", "bl", "br"];
const centreLabels = ["u", "l", "f", "r", "b", "d"];

const slotFor = (kind: PartKind, label: string): number => {
  const labels = kind === "corner" ? cornerLabels : kind === "edge" ? edgeLabels : centreLabels;
  const wanted = [...label].sort().join("");
  return labels.findIndex((candidate) => [...candidate].sort().join("") === wanted);
};

const parsePart = (source: string): Part => {
  const match = /^(\+\+|\+|-)?([ulfrbd]+)$/.exec(source);
  if (!match) throw new Error(`'${source}' is not an SSE cubie location.`);
  const prefix = (match[1] ?? "") as Part["prefix"];
  const label = match[2]!;
  if (new Set(label).size !== label.length) throw new Error(`'${source}' repeats a face letter.`);
  const kind: PartKind = label.length === 3 ? "corner" : label.length === 2 ? "edge" : "centre";
  if (label.length < 1 || label.length > 3) throw new Error(`'${source}' has an invalid cubie length.`);
  const slot = slotFor(kind, label);
  if (slot < 0) throw new Error(`'${source}' does not name a valid ${kind} location.`);
  if (prefix === "++" && kind !== "centre") throw new Error("'++' is valid only for marked centres.");
  return {prefix, label, slot, kind};
};

const orientationFor = (source: Part, destination: Part): number => {
  const labels = source.kind === "corner" ? cornerLabels : edgeLabels;
  const sourceCanonical = labels[source.slot]!;
  const destinationCanonical = labels[destination.slot]!;
  const modulus = source.kind === "corner" ? 3 : 2;
  for (let orientation = 0; orientation < modulus; orientation += 1) {
    const matches = [...sourceCanonical].every((face, colourIndex) => {
      const sourcePosition = source.label.indexOf(face);
      const targetFace = destination.label[sourcePosition];
      return destinationCanonical[(colourIndex + orientation) % modulus] === targetFace;
    });
    if (matches) return orientation;
  }
  throw new Error(`'${source.label}' → '${destination.label}' has an invalid SSE orientation.`);
};

const prefixOrientation = (part: Part): number => {
  if (part.prefix === "+") return 1;
  if (part.prefix === "-") return part.kind === "corner" ? 2 : 1;
  return 0;
};

/** Whether the text is intended as SSE cubie-state input rather than an algorithm. */
export const looksLikeSseState = (input: string): boolean =>
  /\(\s*(?:\+\+|\+|-)?[ulfrbd]/.test(input);

const largeEdgeLabels = ["ur", "uf", "ul", "ub", "dr", "df", "dl", "db", "fr", "fl", "bl", "br"];
// CubeTwister's Professor Cube part-to-sticker table. Its numbered centres
// are two distinct orbits (diagonal 1–4 and edge 5–8), not a simple ring.
const professorCentres: Record<string, number[]> = {
  r: [18, 16, 6, 8, 13, 17, 11, 7], u: [6, 8, 18, 16, 11, 7, 13, 17],
  f: [16, 6, 8, 18, 17, 11, 7, 13], l: [8, 18, 16, 6, 7, 13, 17, 11],
  d: [8, 18, 16, 6, 7, 13, 17, 11], b: [6, 8, 18, 16, 11, 7, 13, 17],
};
const professorWings: Record<string, Record<string, number>> = {
  ur1: {r: 3, u: 9}, rf1: {r: 15, f: 19}, dr1: {r: 23, d: 19}, bu1: {u: 1, b: 3}, rb1: {r: 19, b: 15}, bd1: {d: 21, b: 23}, ul1: {u: 5, l: 1}, lb1: {l: 15, b: 19}, dl1: {l: 21, d: 15}, fu1: {u: 21, f: 1}, lf1: {f: 15, l: 19}, fd1: {f: 21, d: 1},
  ur2: {r: 1, u: 19}, rf2: {r: 5, f: 9}, dr2: {r: 21, d: 9}, bu2: {u: 3, b: 1}, rb2: {r: 9, b: 5}, bd2: {d: 23, b: 21}, ul2: {u: 15, l: 3}, lb2: {l: 5, b: 9}, dl2: {l: 23, d: 5}, fu2: {u: 23, f: 3}, lf2: {f: 5, l: 9}, fd2: {f: 23, d: 3},
};
const professorMidges: Record<string, Record<string, number>> = {
  ur: {r: 2, u: 14}, rf: {r: 10, f: 14}, dr: {r: 22, d: 14}, bu: {u: 2, b: 2}, rb: {r: 14, b: 10}, bd: {d: 22, b: 22}, ul: {u: 10, l: 2}, lb: {l: 10, b: 14}, dl: {l: 22, d: 10}, fu: {u: 22, f: 2}, lf: {f: 10, l: 14}, fd: {f: 22, d: 2},
};
const faceNormal = (face: string): [number, number, number] => ({u: [0, 1, 0], d: [0, -1, 0], f: [0, 0, 1], b: [0, 0, -1], r: [1, 0, 0], l: [-1, 0, 0]} as Record<string, [number, number, number]>)[face]!;

const parseLargePart = (source: string): LargePart => {
  const match = /^(\+\+|\+|-)?([ulfrbd]{1,3})(\d+)?$/.exec(source);
  if (!match) throw new Error(`'${source}' is not an SSE cubie location.`);
  const faces = match[2]!;
  if (new Set(faces).size !== faces.length) throw new Error(`'${source}' repeats a face letter.`);
  const kind = faces.length === 3 ? "corner" : faces.length === 2 ? "edge" : "centre";
  const index = Number(match[3] ?? "0");
  if (kind === "corner" && index !== 0) throw new Error("SSE corner locations do not take a number.");
  return {prefix: (match[1] ?? "") as LargePart["prefix"], faces, index, kind};
};

const faceletIndex = (size: number, face: string, gx: number, gy: number, gz: number): number => {
  const last = size - 1;
  const [row, col] = face === "u" ? [gz, gx]
    : face === "d" ? [last - gz, gx]
    : face === "f" ? [last - gy, gx]
    : face === "b" ? [last - gy, last - gx]
    : face === "r" ? [last - gy, last - gz]
    : [last - gy, gz];
  return row * size + col;
};

const exposed = (face: string, gx: number, gy: number, gz: number, last: number): boolean => {
  const [x, y, z] = faceNormal(face);
  return (x === 1 && gx === last) || (x === -1 && gx === 0)
    || (y === 1 && gy === last) || (y === -1 && gy === 0)
    || (z === 1 && gz === last) || (z === -1 && gz === 0);
};

const edgeCoordinate = (size: number, part: LargePart): [number, number, number] => {
  const canonicalIndex = largeEdgeLabels.findIndex((label) => [...label].sort().join("") === [...part.faces].sort().join(""));
  if (canonicalIndex < 0) throw new Error(`'${part.faces}' does not name a valid edge location.`);
  const canonical = largeEdgeLabels[canonicalIndex]!;
  const candidates: Array<[number, number, number]> = [];
  for (let gx = 0; gx < size; gx += 1) for (let gy = 0; gy < size; gy += 1) for (let gz = 0; gz < size; gz += 1) {
    const boundaryCount = [gx, gy, gz].filter((value) => value === 0 || value === size - 1).length;
    if (boundaryCount === 2 && exposed(canonical[0]!, gx, gy, gz, size - 1) && exposed(canonical[1]!, gx, gy, gz, size - 1)) candidates.push([gx, gy, gz]);
  }
  const offset = part.faces === canonical ? part.index - 1 : candidates.length - part.index;
  if (offset < 0 || offset >= candidates.length) throw new Error(`'${part.faces}${part.index}' does not name a valid edge wing.`);
  return candidates[offset]!;
};

const centreCoordinate = (size: number, part: LargePart): [number, number, number] => {
  const inner = size - 2;
  let row: number;
  let col: number;
  if (size === 5) {
    const ring: Array<[number, number]> = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]];
    [row, col] = ring[part.index - 1] ?? (() => { throw new Error(`'${part.faces}${part.index}' does not name a valid centre.`); })();
  } else {
    if (part.index < 1 || part.index > inner * inner) throw new Error(`'${part.faces}${part.index}' does not name a valid centre.`);
    row = Math.floor((part.index - 1) / inner);
    col = (part.index - 1) % inner;
  }
  const last = size - 1;
  const face = part.faces;
  return face === "u" ? [col + 1, last, row + 1]
    : face === "d" ? [col + 1, 0, last - row - 1]
    : face === "f" ? [col + 1, last - row - 1, last]
    : face === "b" ? [last - col - 1, last - row - 1, 0]
    : face === "r" ? [last, last - row - 1, last - col - 1]
    : [0, last - row - 1, col + 1];
};

const cornerCoordinate = (size: number, part: LargePart): [number, number, number] => {
  const candidates: Array<[number, number, number]> = [];
  for (const gx of [0, size - 1]) for (const gy of [0, size - 1]) for (const gz of [0, size - 1]) {
    if ([...part.faces].every((face) => exposed(face, gx, gy, gz, size - 1))) candidates.push([gx, gy, gz]);
  }
  if (candidates.length !== 1) throw new Error(`'${part.faces}' does not name a valid corner location.`);
  return candidates[0]!;
};

const largeLocations = (size: number, part: LargePart): Array<[string, number]> => {
  if (size === 5 && part.kind === "centre") {
    if (part.index === 0) return [[part.faces, 12]];
    const index = professorCentres[part.faces]?.[part.index - 1];
    if (index === undefined) throw new Error(`'${part.faces}${part.index}' does not name a valid centre.`);
    return [[part.faces, index]];
  }
  if (size === 5 && part.kind === "edge") {
    if (part.index === 0) {
      const midge = professorMidges[part.faces] ?? professorMidges[[...part.faces].reverse().join("")];
      if (midge) return [...part.faces].map((face) => [face, midge[face]!]);
    }
    const wing = professorWings[`${part.faces}${part.index}`];
    if (wing) return [...part.faces].map((face) => [face, wing[face]!]);
    const reversed = professorWings[`${[...part.faces].reverse().join("")}${3 - part.index}`];
    if (reversed) return [...part.faces].map((face) => [face, reversed[face]!]);
  }
  const coordinate = part.kind === "corner"
    ? cornerCoordinate(size, part)
    : part.kind === "edge" ? edgeCoordinate(size, part) : centreCoordinate(size, part);
  return [...part.faces].map((face) => [face, faceletIndex(size, face, ...coordinate)]);
};

/** Applies SSE's numbered wing and centre cycles directly to 4×4/5×5 facelets. */
const parseLargeSseState = (input: string, size: 4 | 5): Result<SseStateImport, string> => {
  const cycles = [...input.matchAll(/\(([^()]*)\)/g)];
  if (cycles.length === 0) return {TAG: "Error", _0: "Expected at least one SSE permutation cycle."};
  if (input.replace(/\(([^()]*)\)/g, "").trim() !== "") return {TAG: "Error", _0: "Unexpected SSE state input."};
  try {
    const facelets = ["U", "L", "F", "R", "B", "D"].map((face) => Array.from({length: size * size}, () => face));
    const faceOffset: Record<string, number> = {u: 0, l: 1, f: 2, r: 3, b: 4, d: 5};
    const used = new Set<string>();
    const ignoredCentreOrientations: string[] = [];
    for (const cycleMatch of cycles) {
      const parts = cycleMatch[1]!.split(",").map((value) => parseLargePart(value.trim()));
      if (parts.length === 0 || cycleMatch[1]!.trim() === "") throw new Error("SSE cycles may not be empty.");
      const kind = parts[0]!.kind;
      if (!parts.every((part) => part.kind === kind)) throw new Error("Each SSE cycle must contain only corners, edges, or centres.");
      if (kind !== "centre" && parts.slice(1).some((part) => part.prefix !== "")) throw new Error("An SSE orientation prefix is allowed only on the first part of a cycle.");
      const locations = parts.map((part) => {
        const key = `${part.faces}${part.index}`;
        if (used.has(key)) throw new Error(`'${key}' appears in more than one SSE cycle.`);
        used.add(key);
        if (kind === "centre" && part.prefix !== "") ignoredCentreOrientations.push(`${part.prefix}${key}`);
        return largeLocations(size, part);
      });
      const before = facelets.map((face) => [...face]);
      for (let i = 0; i < locations.length; i += 1) {
        const source = locations[i]!;
        const destination = locations[(i + 1) % locations.length]!;
        if (source.length !== destination.length) throw new Error("Each SSE cycle must contain matching cube parts.");
        source.forEach(([sourceFace, sourceIndex], sticker) => {
          const [destinationFace, destinationIndex] = destination[sticker]!;
          facelets[faceOffset[destinationFace]!]![destinationIndex] = before[faceOffset[sourceFace]!]![sourceIndex]!;
        });
      }
    }
    return {TAG: "Ok", _0: {state: {size, facelets}, ignoredCentreOrientations}};
  } catch (reason) {
    return {TAG: "Error", _0: reason instanceof Error ? reason.message : String(reason)};
  }
};

/**
 * Parses CubeTwister / Randelshofer SSE permutation cycles into validated
 * 2×2 or 3×3 cubie coordinates. A 2×2 has corners only; centre rotations are
 * syntactically retained as warnings for 3×3 because colour-only facelets
 * cannot represent a logo's orientation.
 */
export const parseSseState = (input: string, size: 2 | 3 | 4 | 5 = 3): Result<SseStateImport, string> => {
  if (size === 4 || size === 5) return parseLargeSseState(input, size);
  const cycles = [...input.matchAll(/\(([^()]*)\)/g)];
  if (cycles.length === 0) return {TAG: "Error", _0: "Expected at least one SSE permutation cycle."};
  const remainder = input.replace(/\(([^()]*)\)/g, "").trim();
  if (remainder !== "") return {TAG: "Error", _0: `Unexpected SSE state input '${remainder}'.`};

  try {
    const cp = cornerLabels.map((_, index) => index);
    const co = cornerLabels.map(() => 0);
    const ep = edgeLabels.map((_, index) => index);
    const eo = edgeLabels.map(() => 0);
    const usedCorners = new Set<number>();
    const usedEdges = new Set<number>();
    const ignoredCentreOrientations: string[] = [];

    for (const cycleMatch of cycles) {
      const source = cycleMatch[1]!.trim();
      if (source === "") throw new Error("SSE cycles may not be empty.");
      const parts = source.split(",").map((part) => parsePart(part.trim()));
      const kind = parts[0]!.kind;
      if (!parts.every((part) => part.kind === kind)) {
        throw new Error("Each SSE cycle must contain only corners, edges, or centres.");
      }
      if (size === 2 && kind !== "corner") {
        throw new Error("A 2×2 SSE state may describe corners only.");
      }
      if (parts.slice(1).some((part) => part.prefix !== "")) {
        throw new Error("An SSE orientation prefix is allowed only on the first part of a cycle.");
      }
      if (new Set(parts.map((part) => part.slot)).size !== parts.length) {
        throw new Error("An SSE cycle may not repeat a cubie location.");
      }

      if (kind === "centre") {
        if (parts.length !== 1) throw new Error("3×3 SSE centre cycles may only describe one centre.");
        if (parts[0]!.prefix !== "") ignoredCentreOrientations.push(`${parts[0]!.prefix}${parts[0]!.label}`);
        continue;
      }

      const used = kind === "corner" ? usedCorners : usedEdges;
      for (const part of parts) {
        if (used.has(part.slot)) throw new Error(`'${part.label}' appears in more than one SSE cycle.`);
        used.add(part.slot);
      }
      const modulus = kind === "corner" ? 3 : 2;
      for (let index = 0; index < parts.length; index += 1) {
        const from = parts[index]!;
        const to = parts[(index + 1) % parts.length]!;
        const orientation = (orientationFor(from, to) + (index + 1 === parts.length ? prefixOrientation(parts[0]!) : 0)) % modulus;
        if (kind === "corner") {
          cp[to.slot] = from.slot;
          co[to.slot] = orientation;
        } else {
          ep[to.slot] = from.slot;
          eo[to.slot] = orientation;
        }
      }
    }

    const reconstructed = PieceReducer.reconstruct({
      size,
      cp,
      co,
      ep: size === 3 ? ep : [],
      eo: size === 3 ? eo : [],
    }) as Result<CubeState, unknown>;
    return reconstructed.TAG === "Ok"
      ? {TAG: "Ok", _0: {state: reconstructed._0, ignoredCentreOrientations}}
      : {TAG: "Error", _0: PieceReducer.describeError(reconstructed._0) as string};
  } catch (reason) {
    return {TAG: "Error", _0: reason instanceof Error ? reason.message : String(reason)};
  }
};

/** Renders a 2×2 or 3×3 state as SSE cycles with orientation-bearing cubie spellings. */
export const renderSseState = (state: CubeState): Result<string, string> => {
  if (state.size !== 2 && state.size !== 3) return {TAG: "Error", _0: "SSE state output is available only for 2×2×2 and 3×3×3."};
  const reduced = PieceReducer.reduce(state) as Result<{cp: number[]; co: number[]; ep: number[]; eo: number[]}, unknown>;
  if (reduced.TAG === "Error") return {TAG: "Error", _0: PieceReducer.describeError(reduced._0) as string};
  const cycles = (permutation: number[], orientations: number[], labels: string[]) => {
    const visited = new Set<number>();
    const output: string[] = [];
    const orientationBetween = (source: string, destination: string, sourceSlot: number, destinationSlot: number, modulus: number) => {
      const sourceCanonical = labels[sourceSlot]!;
      const destinationCanonical = labels[destinationSlot]!;
      for (let orientation = 0; orientation < modulus; orientation += 1) {
        const matches = [...sourceCanonical].every((face, colourIndex) => {
          const sourcePosition = source.indexOf(face);
          return destinationCanonical[(colourIndex + orientation) % modulus] === destination[sourcePosition];
        });
        if (matches) return orientation;
      }
      return -1;
    };
    const spellDestination = (source: string, sourceSlot: number, destinationSlot: number, orientation: number) => {
      const destination = new Array<string>(source.length);
      for (let colourIndex = 0; colourIndex < source.length; colourIndex += 1) {
        const position = source.indexOf(labels[sourceSlot]![colourIndex]!);
        destination[position] = labels[destinationSlot]![(colourIndex + orientation) % source.length]!;
      }
      return destination.join("");
    };
    const spellCycle = (members: number[]) => {
      const modulus = labels[0]!.length;
      if (members.length === 1) {
        const orientation = orientations[members[0]]!;
        const prefix = orientation === 0 ? "" : orientation === 1 ? "+" : "-";
        return `(${prefix}${labels[members[0]]!})`;
      }
      const spellings = [labels[members[0]]!];
      for (let index = 1; index < members.length; index += 1) {
        spellings.push(spellDestination(spellings[index - 1]!, members[index - 1]!, members[index]!, orientations[members[index]!]!));
      }
      const closingOrientation = orientationBetween(
        spellings[spellings.length - 1]!,
        spellings[0]!,
        members[members.length - 1]!,
        members[0]!,
        modulus,
      );
      const prefixOrientation = (orientations[members[0]]! - closingOrientation + modulus) % modulus;
      const prefix = prefixOrientation === 0 ? "" : prefixOrientation === 1 ? "+" : "-";
      return `(${prefix}${spellings.join(",")})`;
    };
    for (let start = 0; start < permutation.length; start += 1) {
      if (visited.has(start)) continue;
      const members = [start];
      visited.add(start);
      if (permutation[start] === start) {
        if (orientations[start] !== 0) output.push(spellCycle(members));
        continue;
      }
      let current = start;
      while (true) {
        const next = permutation.findIndex((piece) => piece === current);
        if (next === start) break;
        members.push(next);
        visited.add(next);
        current = next;
      }
      output.push(spellCycle(members));
    }
    return output;
  };
  const tokens = [
    ...cycles(reduced._0.cp, reduced._0.co, cornerLabels),
    ...(state.size === 3 ? cycles(reduced._0.ep, reduced._0.eo, edgeLabels) : []),
  ];
  // A singleton is an explicit, state-neutral SSE spelling for a solved cube.
  return {TAG: "Ok", _0: tokens.length === 0 ? state.size === 3 ? "(u)" : "(urf)" : tokens.join(" ")};
};
