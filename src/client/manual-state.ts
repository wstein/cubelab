/** Constraint propagation for the hand-entry card.
 *
 * Drafts use FaceletCodec's compact URFDLB order. A tentative sticker is
 * accepted only if its remaining cubies still admit a legal completion. For a
 * 3×3 that includes the corner/edge permutation-parity agreement; for a 2×2
 * it is the corner permutation and twist rule. On 4×4 and 5×5, colour dots
 * also respect corner and edge-piece identities; a complete 4×4 is further
 * checked by StateValidation4x4 before it can load.
 */
import {canComplete4x4Wings} from "../State/StateValidation4x4.res.mjs";
/** FaceletCodec's serialized order. Keep this independent of the editor UI. */
export const faceletOrder = ["U", "R", "F", "D", "L", "B"] as const;
export type ManualStateFace = typeof faceletOrder[number];

/** Fixed presentation order: opposite colours are paired in the UI. */
export const manualStateFaces = ["U", "D", "R", "L", "F", "B"] as const;
export type ManualStateSize = 2 | 3 | 4 | 5;
export type ManualStateDraft = Array<ManualStateFace | null>;

/** Destination facelet for a view-only y rotation followed by an optional
 * x2 flip. The canonical draft never moves; the editor reparents its existing
 * sticker buttons into these visual slots instead. */
export const manualStateViewDestination = (
  size: ManualStateSize,
  index: number,
  yQuarterTurns: number,
  flipped: boolean,
): number => {
  const perFace = size * size;
  const face = faceletOrder[Math.floor(index / perFace)];
  const local = index % perFace;
  const row = Math.floor(local / size);
  const column = local % size;
  const span = size - 1;
  const rowCoordinate = 2 * row - span;
  const columnCoordinate = 2 * column - span;
  let position: [number, number, number];
  let normal: [number, number, number];
  switch (face) {
    case "U": position = [columnCoordinate, span, rowCoordinate]; normal = [0, 1, 0]; break;
    case "D": position = [columnCoordinate, -span, -rowCoordinate]; normal = [0, -1, 0]; break;
    case "F": position = [columnCoordinate, -rowCoordinate, span]; normal = [0, 0, 1]; break;
    case "B": position = [-columnCoordinate, -rowCoordinate, -span]; normal = [0, 0, -1]; break;
    case "R": position = [span, -rowCoordinate, -columnCoordinate]; normal = [1, 0, 0]; break;
    case "L": position = [-span, -rowCoordinate, columnCoordinate]; normal = [-1, 0, 0]; break;
  }
  if (flipped) {
    position = [position[0], -position[1], -position[2]];
    normal = [normal[0], -normal[1], -normal[2]];
  }
  const turns = ((yQuarterTurns % 4) + 4) % 4;
  for (let turn = 0; turn < turns; turn += 1) {
    position = [-position[2], position[1], position[0]];
    normal = [-normal[2], normal[1], normal[0]];
  }
  let destinationFace: ManualStateFace;
  let destinationRow: number;
  let destinationColumn: number;
  const coordinateIndex = (coordinate: number): number => Math.round((coordinate + span) / 2);
  if (normal[1] === 1) {
    destinationFace = "U";
    destinationRow = coordinateIndex(position[2]);
    destinationColumn = coordinateIndex(position[0]);
  } else if (normal[1] === -1) {
    destinationFace = "D";
    destinationRow = coordinateIndex(-position[2]);
    destinationColumn = coordinateIndex(position[0]);
  } else if (normal[2] === 1) {
    destinationFace = "F";
    destinationRow = coordinateIndex(-position[1]);
    destinationColumn = coordinateIndex(position[0]);
  } else if (normal[2] === -1) {
    destinationFace = "B";
    destinationRow = coordinateIndex(-position[1]);
    destinationColumn = coordinateIndex(-position[0]);
  } else if (normal[0] === 1) {
    destinationFace = "R";
    destinationRow = coordinateIndex(-position[1]);
    destinationColumn = coordinateIndex(-position[2]);
  } else {
    destinationFace = "L";
    destinationRow = coordinateIndex(-position[1]);
    destinationColumn = coordinateIndex(position[2]);
  }
  return faceletOrder.indexOf(destinationFace) * perFace + destinationRow * size + destinationColumn;
};

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

/** The one core sticker on every odd-order face. It is positionally fixed on
 * the physical puzzle, but its colour is entered by the user so rotated cube
 * frames can be described without a preselected scheme. */
export const isManualStateCoreCentre = (size: ManualStateSize, index: number): boolean => {
  if (size !== 3 && size !== 5) return false;
  const perFace = size * size;
  return index >= 0 && index < 6 * perFace && index % perFace === Math.floor(perFace / 2);
};

const coreCentreIndices = (size: ManualStateSize): number[] =>
  size === 3 || size === 5
    ? faceletOrder.map((_, face) => faceletIndex(size, face, Math.floor(size / 2), Math.floor(size / 2)))
    : [];

type CentreVector = readonly [number, number, number];
const centreNormals: Record<ManualStateFace, CentreVector> = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};
const vectorKey = (vector: CentreVector): string => vector.join(",");
const cross = (left: CentreVector, right: CentreVector): CentreVector => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];
const negate = (vector: CentreVector): CentreVector => [-vector[0], -vector[1], -vector[2]];
const dot = (left: CentreVector, right: CentreVector): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

/** The 24 orientation-preserving assignments of centre colours to faces. */
const validCentreFrames: ManualStateFace[][] = faceletOrder.flatMap((upPosition) =>
  faceletOrder
    .filter((rightPosition) => dot(centreNormals[upPosition], centreNormals[rightPosition]) === 0)
    .map((rightPosition) => {
      const up = centreNormals[upPosition];
      const right = centreNormals[rightPosition];
      const front = cross(right, up);
      const colourAtNormal = new Map<string, ManualStateFace>([
        [vectorKey(up), "U"], [vectorKey(right), "R"], [vectorKey(front), "F"],
        [vectorKey(negate(up)), "D"], [vectorKey(negate(right)), "L"], [vectorKey(negate(front)), "B"],
      ]);
      return faceletOrder.map((position) => colourAtNormal.get(vectorKey(centreNormals[position]))!);
    }),
);

const canCompleteCentreFrame = (size: ManualStateSize, draft: ManualStateDraft): boolean => {
  const indices = coreCentreIndices(size);
  if (indices.length === 0) return true;
  return validCentreFrames.some((frame) => indices.every((index, position) =>
    draft[index] === null || draft[index] === frame[position]
  ));
};

/** Express the whole draft in every centre frame compatible with its entered
 * core stickers. Piece constraints are defined in canonical URFDLB colours;
 * checking them against the raw colours would treat the centre frame as an
 * unrelated constraint and advertise orientations that the entered outer
 * pieces cannot actually use. */
const centreNormalizedDrafts = (size: ManualStateSize, draft: ManualStateDraft): ManualStateDraft[] => {
  const indices = coreCentreIndices(size);
  if (indices.length === 0) return [draft];
  return validCentreFrames
    .filter((frame) => indices.every((index, position) =>
      draft[index] === null || draft[index] === frame[position]
    ))
    .map((frame) => {
      const canonicalColour = new Map<ManualStateFace, ManualStateFace>(
        frame.map((colour, position) => [colour, faceletOrder[position]]),
      );
      return draft.map((colour) => colour === null ? null : canonicalColour.get(colour)!);
    });
};

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

const buildCenterSlots4 = (): number[][] => {
  const at = (face: number, row: number, column: number) => faceletIndex(4, face, row, column);
  const slots: number[][] = [];
  for (let face = 0; face < 6; face += 1) {
    slots.push([at(face, 1, 1)], [at(face, 1, 2)], [at(face, 2, 1)], [at(face, 2, 2)]);
  }
  return slots;
};

const buildXCenterSlots5 = (): number[][] => {
  const at = (face: number, row: number, column: number) => faceletIndex(5, face, row, column);
  const slots: number[][] = [];
  for (let face = 0; face < 6; face += 1) {
    slots.push([at(face, 1, 1)], [at(face, 1, 3)], [at(face, 3, 1)], [at(face, 3, 3)]);
  }
  return slots;
};

const buildPlusCenterSlots5 = (): number[][] => {
  const at = (face: number, row: number, column: number) => faceletIndex(5, face, row, column);
  const slots: number[][] = [];
  for (let face = 0; face < 6; face += 1) {
    slots.push([at(face, 1, 2)], [at(face, 2, 1)], [at(face, 2, 3)], [at(face, 3, 2)]);
  }
  return slots;
};

const centerPieces = manualStateFaces.flatMap((face) => [face, face, face, face].map((f) => [f]));

/** Piece families whose copies may be permuted independently on big cubes. */
const buildHighOrderPieceKinds = (size: 4 | 5, slots: number[][]): CubieKind[] => {
  const cornerKind: CubieKind = {...corners, slots: slots.slice(0, 8)};
  const edgeSlots = slots.slice(8);
  if (size === 4) {
    return [{...cornerKind}, {
      slots: edgeSlots,
      pieces: edges.pieces.flatMap((piece) => [piece, piece]),
      orientations: 2,
    }, {
      slots: buildCenterSlots4(),
      pieces: centerPieces,
      orientations: 1,
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
  }, {
    slots: buildXCenterSlots5(),
    pieces: centerPieces,
    orientations: 1,
  }, {
    slots: buildPlusCenterSlots5(),
    pieces: centerPieces,
    orientations: 1,
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

export type ManualStateOrbit = {
  name: string;
  slots: number[][];
  quotaPerColour: number;
};

const orbitsBySize: Record<ManualStateSize, ManualStateOrbit[]> = {
  2: [{name: "corners", slots: cornerSlots2, quotaPerColour: 4}],
  3: [
    {name: "corners", slots: cornerSlots3, quotaPerColour: 4},
    {name: "edges", slots: edges.slots, quotaPerColour: 4},
    {name: "coreCentres", slots: coreCentreIndices(3).map((i) => [i]), quotaPerColour: 1},
  ],
  4: [
    {name: "corners", slots: outerPieceSlotsBySize[4].slice(0, 8), quotaPerColour: 4},
    {name: "wings", slots: outerPieceSlotsBySize[4].slice(8), quotaPerColour: 8},
    {name: "centres", slots: buildCenterSlots4(), quotaPerColour: 4},
  ],
  5: [
    {name: "corners", slots: outerPieceSlotsBySize[5].slice(0, 8), quotaPerColour: 4},
    {name: "wings", slots: [...outerPieceSlotsBySize[5].slice(8, 20), ...outerPieceSlotsBySize[5].slice(32, 44)], quotaPerColour: 8},
    {name: "midges", slots: outerPieceSlotsBySize[5].slice(20, 32), quotaPerColour: 4},
    {name: "xCentres", slots: buildXCenterSlots5(), quotaPerColour: 4},
    {name: "plusCentres", slots: buildPlusCenterSlots5(), quotaPerColour: 4},
    {name: "coreCentres", slots: coreCentreIndices(5).map((i) => [i]), quotaPerColour: 1},
  ],
};

export const manualStateOrbits = (size: ManualStateSize): ManualStateOrbit[] => orbitsBySize[size];

export type LargeManualStateProgressMetric = {
  name: "corners" | "centres" | "wings" | "midges";
  completed: number;
  total: number;
};

/** User-facing progress for the distinct physical piece families of a big
 * cube. Centres are sticker pieces, while corners, wings, and midges count as
 * complete only after every visible sticker of that cubie has been entered. */
export const largeManualStateProgress = (
  size: 4 | 5,
  draft: ManualStateDraft,
): LargeManualStateProgressMetric[] => {
  const orbits = manualStateOrbits(size);
  const metric = (
    name: LargeManualStateProgressMetric["name"],
    orbitNames: string[],
  ): LargeManualStateProgressMetric => {
    const slots = orbits
      .filter((orbit) => orbitNames.includes(orbit.name))
      .flatMap((orbit) => orbit.slots);
    return {
      name,
      completed: slots.filter((slot) => slot.every((index) => draft[index] !== null)).length,
      total: slots.length,
    };
  };
  const progress = [
    metric("corners", ["corners"]),
    metric("centres", size === 4 ? ["centres"] : ["xCentres", "plusCentres", "coreCentres"]),
    metric("wings", ["wings"]),
  ];
  if (size === 5) progress.push(metric("midges", ["midges"]));
  return progress;
};

/**
 * Synchronous scarcity check: checks if this sticker's orbit can accept
 * `colour` without violating the orbit's quota or starving other orbits that
 * have a mandatory remaining requirement for `colour`.
 */
export const isManualStateColourAllowedByScarcity = (
  size: ManualStateSize,
  draft: ManualStateDraft,
  index: number,
  colour: ManualStateFace,
): boolean => {
  const orbits = manualStateOrbits(size);
  const orbitIdx = orbits.findIndex((o) => o.slots.some((sl) => sl.includes(index)));
  if (orbitIdx < 0) return true;
  const currentOrbit = orbits[orbitIdx];

  const placed = orbits.map((o) => {
    let count = 0;
    for (const slot of o.slots) {
      let hasCol = false;
      for (const idx of slot) {
        if (idx === index) continue;
        if (draft[idx] === colour) {
          hasCol = true;
          break;
        }
      }
      if (hasCol) count += 1;
    }
    return count;
  });

  let totalPlacedColour = 0;
  draft.forEach((val, idx) => {
    if (idx !== index && val === colour) totalPlacedColour += 1;
  });

  const totalQuota = size * size;
  if (totalPlacedColour >= totalQuota) return false;
  if (placed[orbitIdx] >= currentOrbit.quotaPerColour) return false;

  let mandatoryOthers = 0;
  orbits.forEach((o, i) => {
    if (i !== orbitIdx) {
      mandatoryOthers += Math.max(0, o.quotaPerColour - placed[i]);
    }
  });

  const freeBudget = totalQuota - totalPlacedColour;
  if (freeBudget - 1 < mandatoryOthers) {
    return false;
  }

  return true;
};

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

type UniqueKindPiece = {
  typeId: number;
  capacity: number;
  rotations: ManualStateFace[][];
};

const uniquePieceCache = new WeakMap<CubieKind, UniqueKindPiece[]>();
const uniquePiecesFor = (kind: CubieKind): UniqueKindPiece[] => {
  const cached = uniquePieceCache.get(kind);
  if (cached) return cached;
  const map = new Map<string, {typeId: number; capacity: number; colours: ManualStateFace[]}>();
  kind.pieces.forEach((piece) => {
    const key = [...piece].sort().join("");
    const existing = map.get(key);
    if (existing) {
      existing.capacity += 1;
    } else {
      map.set(key, {typeId: map.size, capacity: 1, colours: piece});
    }
  });
  const uniquePieces = [...map.values()].map(({typeId, capacity, colours}) => {
    const rotations = Array.from({length: kind.orientations}, (_, orientation) => {
      const stickers = Array<ManualStateFace>(kind.orientations);
      colours.forEach((colour, colourIndex) => {
        stickers[(colourIndex + orientation) % kind.orientations] = colour;
      });
      return stickers;
    });
    return {typeId, capacity, rotations};
  });
  uniquePieceCache.set(kind, uniquePieces);
  return uniquePieces;
};

/** An exact bipartite assignment within one corner or edge orbit respecting colour quotas. */
const canAssignKind = (
  draft: ManualStateDraft,
  kind: CubieKind,
  counts?: Record<ManualStateFace, number>,
  quota?: number,
): boolean => {
  if (kind.orientations === 1 && kind.slots[0]?.length === 1) {
    const orbitCounts: Record<ManualStateFace, number> = {U: 0, D: 0, R: 0, L: 0, F: 0, B: 0};
    for (const slot of kind.slots) {
      const val = draft[slot[0]!];
      if (val !== null) {
        orbitCounts[val] += 1;
        if (orbitCounts[val] > 4) return false;
      }
    }
    if (counts !== undefined && quota !== undefined) {
      for (const face of manualStateFaces) {
        const free = quota - counts[face];
        const needed = 4 - orbitCounts[face];
        if (free < needed) return false;
      }
    }
    return true;
  }

  const uniquePieces = uniquePiecesFor(kind);
  const slotCandidates = kind.slots.map((slot) => {
    const matching: Array<{typeId: number; stickers: ManualStateFace[]}> = [];
    uniquePieces.forEach((piece) => {
      piece.rotations.forEach((stickers) => {
        const matchesSlot = slot.every((index, localIndex) => {
          const value = draft[index];
          if (value !== null) return value === stickers[localIndex];
          if (counts !== undefined && quota !== undefined) {
            return counts[stickers[localIndex]] < quota;
          }
          return true;
        });
        if (matchesSlot) matching.push({typeId: piece.typeId, stickers});
      });
    });
    return matching;
  });

  if (slotCandidates.some((candidates) => candidates.length === 0)) return false;

  const slotOrder = Array.from({length: kind.slots.length}, (_, i) => i)
    .sort((a, b) => slotCandidates[a]!.length - slotCandidates[b]!.length);

  const pieceCount = uniquePieces.map((p) => p.capacity);
  const quotaLeft: Record<ManualStateFace, number> | null = (counts !== undefined && quota !== undefined)
    ? {
      U: quota - counts.U,
      D: quota - counts.D,
      R: quota - counts.R,
      L: quota - counts.L,
      F: quota - counts.F,
      B: quota - counts.B,
    }
    : null;

  if (quotaLeft !== null) {
    const totalByColour: Record<ManualStateFace, number> = {U: 0, D: 0, R: 0, L: 0, F: 0, B: 0};
    for (const piece of uniquePieces) {
      for (const col of piece.rotations[0]!) {
        totalByColour[col] += piece.capacity;
      }
    }
    const placedByColour: Record<ManualStateFace, number> = {U: 0, D: 0, R: 0, L: 0, F: 0, B: 0};
    for (const slot of kind.slots) {
      const seen = new Set<ManualStateFace>();
      for (const idx of slot) {
        const val = draft[idx];
        if (val !== null) seen.add(val);
      }
      for (const col of seen) placedByColour[col] += 1;
    }
    for (const face of manualStateFaces) {
      const needed = totalByColour[face] - placedByColour[face];
      if (needed > quotaLeft[face]) return false;
    }
  }

  const search = (orderIdx: number): boolean => {
    if (orderIdx === slotOrder.length) return true;
    const slotIdx = slotOrder[orderIdx]!;
    const slot = kind.slots[slotIdx]!;
    for (const candidate of slotCandidates[slotIdx]!) {
      if (pieceCount[candidate.typeId]! <= 0) continue;
      if (quotaLeft !== null) {
        let validQuota = true;
        for (let li = 0; li < slot.length; li += 1) {
          if (draft[slot[li]!] === null && quotaLeft[candidate.stickers[li]!] <= 0) {
            validQuota = false;
            break;
          }
        }
        if (!validQuota) continue;
      }

      pieceCount[candidate.typeId]! -= 1;
      if (quotaLeft !== null) {
        for (let li = 0; li < slot.length; li += 1) {
          if (draft[slot[li]!] === null) quotaLeft[candidate.stickers[li]!] -= 1;
        }
      }

      if (search(orderIdx + 1)) return true;

      pieceCount[candidate.typeId]! += 1;
      if (quotaLeft !== null) {
        for (let li = 0; li < slot.length; li += 1) {
          if (draft[slot[li]!] === null) quotaLeft[candidate.stickers[li]!] += 1;
        }
      }
    }
    return false;
  };

  return search(0);
};

const signatureMemoTable = new Int8Array(13 * 4096);

/** Which orientation sums and permutation parities still have a completion. */
const feasibleSignatures = (draft: ManualStateDraft, kind: CubieKind): boolean[][] => {
  const domains = candidatesFor(kind).map((candidates, index) =>
    candidates.filter((candidate) => matches(draft, kind.slots[index], candidate)),
  );
  const orientations = kind.orientations;
  const fullMask = (1 << (orientations * 2)) - 1;
  const result = Array.from({length: orientations}, () => [false, false]);
  if (domains.some((domain) => domain.length === 0)) return result;

  signatureMemoTable.fill(-1);

  const search = (slot: number, used: number): number => {
    if (slot === domains.length) {
      return 1;
    }
    const key = (slot << 12) | used;
    const cached = signatureMemoTable[key];
    if (cached !== -1) return cached;

    let possible = 0;
    const domain = domains[slot];
    for (let cIndex = 0; cIndex < domain.length; cIndex += 1) {
      const candidate = domain[cIndex];
      const bit = 1 << candidate.piece;
      if ((used & bit) !== 0) continue;
      const inversions = popcountParity(used >>> (candidate.piece + 1));
      const rest = search(slot + 1, used | bit);
      if (rest === 0) continue;
      for (let orientation = 0; orientation < orientations; orientation += 1) {
        for (let parity = 0; parity < 2; parity += 1) {
          if ((rest & (1 << (orientation * 2 + parity))) === 0) continue;
          const nextO = (orientation + candidate.orientation) % orientations;
          const nextP = parity ^ inversions;
          possible |= 1 << (nextO * 2 + nextP);
        }
      }
      if (possible === fullMask) break;
    }
    signatureMemoTable[key] = possible;
    return possible;
  };

  const bits = search(0, 0);
  for (let orientation = 0; orientation < orientations; orientation += 1) {
    for (let parity = 0; parity < 2; parity += 1) {
      if ((bits & (1 << (orientation * 2 + parity))) !== 0) {
        result[orientation][parity] = true;
      }
    }
  }
  return result;
};

export const manualStateStickerCount = (size: ManualStateSize): number => 6 * size * size;

export const solvedManualState = (size: ManualStateSize): ManualStateDraft =>
  faceletOrder.flatMap((face) => Array<ManualStateFace>(size * size).fill(face));

export const emptyManualState = (size: ManualStateSize): ManualStateDraft => {
  return Array(manualStateStickerCount(size)).fill(null);
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
  if (!canCompleteCentreFrame(size, draft)) return false;
  return centreNormalizedDrafts(size, draft).some((normalized) => {
    if (size >= 4) {
      const counts = colourCounts(normalized);
      const quota = size * size;
      if (!Object.values(counts).every((count) => count <= quota)) return false;
      if (!highOrderPieceKindsBySize[size].every((kind) => canAssignKind(normalized, kind, counts, quota))) return false;
      return size !== 4 || canComplete4x4Wings(normalized);
    }
    const corner = feasibleSignatures(normalized, kindsForSize(size)[0]);
    if (size === 2) return corner[0][0] || corner[0][1];
    const edge = feasibleSignatures(normalized, edges);
    return corner[0][0] && edge[0][0] || corner[0][1] && edge[0][1];
  });
};

/** The colours that may be placed at an index without dead-ending the draft. */
export const allowedManualStateColours = (
  size: ManualStateSize,
  draft: ManualStateDraft,
  index: number,
): ManualStateFace[] => {
  if (index < 0 || index >= draft.length) return [];
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
    const slot = kind.slots[slotIndex];
    const uniquePieces = uniquePiecesFor(kind);
    const usedCounts = new Array(uniquePieces.length).fill(0);
    kind.slots.forEach((s, sIndex) => {
      if (sIndex === slotIndex) return;
      if (s.every((idx) => draft[idx] !== null)) {
        const matched = uniquePieces.findIndex((p) =>
          p.rotations.some((rot) => s.every((idx, li) => draft[idx] === rot[li])),
        );
        if (matched >= 0) usedCounts[matched] += 1;
      }
    });

    const allowed = new Set<ManualStateFace>();
    for (const piece of uniquePieces) {
      if (usedCounts[piece.typeId] >= piece.capacity) continue;
      for (const stickers of piece.rotations) {
        const colour = stickers[localIndex];
        if (draft[index] !== null && draft[index] !== colour) continue;
        if (counts[colour] >= perColour && draft[index] !== colour) continue;
        if (!isManualStateColourAllowedByScarcity(size, draft, index, colour)) continue;

        let matesValid = true;
        for (let li = 0; li < slot.length; li += 1) {
          if (li === localIndex) continue;
          const otherIdx = slot[li];
          const otherColour = stickers[li];
          if (draft[otherIdx] !== null) {
            if (draft[otherIdx] !== otherColour) {
              matesValid = false;
              break;
            }
          } else {
            if (counts[otherColour] >= perColour) {
              matesValid = false;
              break;
            }
            if (otherColour === colour && counts[colour] + 1 >= perColour) {
              matesValid = false;
              break;
            }
            if (!isManualStateColourAllowedByScarcity(size, draft, otherIdx, otherColour)) {
              matesValid = false;
              break;
            }
          }
        }
        if (matesValid) {
          allowed.add(colour);
        }
      }
    }
    return manualStateFaces.filter((colour) => allowed.has(colour));
  }
  // Interior big-cube centres do not belong to a corner or edge cubie. Their
  // local constraint is the colour quota, which also lets the last remaining
  // centre auto-fill when its colour is determined.
  return manualStateFaces.filter((colour) =>
    (counts[colour] < perColour || draft[index] === colour) &&
    isManualStateColourAllowedByScarcity(size, draft, index, colour),
  );
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
      if (filled[index] !== null) continue;
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
      if (filled[index] !== null) continue;
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
  const unplaced = filled.filter((colour) => colour === null).length;
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
  reason: "allowed" | "centreFrame" | "colourQuota" | "pieceOrbit" | "wingReachability";
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
  return manualStateFaces.map((colour): ManualStateColourVerdict => {
    const candidate = [...draft];
    candidate[index] = colour;
    if (!canCompleteCentreFrame(size, candidate)) {
      return {colour, allowed: false, reason: "centreFrame"};
    }
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
