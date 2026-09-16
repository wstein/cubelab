import * as PieceReducer from "../State/PieceReducer.res.mjs";
import type {CubeState} from "./cube-gl";
import {looksLikeLargeCubeState, parseLargeCubeState, renderLargeCubeState} from "./large-cube-state";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};

/**
 * David Singmaster's own permutation-cycle notation ("Notes on Rubik's
 * `Magic Cube`", 1978): a cycle lists the canonical position names a piece
 * passes through — (URF,UBR,ULB) means whatever sits at URF moves to UBR,
 * UBR's piece moves to ULB, and ULB's piece moves to URF — with a trailing
 * + or - marking a piece twisted clockwise/counter-clockwise as it lands,
 * or a lone (URF+) for a piece that twists in place without moving.
 *
 * Singmaster's own worked examples put a single +/- on the outside of an
 * entire cycle when every piece in it happens to twist the same way (true
 * for the move-derived states he was analysing). That is not guaranteed
 * for an arbitrary hand-entered state, where two pieces in the same cycle
 * can land with different twists — so each position's own orientation is
 * marked individually here instead. That is self-consistent for any state,
 * and still reads identically to his compact form whenever a cycle's
 * twists are in fact uniform.
 */

const cornerLabels = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"];
const edgeLabels = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"];

type Token = {label: string; slot: number; kind: "corner" | "edge"; orientation: number};

const parseToken = (source: string): Token => {
  const match = /^([URFDLB]{2,3})(\+|-)?$/i.exec(source.trim());
  if (!match) throw new Error(`'${source}' is not a Singmaster cubie position.`);
  const label = match[1]!.toUpperCase();
  const kind: Token["kind"] = label.length === 3 ? "corner" : "edge";
  const labels = kind === "corner" ? cornerLabels : edgeLabels;
  const slot = labels.indexOf(label);
  if (slot < 0) throw new Error(`'${label}' does not name a valid ${kind} position.`);
  if (kind === "edge" && match[2] === "-") {
    throw new Error(`'${source}': an edge only flips, use '+' rather than '-'.`);
  }
  const orientation = match[2] === "+" ? 1 : match[2] === "-" ? 2 : 0;
  return {label, slot, kind, orientation};
};

/** Whether the text is intended as Singmaster permutation-cycle input rather
 * than an algorithm or another parenthesised format (e.g. SSE, which always
 * uses lowercase cubie letters). */
export const looksLikeSingmasterCycleState = (input: string): boolean =>
  looksLikeLargeCubeState(input) || /\(\s*[URFDLB]{2,3}[+-]?\s*[,)]/.test(input);

/** Parses Singmaster permutation cycles into a validated 2×2 or 3×3 state. */
export const parseSingmasterCycleState = (input: string, size: 2 | 3 | 4 | 5 = 3): Result<CubeState, string> => {
  if ((size === 4 || size === 5) && looksLikeLargeCubeState(input)) return parseLargeCubeState(input, size);
  if (size !== 2 && size !== 3) return {TAG: "Error", _0: "Singmaster cycle notation is available only for 2×2×2 through 5×5×5."};
  const cycleMatches = [...input.matchAll(/\(([^()]*)\)/g)];
  if (cycleMatches.length === 0) return {TAG: "Error", _0: "Expected at least one Singmaster permutation cycle."};
  const remainder = input.replace(/\(([^()]*)\)/g, "").trim();
  if (remainder !== "") return {TAG: "Error", _0: `Unexpected Singmaster cycle input '${remainder}'.`};

  try {
    const cp = cornerLabels.map((_, index) => index);
    const co = cornerLabels.map(() => 0);
    const ep = edgeLabels.map((_, index) => index);
    const eo = edgeLabels.map(() => 0);
    const usedCorners = new Set<number>();
    const usedEdges = new Set<number>();

    for (const cycleMatch of cycleMatches) {
      const source = cycleMatch[1]!.trim();
      if (source === "") throw new Error("A Singmaster cycle may not be empty.");
      const tokens = source.split(",").map((part) => parseToken(part.trim()));
      const kind = tokens[0]!.kind;
      if (!tokens.every((token) => token.kind === kind)) {
        throw new Error("Each Singmaster cycle must contain only corners or only edges, not both.");
      }
      if (size === 2 && kind === "edge") {
        throw new Error("A 2×2 Singmaster state may describe corners only.");
      }
      if (new Set(tokens.map((token) => token.slot)).size !== tokens.length) {
        throw new Error("A Singmaster cycle may not repeat a position.");
      }
      const used = kind === "corner" ? usedCorners : usedEdges;
      for (const token of tokens) {
        if (used.has(token.slot)) throw new Error(`'${token.label}' appears in more than one cycle.`);
        used.add(token.slot);
      }
      for (let index = 0; index < tokens.length; index += 1) {
        const from = tokens[index]!;
        const to = tokens[(index + 1) % tokens.length]!;
        if (kind === "corner") {
          cp[to.slot] = from.slot;
          co[to.slot] = to.orientation;
        } else {
          ep[to.slot] = from.slot;
          eo[to.slot] = to.orientation;
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
      ? reconstructed
      : {TAG: "Error", _0: PieceReducer.describeError(reconstructed._0) as string};
  } catch (reason) {
    return {TAG: "Error", _0: reason instanceof Error ? reason.message : String(reason)};
  }
};

/** Renders a 2×2 or 3×3 state as Singmaster permutation cycles. A solved
 * cube (no cycles, no twists) renders as "", matching every other Setup
 * format's convention that a blank field means solved. */
export const renderSingmasterCycleState = (state: CubeState): Result<string, string> => {
  if (state.size === 4 || state.size === 5) return renderLargeCubeState(state, "singmaster");
  if (state.size !== 2 && state.size !== 3) {
    return {TAG: "Error", _0: "Singmaster cycle notation is available only for 2×2×2 and 3×3×3."};
  }
  const reduced = PieceReducer.reduce(state) as Result<{cp: number[]; co: number[]; ep: number[]; eo: number[]}, unknown>;
  if (reduced.TAG === "Error") return {TAG: "Error", _0: PieceReducer.describeError(reduced._0) as string};

  const suffixFor = (orientation: number): string => (orientation === 0 ? "" : orientation === 1 ? "+" : "-");
  const cycles = (permutation: number[], orientations: number[], labels: string[]): string[] => {
    const visited = new Set<number>();
    const output: string[] = [];
    for (let start = 0; start < permutation.length; start += 1) {
      if (visited.has(start)) continue;
      visited.add(start);
      if (permutation[start] === start) {
        if (orientations[start] !== 0) output.push(`(${labels[start]}${suffixFor(orientations[start]!)})`);
        continue;
      }
      const members = [start];
      let current = start;
      while (true) {
        const next = permutation.findIndex((piece) => piece === current);
        if (next === start) break;
        members.push(next);
        visited.add(next);
        current = next;
      }
      output.push(`(${members.map((member) => `${labels[member]}${suffixFor(orientations[member]!)}`).join(",")})`);
    }
    return output;
  };

  const tokens = [
    ...cycles(reduced._0.cp, reduced._0.co, cornerLabels),
    ...(state.size === 3 ? cycles(reduced._0.ep, reduced._0.eo, edgeLabels) : []),
  ];
  return {TAG: "Ok", _0: tokens.join(" ")};
};
