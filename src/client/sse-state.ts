import * as PieceReducer from "../State/PieceReducer.res.mjs";
import type {CubeState} from "./cube-gl";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};

type PartKind = "corner" | "edge" | "centre";
type Part = {prefix: "" | "+" | "-" | "++"; label: string; slot: number; kind: PartKind};

export type SseStateImport = {state: CubeState; ignoredCentreOrientations: string[]};

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

/**
 * Parses CubeTwister / Randelshofer SSE 3×3 permutation cycles into CubeLab's
 * validated cubie coordinates. Centre rotations are syntactically retained as
 * warnings: colour-only facelets cannot represent a logo's orientation.
 */
export const parseSseState = (input: string): Result<SseStateImport, string> => {
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

    const reconstructed = PieceReducer.reconstruct({size: 3, cp, co, ep, eo}) as Result<CubeState, unknown>;
    return reconstructed.TAG === "Ok"
      ? {TAG: "Ok", _0: {state: reconstructed._0, ignoredCentreOrientations}}
      : {TAG: "Error", _0: PieceReducer.describeError(reconstructed._0) as string};
  } catch (reason) {
    return {TAG: "Error", _0: reason instanceof Error ? reason.message : String(reason)};
  }
};
