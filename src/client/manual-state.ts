/** Constraint propagation for the hand-entry card.
 *
 * Drafts use FaceletCodec's compact URFDLB order. A tentative sticker is
 * accepted only if its remaining cubies still admit a legal completion. For a
 * 3×3 that includes the corner/edge permutation-parity agreement; for a 2×2
 * it is the corner permutation and twist rule. On 4×4 and 5×5, colour dots
 * also respect corner and edge-piece identities; a complete 4×4 is further
 * checked by StateValidation4x4 before it can load.
 */
import {canComplete4x4Wings} from "../State/StateValidation4x4";
/** FaceletCodec's serialized order. Keep this independent of the editor UI. */
export const faceletOrder = ["U", "R", "F", "D", "L", "B"] as const;
export type ManualStateFace = typeof faceletOrder[number];

/** Fixed presentation order: opposite colours are paired in the UI. */
export const manualStateFaces = ["U", "D", "R", "L", "F", "B"] as const;
export type ManualStateSize = 2 | 3 | 4 | 5;
export type ManualStateDraft = Array<ManualStateFace | null>;

type Candidate = {piece: number; orientation: number; stickers: ManualStateFace[]};
type CubieKind = {slots: number[][]; pieces: ManualStateFace[][]; orientations: number};

const corners: CubieKind = {
  pieces: [
    ["U", "R", "F"], ["U", "F", "L"], ["U", "L", "B"], ["U", "B", "R"],
    ["D", "F", "R"], ["D", "L", "F"], ["D", "B", "L"], ["D", "R", "B"],
  ],
  slots: [],
  orientations: 3,
};

const edges: CubieKind = {
  pieces: [
    ["U", "R"], ["U", "F"], ["U", "L"], ["U", "B"],
    ["D", "R"], ["D", "F"], ["D", "L"], ["D", "B"],
    ["F", "R"], ["F", "L"], ["B", "L"], ["B", "R"],
  ],
  slots: [
    [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
    [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
  ],
  orientations: 2,
};

// PieceReducer.cornerFacelets(size), expressed in FaceletCodec's URFDLB order.
// Hand-transcribed rather than imported so this module stays dependency-free;
// test/client/manual-state.test.ts cross-checks these against
// PieceReducer.cornerFacelets/edgeFacelets directly so the two can't drift
// apart silently. Exported only for that test, not for general use.
const cornerSlots2 = [
  [3, 4, 9], [2, 8, 17], [0, 16, 21], [1, 20, 5],
  [13, 11, 6], [12, 19, 10], [14, 23, 18], [15, 7, 22],
];
const cornerSlots3 = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
export const manualStateCornerSlots = (size: ManualStateSize): number[][] =>
  size === 2 ? cornerSlots2 : cornerSlots3;
export const manualStateEdgeSlots = (): number[][] => edges.slots;
const faceletIndex = (size: ManualStateSize, face: number, row: number, column: number): number =>
  face * size * size + row * size + column;

/** The one immovable core sticker on every odd-order face. */
export const isManualStateFixedCentre = (size: ManualStateSize, index: number): boolean => {
  if (size !== 3 && size !== 5) return false;
  const perFace = size * size;
  return index >= 0 && index < 6 * perFace && index % perFace === Math.floor(perFace / 2);
};

const fixedCentreFace = (size: ManualStateSize, index: number): ManualStateFace | null =>
  isManualStateFixedCentre(size, index)
    ? faceletOrder[Math.floor(index / (size * size))]
    : null;

const fixedCentreIndices = (size: ManualStateSize): number[] =>
  size === 3 || size === 5
    ? faceletOrder.map((_, face) => faceletIndex(size, face, Math.floor(size / 2), Math.floor(size / 2)))
    : [];

/** Outer corner and wing stickers for an arbitrary order in URFDLB order. */
const buildOuterPieceSlots = (size: 4 | 5): number[][] => {
  const n = size - 1;
  const at = (face: number, row: number, column: number) => faceletIndex(size, face, row, column);
  const slots = [
    [at(0, n, n), at(1, 0, 0), at(2, 0, n)], // URF
    [at(0, n, 0), at(2, 0, 0), at(4, 0, n)], // UFL
    [at(0, 0, 0), at(4, 0, 0), at(5, 0, n)], // ULB
    [at(0, 0, n), at(5, 0, 0), at(1, 0, n)], // UBR
    [at(3, 0, n), at(2, n, n), at(1, n, 0)], // DFR
    [at(3, 0, 0), at(4, n, n), at(2, n, 0)], // DLF
    [at(3, n, 0), at(5, n, n), at(4, n, 0)], // DBL
    [at(3, n, n), at(1, n, n), at(5, n, 0)], // DRB
  ];
  for (let offset = 1; offset < n; offset += 1) {
    slots.push(
      [at(0, offset, n), at(1, 0, n - offset)], // UR
      [at(0, n, offset), at(2, 0, offset)], // UF
      [at(0, offset, 0), at(4, 0, offset)], // UL
      [at(0, 0, offset), at(5, 0, n - offset)], // UB
      [at(3, offset, n), at(1, n, offset)], // DR
      [at(3, 0, offset), at(2, n, offset)], // DF
      [at(3, offset, 0), at(4, n, n - offset)], // DL
      [at(3, n, offset), at(5, n, n - offset)], // DB
      [at(2, offset, n), at(1, offset, 0)], // FR
      [at(2, offset, 0), at(4, offset, n)], // FL
      [at(5, offset, n), at(4, offset, 0)], // BL
      [at(5, offset, 0), at(1, offset, n)], // BR
    );
  }
  return slots;
};

/** Piece families whose copies may be permuted independently on big cubes. */
const buildHighOrderPieceKinds = (size: 4 | 5, slots: number[][]): CubieKind[] => {
  const cornerKind: CubieKind = {...corners, slots: slots.slice(0, 8)};
  const edgeSlots = slots.slice(8);
  if (size === 4) {
    return [{...cornerKind}, {
      slots: edgeSlots,
      pieces: edges.pieces.flatMap((piece) => [piece, piece]),
      orientations: 2,
    }];
  }
  // 5×5 wings at offsets one and three form the 24-piece wing orbit; the
  // central edge strip is the twelve-piece middle-edge orbit.
  return [cornerKind, {
    slots: [...edgeSlots.slice(0, 12), ...edgeSlots.slice(24, 36)],
    pieces: edges.pieces.flatMap((piece) => [piece, piece]),
    orientations: 2,
  }, {
    slots: edgeSlots.slice(12, 24),
    pieces: edges.pieces,
    orientations: 2,
  }];
};

// These tables describe cube geometry, not the user's draft. Keep one copy
// for the lifetime of the editor so every feasibility probe reuses them.
const outerPieceSlotsBySize = {
  4: buildOuterPieceSlots(4),
  5: buildOuterPieceSlots(5),
} as const;
const highOrderPieceKindsBySize = {
  4: buildHighOrderPieceKinds(4, outerPieceSlotsBySize[4]),
  5: buildHighOrderPieceKinds(5, outerPieceSlotsBySize[5]),
} as const;

const popcountParity = (value: number): number => {
  let bits = value;
  let parity = 0;
  while (bits !== 0) {
    parity ^= bits & 1;
    bits >>>= 1;
  }
  return parity;
};

const lowOrderPieceKinds = {
  2: [{...corners, slots: cornerSlots2}],
  3: [{...corners, slots: cornerSlots3}, edges],
} as const;

const candidateCache = new WeakMap<CubieKind, Candidate[][]>();
const candidatesFor = (kind: CubieKind): Candidate[][] => {
  const cached = candidateCache.get(kind);
  if (cached) return cached;
  const candidates = kind.slots.map(() =>
    kind.pieces.flatMap((colours, piece) => Array.from({length: kind.orientations}, (_, orientation) => {
      const stickers = Array<ManualStateFace>(kind.orientations);
      colours.forEach((colour, colourIndex) => {
        stickers[(colourIndex + orientation) % kind.orientations] = colour;
      });
      return {piece, orientation, stickers};
    })),
  );
  candidateCache.set(kind, candidates);
  return candidates;
};

// Build candidate tables once, rather than once for every sticker and colour.
[
  ...lowOrderPieceKinds[2],
  ...lowOrderPieceKinds[3],
  ...highOrderPieceKindsBySize[4],
  ...highOrderPieceKindsBySize[5],
].forEach(candidatesFor);

const matches = (
  draft: ManualStateDraft,
  slot: number[],
  candidate: Candidate,
  counts?: Record<ManualStateFace, number>,
  quota?: number,
): boolean =>
  slot.every((index, localIndex) => {
    const value = draft[index];
    if (value !== null) return value === candidate.stickers[localIndex];
    if (counts !== undefined && quota !== undefined) {
      return counts[candidate.stickers[localIndex]] < quota;
    }
    return true;
  });

const kindsForSize = (size: 2 | 3): readonly CubieKind[] => lowOrderPieceKinds[size];

/** A cheap exact bipartite assignment within one corner or edge orbit. */
const canAssignKind = (
  draft: ManualStateDraft,
  kind: CubieKind,
  counts?: Record<ManualStateFace, number>,
  quota?: number,
): boolean => {
  const candidates = candidatesFor(kind);
  const domains = kind.slots.map((slot) => {
    const sources = new Set<number>();
    candidates[0]!.forEach((candidate) => {
      if (matches(draft, slot, candidate, counts, quota)) sources.add(candidate.piece);
    });
    return [...sources];
  });
  const sourceForSlot = Array<number>(kind.pieces.length).fill(-1);
  const assign = (slot: number, seen: Set<number>): boolean => domains[slot]!.some((source) => {
    if (seen.has(source)) return false;
    seen.add(source);
    if (sourceForSlot[source] === -1 || assign(sourceForSlot[source]!, seen)) {
      sourceForSlot[source] = slot;
      return true;
    }
    return false;
  });
  return domains.every((_, slot) => assign(slot, new Set<number>()));
};

/** Which orientation sums and permutation parities still have a completion. */
const feasibleSignatures = (draft: ManualStateDraft, kind: CubieKind): boolean[][] => {
  const domains = candidatesFor(kind).map((candidates, index) =>
    candidates.filter((candidate) => matches(draft, kind.slots[index], candidate)),
  );
  const result = Array.from({length: kind.orientations}, () => [false, false]);
  if (domains.some((domain) => domain.length === 0)) return result;
  const memo = new Map<string, boolean[][]>();
  const search = (slot: number, used: number): boolean[][] => {
    if (slot === domains.length) {
      const terminal = Array.from({length: kind.orientations}, () => [false, false]);
      terminal[0][0] = true;
      return terminal;
    }
    const key = `${slot}/${used}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const possible = Array.from({length: kind.orientations}, () => [false, false]);
    domains[slot].forEach((candidate) => {
      const bit = 1 << candidate.piece;
      if ((used & bit) !== 0) return;
      const inversions = popcountParity(used >>> (candidate.piece + 1));
      const rest = search(slot + 1, used | bit);
      for (let orientation = 0; orientation < kind.orientations; orientation += 1) {
        for (let parity = 0; parity < 2; parity += 1) {
          if (!rest[orientation][parity]) continue;
          possible[(orientation + candidate.orientation) % kind.orientations][parity ^ inversions] = true;
        }
      }
    });
    memo.set(key, possible);
    return possible;
  };
  return search(0, 0);
};

export const manualStateStickerCount = (size: ManualStateSize): number => 6 * size * size;

export const solvedManualState = (size: ManualStateSize): ManualStateDraft =>
  faceletOrder.flatMap((face) => Array<ManualStateFace>(size * size).fill(face));

export const emptyManualState = (size: ManualStateSize): ManualStateDraft => {
  const draft: ManualStateDraft = Array(manualStateStickerCount(size)).fill(null);
  fixedCentreIndices(size).forEach((index, face) => { draft[index] = faceletOrder[face]; });
  return draft;
};

export const manualStateEnteredCount = (draft: ManualStateDraft): number =>
  draft.filter((face) => face !== null).length;

const colourCounts = (draft: ManualStateDraft): Record<ManualStateFace, number> => {
  const counts: Record<ManualStateFace, number> = {U: 0, D: 0, R: 0, L: 0, F: 0, B: 0};
  draft.forEach((face) => {
    if (face !== null) counts[face] += 1;
  });
  return counts;
};

/** True when a partial draft has at least one physically legal completion. */
export const canCompleteManualState = (size: ManualStateSize, draft: ManualStateDraft): boolean => {
  if (draft.length !== manualStateStickerCount(size)) return false;
  if (fixedCentreIndices(size).some((index, face) => draft[index] !== faceletOrder[face])) return false;
  if (size >= 4) {
    const counts = colourCounts(draft);
    const quota = size * size;
    if (!Object.values(counts).every((count) => count <= quota)) return false;
    if (!highOrderPieceKindsBySize[size].every((kind) => canAssignKind(draft, kind, counts, quota))) return false;
    return size !== 4 || canComplete4x4Wings(draft);
  }
  const corner = feasibleSignatures(draft, kindsForSize(size)[0]);
  if (size === 2) return corner[0][0] || corner[0][1];
  const edge = feasibleSignatures(draft, edges);
  return corner[0][0] && edge[0][0] || corner[0][1] && edge[0][1];
};

/** The colours that may be placed at an index without dead-ending the draft. */
export const allowedManualStateColours = (
  size: ManualStateSize,
  draft: ManualStateDraft,
  index: number,
): ManualStateFace[] => {
  if (index < 0 || index >= draft.length) return [];
  const fixedCentre = fixedCentreFace(size, index);
  if (fixedCentre !== null) return [fixedCentre];
  return manualStateFaces.filter((colour) => {
    const candidate = [...draft];
    candidate[index] = colour;
    return canCompleteManualState(size, candidate);
  });
};

/**
 * Cheap per-cubie propagation used for every visible dot. It never offers a
 * colour that makes its corner or edge impossible. The global function above
 * remains the final gate for a click, including cross-cubie constraints.
 */
export const locallyAllowedManualStateColours = (
  size: ManualStateSize,
  draft: ManualStateDraft,
  index: number,
): ManualStateFace[] => {
  if (index < 0 || index >= draft.length) return [];
  const fixedCentre = fixedCentreFace(size, index);
  if (fixedCentre !== null) return [fixedCentre];
  const perColour = size * size;
  const counts: Record<ManualStateFace, number> = {U: 0, D: 0, R: 0, L: 0, F: 0, B: 0};
  draft.forEach((face) => {
    if (face !== null) counts[face] += 1;
  });
  const kinds = size >= 4 ? highOrderPieceKindsBySize[size] : kindsForSize(size);
  for (const kind of kinds) {
    const slotIndex = kind.slots.findIndex((slot) => slot.includes(index));
    if (slotIndex < 0) continue;
    const localIndex = kind.slots[slotIndex].indexOf(index);
    const candidates = candidatesFor(kind);
    const claimed = new Set<number>();
    kind.slots.forEach((slot, sIndex) => {
      if (sIndex === slotIndex) return;
      if (slot.every((s) => draft[s] !== null)) {
        const matched = candidates[sIndex].find((c) => matches(draft, slot, c));
        if (matched) claimed.add(matched.piece);
      }
    });
    return candidates[slotIndex]
      .filter((candidate) => !claimed.has(candidate.piece) && matches(draft, kind.slots[slotIndex], candidate))
      .map((candidate) => candidate.stickers[localIndex])
      .filter((colour, candidateIndex, values) =>
        values.indexOf(colour) === candidateIndex && (counts[colour] < perColour || draft[index] === colour),
      );
  }
  // Interior big-cube centres do not belong to a corner or edge cubie. Their
  // local constraint is the colour quota, which also lets the last remaining
  // centre auto-fill when its colour is determined.
  return manualStateFaces.filter((colour) => counts[colour] < perColour || draft[index] === colour);
};

/** Repeatedly fills stickers whose colour is uniquely implied by the draft. */
export const fillForcedManualStateColours = (
  size: ManualStateSize,
  draft: ManualStateDraft,
): ManualStateDraft => {
  const filled = [...draft];
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < filled.length; index += 1) {
      if (filled[index] !== null || isManualStateFixedCentre(size, index)) continue;
      const allowed = allowedManualStateColours(size, filled, index);
      if (allowed.length === 1) {
        filled[index] = allowed[0];
        changed = true;
      }
    }
  }
  return filled;
};

/**
 * Fast forced-fill pass for the interactive draft: locallyAllowedManualStateColours
 * finds candidate forced cells cheaply, but each one is now verified against
 * the full canCompleteManualState check — one DP call per genuinely narrowed
 * candidate, not per blank sticker — before it is actually written.
 *
 * The cheap per-cubie reasoning alone can call a colour "forced" from its
 * own corner or edge's perspective while missing a cross-cubie conflict (the
 * same piece independently claimed from two different slots, or the wrong
 * overall permutation parity) that only the full check sees. Writing it
 * unverified used to silently bake an unrecoverable draft in: unlike the dot
 * hints, which this same divergence is expected to affect and which a
 * background pass re-verifies and corrects, an auto-filled sticker was
 * written once and never re-checked, so the corruption stayed invisible
 * until the user happened to notice every remaining dot had gone dark.
 */
export const fillLocallyForcedManualStateColours = (
  size: ManualStateSize,
  draft: ManualStateDraft,
): ManualStateDraft => {
  let filled = [...draft];
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < filled.length; index += 1) {
      if (filled[index] !== null || isManualStateFixedCentre(size, index)) continue;
      const allowed = locallyAllowedManualStateColours(size, filled, index);
      if (allowed.length !== 1) continue;
      filled[index] = allowed[0];
      if (canCompleteManualState(size, filled)) {
        changed = true;
      } else {
        filled[index] = null;
      }
    }
  }
  const unplaced = filled.filter(
    (colour, index) => colour === null && !isManualStateFixedCentre(size, index),
  ).length;
  // A two-sticker big-cube endgame can still contain duplicate-wing choices
  // that local propagation cannot distinguish. The exact pass checks only
  // those final blanks, avoiding the broad sweep during normal entry.
  if ((size <= 3 && unplaced > 0 && unplaced <= 16) || (size >= 4 && unplaced > 0 && unplaced <= 2)) {
    filled = fillForcedManualStateColours(size, filled);
  }
  return filled;
};

/** The other sticker indices on the same physical corner/edge cubie, or []
 * for a centre or an out-of-range index. Reuses the same slot tables the
 * feasibility checks already derive from, rather than a second piece list. */
export const manualStatePieceMates = (size: ManualStateSize, index: number): number[] => {
  if (size >= 4) {
    const slot = outerPieceSlotsBySize[size].find((candidate) => candidate.includes(index));
    return slot ? slot.filter((other) => other !== index) : [];
  }
  for (const kind of kindsForSize(size)) {
    const slot = kind.slots.find((candidate) => candidate.includes(index));
    if (slot) return slot.filter((other) => other !== index);
  }
  return [];
};

/** Sticker dots whose local cubie constraint can change after editing index. */
export const manualStateLocalConstraintIndices = (size: ManualStateSize, index: number): number[] => {
  const kinds = size >= 4 ? highOrderPieceKindsBySize[size] : kindsForSize(size as 2 | 3);
  const kind = kinds.find((candidate) => candidate.slots.some((slot) => slot.includes(index)));
  return kind ? kind.slots.flat() : [index];
};

export type ManualStateColourVerdict = {
  colour: ManualStateFace;
  allowed: boolean;
  /** The first sub-check of canCompleteManualState that rejected this colour. */
  reason: "allowed" | "fixedCentre" | "colourQuota" | "pieceOrbit" | "wingReachability";
  /** For pieceOrbit, which orbit's assignment failed. */
  orbit?: number;
};

/**
 * Why each colour is or is not offered at one sticker.
 *
 * canCompleteManualState answers only yes/no, which makes an empty dot set
 * indistinguishable from a bug. This re-runs its sub-checks individually and
 * names the one that rejected each colour, so a dotless tile can be explained
 * rather than merely observed. Pure and side-effect free; the tracer in
 * manual-state-trace.ts formats it, and tests assert on it directly.
 */
export const explainManualStateColours = (
  size: ManualStateSize,
  draft: ManualStateDraft,
  index: number,
): ManualStateColourVerdict[] => {
  const fixedCentre = fixedCentreFace(size, index);
  return manualStateFaces.map((colour): ManualStateColourVerdict => {
    if (fixedCentre !== null) {
      return colour === fixedCentre
        ? {colour, allowed: true, reason: "allowed"}
        : {colour, allowed: false, reason: "fixedCentre"};
    }
    const candidate = [...draft];
    candidate[index] = colour;
    if (size >= 4) {
      const counts = colourCounts(candidate);
      const quota = size * size;
      if (!Object.values(counts).every((count) => count <= quota)) {
        return {colour, allowed: false, reason: "colourQuota"};
      }
      const kinds = highOrderPieceKindsBySize[size];
      const failed = kinds.findIndex((kind) => !canAssignKind(candidate, kind, counts, quota));
      if (failed >= 0) return {colour, allowed: false, reason: "pieceOrbit", orbit: failed};
      if (size === 4 && !canComplete4x4Wings(candidate)) {
        return {colour, allowed: false, reason: "wingReachability"};
      }
      return {colour, allowed: true, reason: "allowed"};
    }
    return canCompleteManualState(size, candidate)
      ? {colour, allowed: true, reason: "allowed"}
      : {colour, allowed: false, reason: "pieceOrbit"};
  });
};

/**
 * Counts how much colour budget each still-blank piece slot must still spend.
 *
 * canCompleteManualState checks only that no colour is *over*-used. It never
 * checks that every colour a blank slot still needs is one it can still
 * afford, so a draft can exhaust a colour while a slot still requires it. That
 * is the known way a draft becomes unsolvable while the predicate still
 * reports true, and this makes the shortfall visible.
 */
export const manualStateColourBudget = (
  size: ManualStateSize,
  draft: ManualStateDraft,
): Array<{colour: ManualStateFace; placed: number; quota: number; free: number}> => {
  const counts = colourCounts(draft);
  const quota = size * size;
  return manualStateFaces.map((colour) => ({
    colour,
    placed: counts[colour],
    quota,
    free: quota - counts[colour],
  }));
};

// Narrow aliases keep the initial 2×2 test contract readable.
export const canCompleteManualState2 = (draft: ManualStateDraft): boolean => canCompleteManualState(2, draft);
export const allowedManualStateColours2 = (draft: ManualStateDraft, index: number): ManualStateFace[] =>
  allowedManualStateColours(2, draft, index);
export const fillForcedManualStateColours2 = (draft: ManualStateDraft): ManualStateDraft =>
  fillForcedManualStateColours(2, draft);
export const solvedManualState2 = (): ManualStateDraft => solvedManualState(2);

/** Pure verification queue tracker that manages verification debt across renders. */
export class ManualStateDotVerificationTracker {
  unverified = new Set<number>();
  generation = 0;

  planPending(index: number, needsDots: boolean): boolean {
    if (needsDots) {
      this.unverified.add(index);
      return true;
    }
    return this.unverified.has(index);
  }

  markVerified(index: number): void {
    this.unverified.delete(index);
  }

  delete(index: number): void {
    this.unverified.delete(index);
  }

  clear(): void {
    this.unverified.clear();
  }

  shouldBumpGeneration(dirtyDots: ReadonlySet<number> | null): boolean {
    return dirtyDots === null || dirtyDots.size > 0;
  }

  bumpGeneration(dirtyDots: ReadonlySet<number> | null): number {
    if (this.shouldBumpGeneration(dirtyDots)) {
      this.generation += 1;
    }
    return this.generation;
  }
}

/** Pure verification loop coordinator matching verifyManualStateDots lifecycle. */
export const runManualStateVerificationLoop = async <T extends {index: number}>(
  pending: T[],
  currentGeneration: () => number,
  verify: (index: number) => Promise<ManualStateFace[]>,
  onVerified: (item: T, choices: ManualStateFace[]) => void,
  scheduleNext: (fn: () => void) => void = (cb) => setTimeout(cb, 0),
): Promise<void> => {
  const generation = currentGeneration();
  return new Promise((resolve) => {
    const verifyNext = (offset: number) => {
      if (currentGeneration() !== generation || offset >= pending.length) {
        resolve();
        return;
      }
      const next = pending[offset];
      scheduleNext(() => {
        if (currentGeneration() !== generation) {
          resolve();
          return;
        }
        verify(next.index)
          .then((choices) => {
            if (currentGeneration() !== generation) {
              resolve();
              return;
            }
            onVerified(next, choices);
            verifyNext(offset + 1);
          })
          .catch(() => {
            verifyNext(offset + 1);
          });
      });
    };
    verifyNext(0);
  });
};

