import * as PieceReducer from "../State/PieceReducer.res.mjs";
import type {CubeState} from "./cube-gl";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};
type Kind = "corner" | "edge";
type Constraint = {cp: Array<number | null>; co: Array<number | null>; ep: Array<number | null>; eo: Array<number | null>};

const corners = ["urf", "ufl", "ulb", "ubr", "dfr", "dlf", "dbl", "drb"];
const edges = ["ur", "uf", "ul", "ub", "dr", "df", "dl", "db", "fr", "fl", "bl", "br"];
// ACube 4 positional states enumerate the U layer clockwise from UF, then
// the D layer, followed by the four middle edges.  Corners use the same
// clockwise U/D ordering.  This is deliberately not the internal Kociemba
// slot order used by PieceReducer.
const positionalEdges = ["uf", "ur", "ub", "ul", "df", "dr", "db", "dl", "fr", "fl", "br", "bl"];
const positionalCorners = ["ufr", "urb", "ubl", "ulf", "drf", "dfl", "dlb", "dbr"];
const edgeSets: Record<string, string[]> = {
  E: ["fr", "fl", "br", "bl"], S: ["ur", "ul", "dr", "dl"], M: ["uf", "ub", "df", "db"],
  U: ["uf", "ub", "ur", "ul"], D: ["df", "db", "dr", "dl"], F: ["uf", "df", "fr", "fl"],
  B: ["ub", "db", "br", "bl"], L: ["ul", "dl", "fl", "bl"], R: ["ur", "dr", "fr", "br"],
};

const labels = (kind: Kind) => kind === "corner" ? corners : edges;
const positionalLabels = (kind: Kind) => kind === "corner" ? positionalCorners : positionalEdges;
const slotFor = (kind: Kind, name: string) => {
  const wanted = [...name].sort().join("");
  return labels(kind).findIndex((candidate) => [...candidate].sort().join("") === wanted);
};
const positionalLabelFor = (kind: Kind, slot: number): string =>
  positionalLabels(kind).find((label) => slotFor(kind, label) === slot)!;
const identity = (length: number) => Array.from({length}, (_, index) => index);
const blank = (): Constraint => ({cp: identity(8), co: Array(8).fill(0), ep: identity(12), eo: Array(12).fill(0)});

const part = (source: string): {kind: Kind; slot: number; orientation: number} => {
  const name = source.toLowerCase();
  if (!/^[ulfrbd]+$/.test(name) || new Set(name).size !== name.length) throw new Error(`'${source}' is not an ACube cubie name.`);
  const kind: Kind = name.length === 3 ? "corner" : name.length === 2 ? "edge" : (() => { throw new Error(`'${source}' is not an ACube edge or corner.`); })();
  const slot = slotFor(kind, name);
  if (slot < 0) throw new Error(`'${source}' does not name a valid ACube ${kind}.`);
  return {kind, slot, orientation: labels(kind)[slot]!.indexOf(name[0]!)};
};

const applyCycles = (source: string, result: Constraint) => {
  for (const match of source.matchAll(/\(([^()]*)\)/g)) {
    const members = match[1]!.trim().split(/[\s,]+/).filter(Boolean).map(part);
    if (members.length < 2) throw new Error("ACube cycles require at least two cubies.");
    const kind = members[0]!.kind;
    if (!members.every((value) => value.kind === kind) || new Set(members.map((value) => value.slot)).size !== members.length) throw new Error("Each ACube cycle must use distinct cubies of one kind.");
    const permutation = kind === "corner" ? result.cp : result.ep;
    const orientation = kind === "corner" ? result.co : result.eo;
    const modulus = kind === "corner" ? 3 : 2;
    for (let index = 0; index < members.length; index += 1) {
      const from = members[index]!;
      const to = members[(index + 1) % members.length]!;
      permutation[to.slot] = from.slot;
      orientation[to.slot] = (to.orientation - from.orientation + modulus) % modulus;
    }
  }
};

const ignoredPieces = (token: string): Array<{kind: Kind; slot: number}> => {
  const name = token.toUpperCase();
  if (edgeSets[name]) return edgeSets[name]!.map((label) => ({kind: "edge" as const, slot: slotFor("edge", label)}));
  if (name.endsWith("*")) {
    const mask = name.slice(0, -1).toLowerCase();
    return (["corner", "edge"] as const).flatMap((kind) => labels(kind)
      .map((label, slot) => ({kind, slot, label}))
      .filter(({label}) => [...mask].every((face) => label.includes(face)))
      .map(({kind, slot}) => ({kind, slot})));
  }
  const value = part(token);
  return [{kind: value.kind, slot: value.slot}];
};

const removeIgnored = (source: string, result: Constraint) => {
  for (const match of source.matchAll(/\[([^\[\]]*)\]/g)) {
    for (const token of match[1]!.trim().split(/[\s,]+/).filter(Boolean)) {
      for (const ignored of ignoredPieces(token)) {
        const permutation = ignored.kind === "corner" ? result.cp : result.ep;
        const position = permutation.indexOf(ignored.slot);
        if (position >= 0) permutation[position] = null;
      }
    }
  }
};

const applyOrientationTerms = (source: string, result: Constraint) => {
  for (const token of source.trim().split(/[\s,]+/).filter(Boolean)) {
    const match = /^([UDFBLR]{2,3})([+\-?])$/i.exec(token);
    if (!match) throw new Error(`Unexpected ACube state input '${token}'.`);
    const value = part(match[1]!);
    const orientation = value.kind === "corner" ? result.co : result.eo;
    if (match[2] === "?") orientation[value.slot] = null;
    else orientation[value.slot] = ((orientation[value.slot] ?? 0) + (match[2] === "+" ? 1 : value.kind === "corner" ? 2 : 1)) % (value.kind === "corner" ? 3 : 2);
  }
};

const parseCycles = (input: string): Constraint => {
  const result = blank();
  applyCycles(input, result);
  removeIgnored(input, result);
  const rest = input.replace(/\([^()]*\)|\[[^\[\]]*\]/g, " ").trim();
  if (rest) applyOrientationTerms(rest, result);
  return result;
};

const parsePositionalToken = (token: string, kind: Kind, position: string): {piece: number | null; orientation: number | null} => {
  const match = /^(@)?([+\-])?([UDFBLR?]+)$/i.exec(token);
  if (!match) throw new Error(`'${token}' is not an ACube positional token.`);
  const orientationUnknown = match[1] === "@";
  const body = match[3]!;
  const modulus = kind === "corner" ? 3 : 2;
  if (body === "?") return {piece: null, orientation: orientationUnknown ? null : match[2] === "+" ? 1 : match[2] === "-" ? modulus - 1 : 0};
  const value = part(body);
  if (value.kind !== kind) throw new Error(`'${token}' is not an ACube ${kind}.`);
  if (match[2]) throw new Error(`'${token}' may use '+' or '-' only with an unknown cubie.`);
  return {piece: value.slot, orientation: orientationUnknown ? null : acubeOrientation(kind, slotFor(kind, position), value.slot, body.toUpperCase())};
};

const parsePositional = (input: string): Constraint => {
  const tokens = input.trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length !== 20) throw new Error("ACube positional states require 12 edges followed by 8 corners.");
  const result: Constraint = {cp: Array(8).fill(null), co: Array(8).fill(null), ep: Array(12).fill(null), eo: Array(12).fill(null)};
  positionalEdges.forEach((position, index) => { const value = parsePositionalToken(tokens[index]!, "edge", position); const slot = slotFor("edge", position); result.ep[slot] = value.piece; result.eo[slot] = value.orientation; });
  positionalCorners.forEach((position, index) => { const value = parsePositionalToken(tokens[index + 12]!, "corner", position); const slot = slotFor("corner", position); result.cp[slot] = value.piece; result.co[slot] = value.orientation; });
  return result;
};

export const parseAcubeConstraint = (input: string): Result<Constraint, string> => {
  try { return {TAG: "Ok", _0: input.includes("(") || input.includes("[") || /\b[UDFBLR]{2,3}[+\-?](?=$|\s|,)/i.test(input) ? parseCycles(input) : parsePositional(input)}; }
  catch (reason) { return {TAG: "Error", _0: reason instanceof Error ? reason.message : String(reason)}; }
};

export const isFixedAcubeConstraint = (constraint: Constraint): boolean => [...constraint.cp, ...constraint.co, ...constraint.ep, ...constraint.eo].every((value) => value !== null);

const parity = (values: number[]) => values.reduce((total, value, index) => total + values.slice(index + 1).filter((other) => value > other).length, 0) % 2;
const factorial = (value: number): bigint => {
  let result = 1n;
  for (let factor = 2; factor <= value; factor += 1) result *= BigInt(factor);
  return result;
};
const orientationCount = (values: Array<number | null>, modulus: bigint): bigint => {
  const unknown = values.filter((value) => value === null).length;
  if (unknown === 0) return values.reduce((sum, value) => sum + value!, 0) % Number(modulus) === 0 ? 1n : 0n;
  return modulus ** BigInt(unknown - 1);
};
const completeInOrder = (values: Array<number | null>): number[] => {
  const used = values.filter((value): value is number => value !== null);
  const missing = identity(values.length).filter((value) => !used.includes(value));
  let cursor = 0;
  return values.map((value) => value ?? missing[cursor++]!);
};

/** Returns the number of legal completions, before choosing a seeded representative. */
export const countAcubeCompletions = (constraint: Constraint): bigint => {
  const missingCorners = constraint.cp.filter((value) => value === null).length;
  const missingEdges = constraint.ep.filter((value) => value === null).length;
  const permutationPairs = factorial(missingCorners) * factorial(missingEdges);
  // Once either side has two free cubies, exactly half of its completions have
  // each parity. A fully constrained parity mismatch is reported by materialize.
  const parityCount = missingCorners >= 2 || missingEdges >= 2
    ? permutationPairs / 2n
    : parity(completeInOrder(constraint.cp)) === parity(completeInOrder(constraint.ep)) ? permutationPairs : 0n;
  return parityCount * orientationCount(constraint.co, 3n) * orientationCount(constraint.eo, 2n);
};
const randomFromSeed = (seed: string) => { let value = [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 0x45d9f3b), 0x811c9dc5) >>> 0; return () => ((value = (value + 0x6d2b79f5) >>> 0), ((value ^ value >>> 15) * (value | 1) >>> 0) / 0x100000000); };
const fillPermutation = (values: Array<number | null>, random: () => number) => {
  const used = values.filter((value): value is number => value !== null);
  if (new Set(used).size !== used.length) throw new Error("ACube constraints assign one cubie more than once.");
  const missing = identity(values.length).filter((value) => !used.includes(value));
  for (let index = missing.length - 1; index > 0; index -= 1) { const other = Math.floor(random() * (index + 1)); [missing[index], missing[other]] = [missing[other]!, missing[index]!]; }
  let cursor = 0;
  return values.map((value) => value ?? missing[cursor++]!);
};
const fillOrientation = (values: Array<number | null>, modulus: number, random: () => number) => {
  const open = values.map((value, index) => value === null ? index : -1).filter((index) => index >= 0);
  const result = values.map((value) => value ?? 0);
  if (open.length === 0 && result.reduce((sum, value) => sum + value, 0) % modulus !== 0) throw new Error("ACube constraints have an impossible orientation sum.");
  open.slice(0, -1).forEach((index) => { result[index] = Math.floor(random() * modulus); });
  if (open.length > 0) result[open.at(-1)!] = (modulus - result.reduce((sum, value) => sum + value, 0) % modulus) % modulus;
  return result;
};

export const materializeAcubeConstraint = (constraint: Constraint, seed = "acube"): Result<CubeState, string> => {
  try {
    const random = randomFromSeed(seed);
    const cp = fillPermutation(constraint.cp, random), ep = fillPermutation(constraint.ep, random);
    const mutableCorners = constraint.cp.map((value, index) => value === null ? index : -1).filter((index) => index >= 0);
    const mutableEdges = constraint.ep.map((value, index) => value === null ? index : -1).filter((index) => index >= 0);
    if (parity(cp) !== parity(ep)) {
      const swap = mutableCorners.length >= 2 ? mutableCorners : mutableEdges.length >= 2 ? mutableEdges : null;
      if (!swap) throw new Error("ACube constraints force mismatched corner and edge permutation parity.");
      const target = swap === mutableCorners ? cp : ep;
      [target[swap[0]!], target[swap[1]!]] = [target[swap[1]!], target[swap[0]!]];
    }
    const reconstructed = PieceReducer.reconstruct({size: 3, cp, co: fillOrientation(constraint.co, 3, random), ep, eo: fillOrientation(constraint.eo, 2, random)}) as Result<CubeState, unknown>;
    return reconstructed.TAG === "Ok" ? reconstructed : {TAG: "Error", _0: PieceReducer.describeError(reconstructed._0) as string};
  } catch (reason) { return {TAG: "Error", _0: reason instanceof Error ? reason.message : String(reason)}; }
};

const storageIndex: Record<string, number> = {u: 0, l: 1, f: 2, r: 3, b: 4, d: 5};

const faceletIndex = (face: string, gx: number, gy: number, gz: number): number => {
  const last = 2;
  const [row, col] = face === "u" ? [gz, gx]
    : face === "d" ? [last - gz, gx]
    : face === "f" ? [last - gy, gx]
    : face === "b" ? [last - gy, last - gx]
    : face === "r" ? [last - gy, last - gz]
    : [last - gy, gz];
  return row * 3 + col;
};

/** ACube positional tokens list the sticker colours in the position name's order. */
const directToken = (state: CubeState, position: string): string => {
  const lower = position.toLowerCase();
  const gx = lower.includes("r") ? 2 : lower.includes("l") ? 0 : 1;
  const gy = lower.includes("u") ? 2 : lower.includes("d") ? 0 : 1;
  const gz = lower.includes("f") ? 2 : lower.includes("b") ? 0 : 1;
  return [...lower].map((face) => state.facelets[storageIndex[face]!]![faceletIndex(face, gx, gy, gz)]!).join("").toUpperCase();
};

const directProbe = (kind: Kind, target: number, piece: number, orientation: number): string => {
  const cp = identity(8), co = Array(8).fill(0), ep = identity(12), eo = Array(12).fill(0);
  if (kind === "corner") {
    [cp[target], cp[piece]] = [cp[piece]!, cp[target]!];
    if (target === piece) cp[target] = piece;
    co[target] = orientation;
    const balancing = target === 7 ? 6 : 7;
    co[balancing] = (3 - orientation) % 3;
    if (target !== piece) [ep[0], ep[1]] = [ep[1]!, ep[0]!];
  } else {
    [ep[target], ep[piece]] = [ep[piece]!, ep[target]!];
    if (target === piece) ep[target] = piece;
    eo[target] = orientation;
    const balancing = target === 11 ? 10 : 11;
    eo[balancing] = orientation;
    if (target !== piece) [cp[0], cp[1]] = [cp[1]!, cp[0]!];
  }
  const reconstructed = PieceReducer.reconstruct({size: 3, cp, co, ep, eo}) as Result<CubeState, unknown>;
  if (reconstructed.TAG === "Error") throw new Error("Could not construct an ACube orientation probe.");
  return directToken(reconstructed._0, positionalLabelFor(kind, target));
};

/** Translate ACube's direct sticker spelling into CubeLab's CP/CO coordinate. */
const acubeOrientation = (kind: Kind, target: number, piece: number, token: string): number => {
  const modulus = kind === "corner" ? 3 : 2;
  for (let orientation = 0; orientation < modulus; orientation += 1) {
    if (directProbe(kind, target, piece, orientation) === token) return orientation;
  }
  throw new Error(`'${token}' has an invalid ACube ${kind} orientation at ${positionalLabelFor(kind, target).toUpperCase()}.`);
};

/** Renders a materialized state in ACube's documented 12-edge, 8-corner order. */
export const renderAcubeState = (state: CubeState): Result<string, string> => {
  const reduced = PieceReducer.reduce(state) as Result<{cp: number[]; co: number[]; ep: number[]; eo: number[]}, unknown>;
  if (reduced.TAG === "Error") return {TAG: "Error", _0: PieceReducer.describeError(reduced._0) as string};
  const edgesOut = positionalEdges.map((position) => directToken(state, position));
  const cornersOut = positionalCorners.map((position) => directToken(state, position));
  return {TAG: "Ok", _0: [...edgesOut, ...cornersOut].join(" ")};
};
