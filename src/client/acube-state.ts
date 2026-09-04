import * as PieceReducer from "../State/PieceReducer.res.mjs";
import type {CubeState} from "./cube-gl";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};

type PartKind = "corner" | "edge";
type Part = {kind: PartKind; label: string; slot: number; orientation: number};

export type AcubeStateImport = {state: CubeState};

const cornerLabels = ["urf", "ufl", "ulb", "ubr", "dfr", "dlf", "dbl", "drb"];
const edgeLabels = ["ur", "uf", "ul", "ub", "dr", "df", "dl", "db", "fr", "fl", "bl", "br"];

// ACube prints positions in this order. Its cubie names use the same face
// sets as CubeLab, so we deliberately resolve names by their face set rather
// than coupling the import to either program's internal enum order.
const acubeEdgePositions = ["uf", "ul", "ub", "ur", "df", "dr", "db", "dl", "fr", "fl", "br", "bl"];
const acubeCornerPositions = ["urb", "urf", "ubl", "ulf", "drf", "dfl", "dlb", "dbr"];

const labelsFor = (kind: PartKind): string[] => kind === "corner" ? cornerLabels : edgeLabels;

const slotFor = (kind: PartKind, label: string): number => {
  const wanted = [...label].sort().join("");
  return labelsFor(kind).findIndex((candidate) => [...candidate].sort().join("") === wanted);
};

const parsePart = (source: string): Part => {
  const label = source.toLowerCase();
  if (!/^[ulfrbd]+$/.test(label) || new Set(label).size !== label.length) {
    throw new Error(`'${source}' is not an ACube cubie name.`);
  }
  const kind: PartKind = label.length === 3 ? "corner" : label.length === 2 ? "edge" : (() => {
    throw new Error(`'${source}' is not an ACube edge or corner.`);
  })();
  const slot = slotFor(kind, label);
  if (slot < 0) throw new Error(`'${source}' does not name a valid ACube ${kind}.`);
  const orientation = labelsFor(kind)[slot]!.indexOf(label[0]!);
  return {kind, label, slot, orientation};
};

const orientationBetween = (from: Part, to: Part): number => {
  const modulus = from.kind === "corner" ? 3 : 2;
  return (to.orientation - from.orientation + modulus) % modulus;
};

const partialStateError =
  "ACube unknown or ignored-piece constraints describe multiple states. CubeLab needs one complete physical state to render, replay, or solve.";

const reconstruct = (cp: number[], co: number[], ep: number[], eo: number[]): Result<AcubeStateImport, string> => {
  const result = PieceReducer.reconstruct({size: 3, cp, co, ep, eo}) as Result<CubeState, unknown>;
  return result.TAG === "Ok"
    ? {TAG: "Ok", _0: {state: result._0}}
    : {TAG: "Error", _0: PieceReducer.describeError(result._0) as string};
};

const parseCycles = (input: string): Result<AcubeStateImport, string> => {
  const cycles = [...input.matchAll(/\(([^()]*)\)/g)];
  const remainder = input.replace(/\(([^()]*)\)/g, " ");
  if (/[\[\]@?]/.test(remainder)) return {TAG: "Error", _0: partialStateError};

  try {
    const cp = cornerLabels.map((_, index) => index);
    const co = cornerLabels.map(() => 0);
    const ep = edgeLabels.map((_, index) => index);
    const eo = edgeLabels.map(() => 0);
    const usedCorners = new Set<number>();
    const usedEdges = new Set<number>();

    for (const cycle of cycles) {
      const members = cycle[1]!.trim().split(/[\s,]+/).filter(Boolean).map(parsePart);
      if (members.length < 2) throw new Error("ACube cycles require at least two cubies.");
      const kind = members[0]!.kind;
      if (!members.every((member) => member.kind === kind)) {
        throw new Error("Each ACube cycle must contain only edges or only corners.");
      }
      const used = kind === "corner" ? usedCorners : usedEdges;
      if (members.some((member) => used.has(member.slot))) {
        throw new Error("An ACube cubie may appear in only one cycle.");
      }
      members.forEach((member) => used.add(member.slot));
      for (let index = 0; index < members.length; index += 1) {
        const from = members[index]!;
        const to = members[(index + 1) % members.length]!;
        if (kind === "corner") {
          cp[to.slot] = from.slot;
          co[to.slot] = orientationBetween(from, to);
        } else {
          ep[to.slot] = from.slot;
          eo[to.slot] = orientationBetween(from, to);
        }
      }
    }

    const orientationTerms = remainder.trim() === ""
      ? []
      : remainder.trim().split(/[\s,]+/).filter(Boolean);
    if (cycles.length === 0 && orientationTerms.length === 0) {
      throw new Error("Expected an ACube cycle or orientation term.");
    }
    for (const term of orientationTerms) {
      const match = /^([UDFBLR]{2,3})([+-])$/i.exec(term);
      if (!match) throw new Error(`Unexpected ACube state input '${term}'.`);
      const part = parsePart(match[1]!);
      if (part.kind === "corner") {
        co[part.slot] = (co[part.slot]! + (match[2] === "+" ? 1 : 2)) % 3;
      } else {
        eo[part.slot] = (eo[part.slot]! + 1) % 2;
      }
    }
    return reconstruct(cp, co, ep, eo);
  } catch (reason) {
    return {TAG: "Error", _0: reason instanceof Error ? reason.message : String(reason)};
  }
};

const parsePositional = (input: string): Result<AcubeStateImport, string> => {
  const terms = input.trim().split(/[\s,]+/).filter(Boolean);
  if (terms.length !== 20) return {TAG: "Error", _0: "ACube positional states require 12 edges followed by 8 corners."};
  if (terms.some((term) => /[\[\]@?+-]/.test(term))) return {TAG: "Error", _0: partialStateError};
  try {
    const ep = edgeLabels.map((_, index) => index);
    const eo = edgeLabels.map(() => 0);
    acubeEdgePositions.forEach((position, index) => {
      const part = parsePart(terms[index]!);
      if (part.kind !== "edge") throw new Error(`'${terms[index]}' is not an ACube edge.`);
      const destination = slotFor("edge", position);
      if (destination < 0) throw new Error("Invalid ACube edge position.");
      ep[destination] = part.slot;
      eo[destination] = part.orientation;
    });
    const cp = cornerLabels.map((_, index) => index);
    const co = cornerLabels.map(() => 0);
    acubeCornerPositions.forEach((position, index) => {
      const part = parsePart(terms[index + 12]!);
      if (part.kind !== "corner") throw new Error(`'${terms[index + 12]}' is not an ACube corner.`);
      const destination = slotFor("corner", position);
      if (destination < 0) throw new Error("Invalid ACube corner position.");
      cp[destination] = part.slot;
      co[destination] = part.orientation;
    });
    return reconstruct(cp, co, ep, eo);
  } catch (reason) {
    return {TAG: "Error", _0: reason instanceof Error ? reason.message : String(reason)};
  }
};

/**
 * Identifies ACube's 3×3 state language without stealing lower-case SSE cycles.
 * Selecting the ACube dialect opts into the otherwise ambiguous lower-case form.
 */
export const looksLikeAcubeState = (input: string, explicitDialect = false): boolean => {
  if (!explicitDialect && !/[A-Z]/.test(input)) return false;
  if (/[\[\]@?]/.test(input) || /\b[UDFBLR]{2,3}[+-](?=$|\s|,)/.test(input)) return true;
  if (/\(\s*[UDFBLR]{2,3}(?:\s*,|\s+[UDFBLR]{2,3})/i.test(input)) return true;
  const terms = input.trim().split(/[\s,]+/).filter(Boolean);
  return terms.length === 20 && terms.every((term) => /^@?[+-]?[UDFBLR?]{2,3}$/i.test(term));
};

/** Parses complete ACube 4 cycle or positional state notation into a 3×3 state. */
export const parseAcubeState = (input: string): Result<AcubeStateImport, string> => {
  if (/[\[\]@?]/.test(input)) return {TAG: "Error", _0: partialStateError};
  return input.includes("(") || /\b[UDFBLR]{2,3}[+-](?=$|\s|,)/i.test(input)
    ? parseCycles(input)
    : parsePositional(input);
};
