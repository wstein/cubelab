/** Constraint propagation for the hand-entry card.
 *
 * Drafts use FaceletCodec's compact URFDLB order. A tentative sticker is
 * accepted only if its remaining cubies still admit a legal completion. For a
 * 3×3 that includes the corner/edge permutation-parity agreement; for a 2×2
 * it is the corner permutation and twist rule.
 */
/** FaceletCodec's serialized order. Keep this independent of the editor UI. */
export const faceletOrder = ["U", "R", "F", "D", "L", "B"] as const;
export type ManualStateFace = typeof faceletOrder[number];

/** Fixed presentation order: opposite colours are paired in the UI. */
export const manualStateFaces = ["U", "D", "R", "L", "F", "B"] as const;
export type ManualStateSize = 2 | 3;
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
const centreIndices3 = [4, 13, 22, 31, 40, 49];

const popcountParity = (value: number): number => {
  let bits = value;
  let parity = 0;
  while (bits !== 0) {
    parity ^= bits & 1;
    bits >>>= 1;
  }
  return parity;
};

const candidatesFor = (kind: CubieKind): Candidate[][] => kind.slots.map(() =>
  kind.pieces.flatMap((colours, piece) => Array.from({length: kind.orientations}, (_, orientation) => {
    const stickers = Array<ManualStateFace>(kind.orientations);
    colours.forEach((colour, colourIndex) => {
      stickers[(colourIndex + orientation) % kind.orientations] = colour;
    });
    return {piece, orientation, stickers};
  })),
);

const matches = (draft: ManualStateDraft, slot: number[], candidate: Candidate): boolean =>
  slot.every((index, localIndex) => draft[index] === null || draft[index] === candidate.stickers[localIndex]);

const kindsForSize = (size: ManualStateSize): CubieKind[] => [
  {...corners, slots: size === 2 ? cornerSlots2 : cornerSlots3},
  ...(size === 3 ? [edges] : []),
];

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
  if (size === 3) centreIndices3.forEach((index, face) => { draft[index] = faceletOrder[face]; });
  return draft;
};

export const manualStateEnteredCount = (draft: ManualStateDraft): number =>
  draft.filter((face) => face !== null).length;

/** True when a partial draft has at least one physically legal completion. */
export const canCompleteManualState = (size: ManualStateSize, draft: ManualStateDraft): boolean => {
  if (draft.length !== manualStateStickerCount(size)) return false;
  if (size === 3 && centreIndices3.some((index, face) => draft[index] !== faceletOrder[face])) return false;
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
  if (size === 3 && centreIndices3.includes(index)) return [faceletOrder[centreIndices3.indexOf(index)]];
  return manualStateFaces.filter((colour) => {
    const candidate = [...draft];
    candidate[index] = colour;
    return canCompleteManualState(size, candidate);
  });
};

/**
 * Cheap per-cubie propagation used for every visible dot. It never offers a
 * colour that makes its corner or edge impossible. The global function above
 * remains the final gate for a click, including 3×3 parity coupling.
 */
export const locallyAllowedManualStateColours = (
  size: ManualStateSize,
  draft: ManualStateDraft,
  index: number,
): ManualStateFace[] => {
  if (index < 0 || index >= draft.length) return [];
  if (size === 3 && centreIndices3.includes(index)) return [faceletOrder[centreIndices3.indexOf(index)]];
  const perColour = size * size;
  const counts: Record<ManualStateFace, number> = {U: 0, D: 0, R: 0, L: 0, F: 0, B: 0};
  draft.forEach((face) => {
    if (face !== null) counts[face] += 1;
  });
  for (const kind of kindsForSize(size)) {
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
  return [];
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
      if (filled[index] !== null || size === 3 && centreIndices3.includes(index)) continue;
      const allowed = allowedManualStateColours(size, filled, index);
      if (allowed.length === 1) {
        filled[index] = allowed[0];
        changed = true;
      }
    }
  }
  return filled;
};

/** Fast forced-fill pass for the interactive draft; Load still uses full validation. */
export const fillLocallyForcedManualStateColours = (
  size: ManualStateSize,
  draft: ManualStateDraft,
): ManualStateDraft => {
  const filled = [...draft];
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < filled.length; index += 1) {
      if (filled[index] !== null || size === 3 && centreIndices3.includes(index)) continue;
      const allowed = locallyAllowedManualStateColours(size, filled, index);
      if (allowed.length === 1) {
        filled[index] = allowed[0];
        changed = true;
      }
    }
  }
  return filled;
};

/** The other sticker indices on the same physical corner/edge cubie, or []
 * for a centre or an out-of-range index. Reuses the same slot tables the
 * feasibility checks already derive from, rather than a second piece list. */
export const manualStatePieceMates = (size: ManualStateSize, index: number): number[] => {
  for (const kind of kindsForSize(size)) {
    const slot = kind.slots.find((candidate) => candidate.includes(index));
    if (slot) return slot.filter((other) => other !== index);
  }
  return [];
};

// Narrow aliases keep the initial 2×2 test contract readable.
export const canCompleteManualState2 = (draft: ManualStateDraft): boolean => canCompleteManualState(2, draft);
export const allowedManualStateColours2 = (draft: ManualStateDraft, index: number): ManualStateFace[] =>
  allowedManualStateColours(2, draft, index);
export const fillForcedManualStateColours2 = (draft: ManualStateDraft): ManualStateDraft =>
  fillForcedManualStateColours(2, draft);
export const solvedManualState2 = (): ManualStateDraft => solvedManualState(2);
