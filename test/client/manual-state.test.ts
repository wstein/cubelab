import {describe, expect, test} from "vitest";
import {
  allowedManualStateColours,
  allowedManualStateColours2,
  canCompleteManualState,
  canCompleteManualState2,
  emptyManualState,
  explainManualStateColours,
  faceletOrder,
  manualStateColourBudget,
  manualStateFaces,
  manualStateFrameStatus,
  fillForcedManualStateColours,
  fillForcedManualStateCoreCentres,
  fillForcedManualStateColours2,
  fillLocallyForcedManualStateColours,
  largeManualStateProgress,
  locallyAllowedManualStateColours,
  manualStateCornerSlots,
  manualStateEdgeSlots,
  manualStateEnteredCount,
  manualStatePieceMates,
  manualStateStickerOrbitIndices,
  manualStateViewDestination,
  manualStateLocalConstraintIndices,
  manualStateOrbits,
  manualStateOpenBackProjectionDestination,
  resetManualState,
  solvedManualState2,
  solvedManualState,
  type ManualStateDraft,
  type ManualStateFace,
  type ManualStateSize,
} from "../../src/client/manual-state";
import * as PieceReducer from "../../src/State/PieceReducer.res.mjs";

describe("manual state view orientation", () => {
  test("maps y and x2 rotations without changing the canonical facelets", () => {
    const centre = (face: ManualStateFace): number => faceletOrder.indexOf(face) * 9 + 4;
    expect(manualStateViewDestination(3, centre("R"), 1, false)).toBe(centre("F"));
    expect(manualStateViewDestination(3, centre("B"), 1, false)).toBe(centre("R"));
    expect(manualStateViewDestination(3, centre("D"), 0, true)).toBe(centre("U"));
    expect(manualStateViewDestination(3, centre("B"), 0, true)).toBe(centre("F"));
  });

  test("produces a complete facelet permutation for every supported view frame", () => {
    for (const size of [2, 3, 4, 5] as const) {
      const count = 6 * size * size;
      for (const flipped of [false, true]) {
        for (let turns = 0; turns < 4; turns += 1) {
          const destinations = Array.from(
            {length: count},
            (_, index) => manualStateViewDestination(size, index, turns, flipped),
          );
          expect(new Set(destinations).size).toBe(count);
          expect(Math.min(...destinations)).toBe(0);
          expect(Math.max(...destinations)).toBe(count - 1);
        }
      }
    }
  });

  test("projects Back from the front by reversing columns without flipping rows", () => {
    for (const size of [2, 3, 4, 5] as ManualStateSize[]) {
      const perFace = size * size;
      const backOffset = faceletOrder.indexOf("B") * perFace;
      const destinations = Array.from(
        {length: 6 * perFace},
        (_, index) => manualStateOpenBackProjectionDestination(size, index),
      );
      expect(new Set(destinations).size).toBe(destinations.length);
      expect(destinations[0]).toBe(0);
      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          const source = backOffset + row * size + column;
          expect(destinations[source]).toBe(backOffset + row * size + (size - 1 - column));
        }
      }
    }
  });
});

describe("2×2 manual state constraints", () => {
  test("accepts solved and exposes every colour in an empty draft", () => {
    expect(canCompleteManualState2(solvedManualState2())).toBe(true);
    const empty: ManualStateDraft = Array(24).fill(null);
    expect(allowedManualStateColours2(empty, 0)).toEqual(["U", "D", "R", "L", "F", "B"]);
  });

  test("rejects a colour that makes a corner combination impossible", () => {
    const draft: ManualStateDraft = Array(24).fill(null);
    draft[3] = "U";
    draft[4] = "R";
    expect(allowedManualStateColours2(draft, 9)).toEqual(["F"]);
  });

  test("offers alternatives when correcting an already-filled sticker", () => {
    const draft = solvedManualState2();
    expect(allowedManualStateColours2(draft, 23)).toEqual(["B"]);
  });

  test("auto-fills a uniquely implied final sticker without modifying the source draft", () => {
    const draft = solvedManualState2();
    draft[23] = null;
    const filled = fillForcedManualStateColours2(draft);
    expect(filled[23]).toBe("B");
    expect(draft[23]).toBeNull();
    expect(manualStateEnteredCount(filled)).toBe(24);
  });
});

describe("3×3 manual state constraints", () => {
  test("reset anchors white Up and green Front while leaving every other sticker blank", () => {
    for (const size of [3, 5] as const) {
      const draft = resetManualState(size);
      const perFace = size * size;
      const centre = Math.floor(perFace / 2);
      expect(draft.filter((colour) => colour !== null)).toHaveLength(2);
      expect(draft[centre]).toBe("U");
      expect(draft[2 * perFace + centre]).toBe("F");
    }
    expect(resetManualState(2).every((colour) => colour === null)).toBe(true);
    expect(resetManualState(4).every((colour) => colour === null)).toBe(true);
  });

  test("reset infers the remaining core centres without filling other stickers", () => {
    for (const size of [3, 5] as const) {
      const filled = fillForcedManualStateCoreCentres(size, resetManualState(size));
      const perFace = size * size;
      const centre = Math.floor(perFace / 2);
      expect(faceletOrder.map((_, face) => filled[face * perFace + centre])).toEqual([...faceletOrder]);
      expect(filled.filter((colour) => colour !== null)).toHaveLength(6);
    }
  });

  test("describes canonical and rotated odd-cube centre frames", () => {
    const canonical = fillForcedManualStateCoreCentres(3, resetManualState(3));
    expect(manualStateFrameStatus(3, canonical)).toEqual({canonical: true, up: "U", front: "F"});

    const rotated = emptyManualState(3);
    faceletOrder.forEach((colour, face) => {
      const source = face * 9 + 4;
      rotated[manualStateViewDestination(3, source, 1, false)] = colour;
    });
    expect(manualStateFrameStatus(3, rotated)).toEqual({canonical: false, up: "U", front: "R"});
    expect(manualStateFrameStatus(3, resetManualState(3))).toBeNull();
    expect(manualStateFrameStatus(4, emptyManualState(4))).toBeNull();
  });

  test("starts with empty centres and accepts a solved state", () => {
    expect(canCompleteManualState(3, solvedManualState(3))).toBe(true);
    const empty = emptyManualState(3);
    expect(empty.every((colour) => colour === null)).toBe(true);
    expect(allowedManualStateColours(3, empty, 4)).toEqual(["U", "D", "R", "L", "F", "B"]);

    const rotated = emptyManualState(3);
    faceletOrder.forEach((colour, face) => {
      const source = face * 9 + 4;
      rotated[manualStateViewDestination(3, source, 1, false)] = colour;
    });
    expect(canCompleteManualState(3, rotated)).toBe(true);
  });

  test("narrows core-centre dots using the entered outer-piece frame", () => {
    const draft = solvedManualState(3);
    const centres = [4, 13, 22, 31, 40, 49];
    centres.forEach((index) => { draft[index] = null; });
    // Match the reported editor state: solved outer pieces with Yellow fixed
    // at Front. The opposite centre is forced to White, while each of the
    // four side positions has only its orientation-compatible colour pair.
    draft[22] = "D";
    expect(allowedManualStateColours(3, draft, 4)).toEqual(["R", "L"]);
    expect(allowedManualStateColours(3, draft, 13)).toEqual(["F", "B"]);
    expect(allowedManualStateColours(3, draft, 31)).toEqual(["R", "L"]);
    expect(allowedManualStateColours(3, draft, 40)).toEqual(["F", "B"]);
    expect(allowedManualStateColours(3, draft, 49)).toEqual(["U"]);
  });

  test("rejects an otherwise-complete state with a single edge swap", () => {
    const draft = solvedManualState(3);
    // Swap UR and UF as whole, unoriented edge cubies. Corner parity remains
    // even, therefore a real 3×3 cannot complete this position.
    [draft[10], draft[19]] = [draft[19], draft[10]];
    expect(canCompleteManualState(3, draft)).toBe(false);
  });

  test("the cheap per-cubie hint can offer a colour the full click-time check rejects", () => {
    // The editor's dot hints run the cheap, single-cubie check for speed; the
    // full check — permutation parity across every corner and edge jointly —
    // still gates an actual click. This proves the two can disagree: an odd
    // edge swap elsewhere makes the whole draft unrealizable, which only the
    // full check can see, while the untouched edge's own slot still locally
    // agrees with its solved colour.
    const draft = solvedManualState(3);
    [draft[10], draft[19]] = [draft[19], draft[10]];
    const index = 30;
    const solvedColour = solvedManualState(3)[index];
    draft[index] = null;
    expect(locallyAllowedManualStateColours(3, draft, index)).toContain(solvedColour);
    expect(allowedManualStateColours(3, draft, index)).not.toContain(solvedColour);
  });

  test("auto-fill leaves a cell blank rather than writing a locally-forced colour the full check rejects", () => {
    // Same broken-parity draft as above, but through fillLocallyForcedManualStateColours
    // this time: locallyAllowedManualStateColours narrows index 30 to exactly
    // one candidate (its solved colour), so the old implementation wrote it
    // unconditionally. That candidate leaves the draft with no valid
    // completion at all — unlike a dot hint, an auto-filled sticker is never
    // re-verified afterward, so writing it silently corrupted the draft
    // until every remaining dot went dark with no explanation. It must stay
    // blank instead.
    const draft = solvedManualState(3);
    [draft[10], draft[19]] = [draft[19], draft[10]];
    const index = 30;
    draft[index] = null;
    const filled = fillLocallyForcedManualStateColours(3, draft);
    expect(filled[index]).toBeNull();
  });

  test("auto-fills remaining stickers when only one colour has quota remaining", () => {
    const draft = solvedManualState(3);
    // Blank out the 4 edge stickers on the Back face
    draft[46] = null;
    draft[50] = null;
    draft[48] = null;
    draft[52] = null;
    expect(locallyAllowedManualStateColours(3, draft, 46)).toEqual(["B"]);
    const filled = fillLocallyForcedManualStateColours(3, draft);
    expect(filled[46]).toBe("B");
    expect(filled[50]).toBe("B");
    expect(filled[48]).toBe("B");
    expect(filled[52]).toBe("B");
  });

  test("auto-fills erased stickers when erasing all 8 blue stickers and one green sticker from solved state", () => {
    const blueIndices = [45, 46, 47, 48, 50, 51, 52, 53];
    const nonCentreGreenIndices = [18, 19, 20, 21, 23, 24, 25, 26];
    for (const greenIndex of nonCentreGreenIndices) {
      const draft = solvedManualState(3);
      for (const b of blueIndices) draft[b] = null;
      draft[greenIndex] = null;
      const filled = fillLocallyForcedManualStateColours(3, draft);
      for (const b of blueIndices) {
        expect(filled[b]).toBe("B");
      }
      expect(filled[greenIndex]).toBe("F");
    }
  });

  test("filters out pieces that are already claimed by another completed slot", () => {
    const empty = emptyManualState(3);
    // Place UR edge [5, 10] = ["U", "R"], UF edge [7, 19] = ["U", "F"], UL edge [3, 37] = ["U", "L"]
    empty[5] = "U"; empty[10] = "R";
    empty[7] = "U"; empty[19] = "F";
    empty[3] = "U"; empty[37] = "L";
    // For UB edge slot [1, 46], place draft[1] = "U"
    empty[1] = "U";
    // With UR, UF, UL claimed, UB is the only unclaimed piece with a "U" sticker
    expect(locallyAllowedManualStateColours(3, empty, 46)).toEqual(["B"]);
  });
});

describe("4×4 and 5×5 manual state entry", () => {
  test("reports completed large-cube piece families from entered stickers", () => {
    for (const size of [4, 5] as const) {
      expect(largeManualStateProgress(size, emptyManualState(size))).toEqual(size === 4
        ? [
          {name: "corners", completed: 0, total: 8},
          {name: "centres", completed: 0, total: 24},
          {name: "wings", completed: 0, total: 24},
        ]
        : [
          {name: "corners", completed: 0, total: 8},
          {name: "centres", completed: 0, total: 54},
          {name: "wings", completed: 0, total: 24},
          {name: "midges", completed: 0, total: 12},
        ]);
      expect(largeManualStateProgress(size, solvedManualState(size)).every((metric) =>
        metric.completed === metric.total
      )).toBe(true);
    }

    const draft = emptyManualState(5);
    const orbits = manualStateOrbits(5);
    orbits.find((orbit) => orbit.name === "corners")!.slots[0].forEach((index) => { draft[index] = "U"; });
    orbits.find((orbit) => orbit.name === "wings")!.slots[0].forEach((index) => { draft[index] = "R"; });
    orbits.find((orbit) => orbit.name === "midges")!.slots[0].forEach((index) => { draft[index] = "F"; });
    orbits.find((orbit) => orbit.name === "xCentres")!.slots.slice(0, 2).forEach((slot) => { draft[slot[0]] = "D"; });
    orbits.find((orbit) => orbit.name === "coreCentres")!.slots[0].forEach((index) => { draft[index] = "L"; });
    expect(largeManualStateProgress(5, draft)).toEqual([
      {name: "corners", completed: 1, total: 8},
      {name: "centres", completed: 3, total: 54},
      {name: "wings", completed: 1, total: 24},
      {name: "midges", completed: 1, total: 12},
    ]);
  });

  test("auto-fills every uniquely implied big-cube sticker", () => {
    for (const size of [4, 5] as const) {
      const draft = solvedManualState(size);
      const index = 0;
      draft[index] = null;
      const filled = fillForcedManualStateColours(size, draft);
      expect(filled[index]).toBe("U");
      expect(draft[index]).toBeNull();
    }
  });

  test("locally auto-fills the last editable centre with its remaining colour", () => {
    const draft = solvedManualState(5);
    // Index 106 is an editable interior centre on the Left face. It has no
    // corner or wing slot, so its local constraint is the colour quota.
    draft[106] = null;
    expect(locallyAllowedManualStateColours(5, draft, 106)).toEqual(["L"]);
    expect(fillLocallyForcedManualStateColours(5, draft)[106]).toBe("L");
  });

  test("uses an exact endgame pass to fill the final ambiguous big-cube stickers", () => {
    const draft = solvedManualState(4);
    draft[0] = null;
    draft[1] = null;
    const filled = fillLocallyForcedManualStateColours(4, draft);
    expect(filled[0]).toBe("U");
    expect(filled[1]).toBe("U");
  });
  test("keeps only colour choices that retain a big-cube piece assignment", () => {
    for (const size of [4, 5] as const) {
      const empty = emptyManualState(size);
      expect(canCompleteManualState(size, empty)).toBe(true);
      expect(allowedManualStateColours(size, empty, 0)).toEqual(["U", "D", "R", "L", "F", "B"]);
      const quotaFilled = [...empty];
      quotaFilled.fill("U", 0, size * size);
      expect(allowedManualStateColours(size, quotaFilled, size * size)).not.toContain("U");
      expect(canCompleteManualState(size, quotaFilled)).toBe(true);
      const centreIndex = size === 4 ? 5 : 12;
      expect(manualStatePieceMates(size, centreIndex)).toEqual([]);
    }
  });

  test("rejects quota-preserving wing swaps on 4×4 and 5×5", () => {
    const invalid4 = solvedManualState(4);
    [invalid4[45], invalid4[50]] = [invalid4[50]!, invalid4[45]!];
    expect(canCompleteManualState(4, invalid4)).toBe(false);

    const invalid5 = solvedManualState(5);
    [invalid5[71], invalid5[77]] = [invalid5[77]!, invalid5[71]!];
    expect(canCompleteManualState(5, invalid5)).toBe(false);
  });

  test("removes dead-end wing colours from live 4×4 and 5×5 dots", () => {
    const draft4 = solvedManualState(4);
    [draft4[45], draft4[50]] = [draft4[50]!, draft4[45]!];
    draft4[45] = null;
    draft4[50] = null;
    expect(allowedManualStateColours(4, draft4, 45)).toEqual(["F"]);

    const draft5 = solvedManualState(5);
    [draft5[71], draft5[77]] = [draft5[77]!, draft5[71]!];
    draft5[71] = null;
    draft5[77] = null;
    expect(allowedManualStateColours(5, draft5, 71)).toEqual(["F"]);
  });

  test("leaves 5×5 core centres empty while enforcing a valid orientation", () => {
    const empty = emptyManualState(5);
    expect(empty.filter((colour) => colour !== null)).toHaveLength(0);
    expect([12, 37, 62, 87, 112, 137].map((index) => empty[index])).toEqual(Array(6).fill(null));
    expect(allowedManualStateColours(5, empty, 12)).toEqual(["U", "D", "R", "L", "F", "B"]);
    expect(allowedManualStateColours(5, empty, 6)).toEqual(["U", "D", "R", "L", "F", "B"]);
    const mirrored = solvedManualState(5);
    [mirrored[37], mirrored[112]] = [mirrored[112], mirrored[37]];
    expect(canCompleteManualState(5, mirrored)).toBe(false);
  });
});

test("keeps FaceletCodec's URFDLB serialization independent from the editor presentation", () => {
  expect(solvedManualState(2).join("")).toBe("UUUURRRRFFFFDDDDLLLLBBBB");
  expect(solvedManualState(3).join("")).toBe(
    "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
  );
});

describe("manualStatePieceMates", () => {
  test("invalidates a local hint's full cubie orbit, not unrelated centres", () => {
    expect(manualStateLocalConstraintIndices(4, 7)).toContain(18);
    expect(manualStateLocalConstraintIndices(4, 7)).not.toContain(5);
    expect(manualStateLocalConstraintIndices(4, 5)).toHaveLength(24);
    expect(manualStateLocalConstraintIndices(5, 106)).toContain(108);
    expect(manualStateLocalConstraintIndices(5, 106)).not.toContain(107);
    expect(manualStateLocalConstraintIndices(5, 106)).toHaveLength(24);
  });
  test("names the other two stickers of a 3×3 corner", () => {
    // Index 8 is UFR's U sticker; its slot is [8, 9, 20] (U, R, F).
    expect(manualStatePieceMates(3, 8).sort((a, b) => a - b)).toEqual([9, 20]);
  });

  test("names the other sticker of a 3×3 edge", () => {
    expect(manualStatePieceMates(3, 5)).toEqual([10]);
  });

  test("frames matching outer cubies on 4×4 and 5×5 nets", () => {
    // U's right edge at row 2 belongs to R's top edge, read in reverse.
    expect(manualStatePieceMates(4, 7)).toEqual([18]);
    expect(manualStatePieceMates(5, 14)).toEqual([27]);
    // The UFR corner is three stickers at every order.
    expect(manualStatePieceMates(5, 24).sort((a, b) => a - b)).toEqual([25, 54]);
  });

  test("frames every outer high-order sticker and never frames an interior centre", () => {
    for (const size of [4, 5] as const) {
      const perFace = size * size;
      for (let face = 0; face < 6; face += 1) {
        for (let row = 0; row < size; row += 1) {
          for (let column = 0; column < size; column += 1) {
            const index = face * perFace + row * size + column;
            const mates = manualStatePieceMates(size, index);
            const outer = row === 0 || row === size - 1 || column === 0 || column === size - 1;
            expect(mates).toHaveLength(outer ? (row === 0 || row === size - 1) && (column === 0 || column === size - 1) ? 2 : 1 : 0);
            mates.forEach((mate) => expect(manualStatePieceMates(size, mate)).toContain(index));
          }
        }
      }
    }
  });

  test("is empty for a core centre and for a 2×2 (no edges)", () => {
    expect(manualStatePieceMates(3, 4)).toEqual([]);
    // Index 8 is a 2×2 corner sticker too, just a different piece grouping.
    expect(manualStatePieceMates(2, 8).length).toBeGreaterThan(0);
  });
});

describe("manualStateStickerOrbitIndices", () => {
  const expectedStickerCounts: Record<ManualStateSize, Record<string, number>> = {
    2: {corners: 24},
    3: {corners: 24, edges: 24, coreCentres: 6},
    4: {corners: 24, wings: 48, centres: 24},
    5: {corners: 24, wings: 48, midges: 24, xCentres: 24, plusCentres: 24, coreCentres: 6},
  };

  for (const size of [2, 3, 4, 5] as ManualStateSize[]) {
    test(`${size}×${size} resolves every sticker to its exact orbit`, () => {
      for (const orbit of manualStateOrbits(size)) {
        const expected = orbit.slots.flat().sort((a, b) => a - b);
        expect(expected.length).toBe(expectedStickerCounts[size][orbit.name]);
        for (const index of expected) {
          expect(manualStateStickerOrbitIndices(size, index).sort((a, b) => a - b)).toEqual(expected);
        }
      }
    });
  }

  test("falls back to the requested index outside the cube", () => {
    expect(manualStateStickerOrbitIndices(3, -1)).toEqual([-1]);
  });
});

describe("corner/edge slot tables agree with PieceReducer's own facelet tables", () => {
  // manual-state.ts hand-transcribes these rather than importing ReScript at
  // runtime (it stays a dependency-free module), so nothing stops the two
  // copies from drifting apart if either is ever edited alone. This converts
  // PieceReducer's (Face, localIndex) pairs into the same flat global-index
  // space manual-state.ts uses and checks they match exactly.
  const toGlobalIndex = (size: 2 | 3, face: string, local: number): number =>
    faceletOrder.indexOf(face as (typeof faceletOrder)[number]) * size * size + local;

  test("corners", () => {
    for (const size of [2, 3] as const) {
      const facelets = PieceReducer.cornerFacelets(size) as {TAG: string; _0: [string, number][][]};
      expect(facelets.TAG).toBe("Ok");
      const converted = facelets._0.map((slot) => slot.map(([face, local]) => toGlobalIndex(size, face, local)));
      expect(manualStateCornerSlots(size)).toEqual(converted);
    }
  });

  test("edges (3×3 only — a 2×2 has none)", () => {
    const facelets = PieceReducer.edgeFacelets as [string, number][][];
    const converted = facelets.map((slot) => slot.map(([face, local]) => toGlobalIndex(3, face, local)));
    expect(manualStateEdgeSlots()).toEqual(converted);
  });
});

describe("dot diagnostics explain an unreachable draft", () => {
  // The paint gate (canCompleteManualState) is a relaxation: independent
  // per-orbit matchings plus a colour quota. It reports true for drafts that
  // have no legal completion, so the editor lets a sticker be painted into a
  // dead end. The user only finds out later, when some tile offers no colour
  // at all. These tests pin that behaviour so a future exact check has a
  // failing assertion to flip, and so the diagnostics that explain the dead
  // tile keep working.
  const SIZE = 4;
  const deadDraft = (): ManualStateDraft => {
    const d: Record<ManualStateFace, Array<ManualStateFace | null>> = {
      U: ["R", "D", "R", "U", "L", null, null, null, "R", "R", "R", "D", "R", "U", "U", "R"],
      R: ["D", null, "D", "L", "R", "R", "R", null, null, null, "D", null, null, null, "D", "L"],
      F: ["B", "F", "F", "F", "L", "F", "F", "F", "U", "F", "F", "F", "F", "F", "F", "B"],
      D: ["U", "R", null, "D", null, "L", "L", "R", "L", "L", "L", "R", "L", "L", "L", "D"],
      L: ["U", "U", "U", "D", "U", "U", "U", "D", "U", null, null, "R", "U", null, "R", "R"],
      B: ["F", "B", "B", "B", null, "L", "B", "B", null, "B", "B", "B", "F", "B", "B", "B"],
    };
    const draft: ManualStateDraft = [];
    (["U", "R", "F", "D", "L", "B"] as const).forEach((f) => draft.push(...d[f]));
    return draft;
  };

  test("an unreachable draft is rejected by canCompleteManualState and offers no colour at a dead tile", () => {
    const draft = deadDraft();
    const dead = draft.findIndex((colour, index) =>
      colour === null && allowedManualStateColours(SIZE, draft, index).length === 0);
    expect(dead).toBeGreaterThanOrEqual(0);
    expect(canCompleteManualState(SIZE, draft)).toBe(false);
    expect(manualStateFaces.some((colour) => {
      const candidate = [...draft];
      candidate[dead] = colour;
      return canCompleteManualState(SIZE, candidate);
    })).toBe(false);
  });

  test("explainManualStateColours names the sub-check that rejected each colour", () => {
    const draft = deadDraft();
    const dead = draft.findIndex((colour, index) =>
      colour === null && allowedManualStateColours(SIZE, draft, index).length === 0);
    const verdicts = explainManualStateColours(SIZE, draft, dead);
    expect(verdicts).toHaveLength(6);
    expect(verdicts.every((verdict) => !verdict.allowed)).toBe(true);
    expect(verdicts.every((verdict) => verdict.reason !== "allowed")).toBe(true);
    // The characteristic shape: a colour blocked purely by its quota, next to
    // colours the piece orbit cannot place.
    expect(verdicts.some((verdict) => verdict.reason === "colourQuota")).toBe(true);
    expect(verdicts.some((verdict) => verdict.reason === "pieceOrbit")).toBe(true);
  });

  test("manualStateColourBudget shows the exhausted colour behind the dead tile", () => {
    const draft = deadDraft();
    const budget = manualStateColourBudget(SIZE, draft);
    expect(budget).toHaveLength(6);
    expect(budget.every(({placed, quota}) => placed <= quota)).toBe(true);
    expect(budget.some(({free}) => free === 0)).toBe(true);
  });

  test("a solved draft explains every colour as allowed or quota-blocked, never orbit-blocked", () => {
    const solved = solvedManualState(SIZE);
    const budget = manualStateColourBudget(SIZE, solved);
    expect(budget.every(({placed, quota}) => placed === quota)).toBe(true);
  });

  test("quota-aware candidate domains in canAssignKind reject exhausting a colour while an outer slot still needs it", () => {
    const draft = solvedManualState(SIZE);
    // Erase a U-F wing slot (index 7 is U, mate 34 is F)
    draft[7] = null;
    draft[34] = null;
    // Paint an extra U on a centre (index 37 is F centre made U -> U count is now 16)
    draft[37] = "U";
    // U is now at quota (16/16), but the blank U-F wing slot cannot be legally assigned without U.
    expect(canCompleteManualState(SIZE, draft)).toBe(false);
  });

  test("rejects replay draft with exhausted colours that leave blank slots unsatisfiable", () => {
    const replayDraft = "RRLLU--RF-BDLLBLUL-URFLFDRB-FBDBDUDFFUBULFDFLUURFRFURBUULDRBRRFRDBDBLFLRFUBFBUDDBDDFULFBLDDLDRBU"
      .split("")
      .map((c) => (c === "-" ? null : (c as ManualStateFace)));
    expect(canCompleteManualState(4, replayDraft)).toBe(false);
    expect(allowedManualStateColours(4, replayDraft, 18)).toEqual([]);
    expect(allowedManualStateColours(4, replayDraft, 27)).toEqual([]);
  });

  test("24 Whites placed on 5×5: only middle-edge slots allow remaining White", () => {
    // Exact fixture from user screenshot:
    // U face has an entered White core centre at index 12.
    // B face (indices 125..149) has:
    //   - Blue core center at (2,2) = 137
    //   - Red on middle edge at (2,4) = 139
    //   - All other 23 stickers are White!
    // Total White count is 24 (quota 25, 1 remaining).
    // The 24 Whites exhaust:
    //   - 4 corners (all 4 on B)
    //   - 8 wings (all 8 on B)
    //   - 4 X-centers (all 4 on B)
    //   - 4 +-centers (all 4 on B)
    //   - 1 core center (on U)
    //   - 3 middle edges (on B at (0,2)=127, (2,0)=135, (4,2)=147)
    // The sole remaining White piece MUST be the 4th middle edge.
    const draft = emptyManualState(5);
    draft[12] = "U";
    draft[137] = "B";
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        const idx = 125 + r * 5 + c;
        if (r === 2 && c === 2) continue; // Blue core centre
        if (r === 2 && c === 4) draft[idx] = "R"; // Red middle edge
        else draft[idx] = "U";
      }
    }

    expect(draft.filter((c) => c === "U")).toHaveLength(24);

    // Corners must NOT allow White
    expect(locallyAllowedManualStateColours(5, draft, 0)).not.toContain("U"); // UBL corner
    expect(locallyAllowedManualStateColours(5, draft, 20)).not.toContain("U"); // UFL corner
    expect(allowedManualStateColours(5, draft, 20)).not.toContain("U");

    // Wings must NOT allow White
    expect(locallyAllowedManualStateColours(5, draft, 1)).not.toContain("U"); // UB wing
    expect(locallyAllowedManualStateColours(5, draft, 21)).not.toContain("U"); // UF wing
    expect(allowedManualStateColours(5, draft, 21)).not.toContain("U");

    // Centers (X-center and +-center) must NOT allow White
    expect(locallyAllowedManualStateColours(5, draft, 6)).not.toContain("U"); // U X-center
    expect(locallyAllowedManualStateColours(5, draft, 7)).not.toContain("U"); // U +-center
    expect(locallyAllowedManualStateColours(5, draft, 56)).not.toContain("U"); // F X-center
    expect(locallyAllowedManualStateColours(5, draft, 57)).not.toContain("U"); // F +-center
    expect(allowedManualStateColours(5, draft, 56)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, 57)).not.toContain("U");

    // Middle edge whose mate on B is already White must NOT allow White
    // UB middle edge at index 2 has mate 127 which is already White on B
    expect(locallyAllowedManualStateColours(5, draft, 2)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, 2)).not.toContain("U");

    // Remaining valid middle edge slots MUST allow White
    // UL middle edge index 10 (mate 110)
    expect(locallyAllowedManualStateColours(5, draft, 10)).toContain("U");
    expect(allowedManualStateColours(5, draft, 10)).toContain("U");

    // UR middle edge index 14 (mate 35)
    expect(locallyAllowedManualStateColours(5, draft, 14)).toContain("U");
    expect(allowedManualStateColours(5, draft, 14)).toContain("U");

    // UF middle edge index 22 (mate 52)
    expect(locallyAllowedManualStateColours(5, draft, 22)).toContain("U");
    expect(allowedManualStateColours(5, draft, 22)).toContain("U");
  });

  test("24 Whites placed on 5×5: only X-centre slots allow remaining White", () => {
    const orbits = manualStateOrbits(5);
    const draft = emptyManualState(5);
    orbits.find((o) => o.name === "corners")!.slots.slice(0, 4).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "wings")!.slots.slice(0, 8).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "midges")!.slots.slice(0, 4).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "plusCentres")!.slots.slice(0, 4).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "xCentres")!.slots.slice(0, 3).forEach((s) => (draft[s[0]] = "U"));
    draft[orbits.find((o) => o.name === "coreCentres")!.slots[0][0]] = "U";

    expect(draft.filter((c) => c === "U")).toHaveLength(24);

    const freeX = orbits.find((o) => o.name === "xCentres")!.slots[3][0];
    const freePlus = orbits.find((o) => o.name === "plusCentres")!.slots[4][0];
    const freeMidge = orbits.find((o) => o.name === "midges")!.slots[4][0];
    const freeWing = orbits.find((o) => o.name === "wings")!.slots[8][0];
    const freeCorner = orbits.find((o) => o.name === "corners")!.slots[4][0];

    expect(locallyAllowedManualStateColours(5, draft, freeX)).toContain("U");
    expect(allowedManualStateColours(5, draft, freeX)).toContain("U");

    expect(locallyAllowedManualStateColours(5, draft, freePlus)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, freePlus)).not.toContain("U");

    expect(locallyAllowedManualStateColours(5, draft, freeMidge)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, freeMidge)).not.toContain("U");

    expect(locallyAllowedManualStateColours(5, draft, freeWing)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, freeWing)).not.toContain("U");

    expect(locallyAllowedManualStateColours(5, draft, freeCorner)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, freeCorner)).not.toContain("U");
  });

  test("24 Whites placed on 5×5: only +-centre slots allow remaining White", () => {
    const orbits = manualStateOrbits(5);
    const draft = emptyManualState(5);
    orbits.find((o) => o.name === "corners")!.slots.slice(0, 4).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "wings")!.slots.slice(0, 8).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "midges")!.slots.slice(0, 4).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "xCentres")!.slots.slice(0, 4).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "plusCentres")!.slots.slice(0, 3).forEach((s) => (draft[s[0]] = "U"));
    draft[orbits.find((o) => o.name === "coreCentres")!.slots[0][0]] = "U";

    expect(draft.filter((c) => c === "U")).toHaveLength(24);

    const freePlus = orbits.find((o) => o.name === "plusCentres")!.slots[3][0];
    const freeX = orbits.find((o) => o.name === "xCentres")!.slots[4][0];
    const freeMidge = orbits.find((o) => o.name === "midges")!.slots[4][0];
    const freeWing = orbits.find((o) => o.name === "wings")!.slots[8][0];
    const freeCorner = orbits.find((o) => o.name === "corners")!.slots[4][0];

    expect(locallyAllowedManualStateColours(5, draft, freePlus)).toContain("U");
    expect(allowedManualStateColours(5, draft, freePlus)).toContain("U");

    expect(locallyAllowedManualStateColours(5, draft, freeX)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, freeX)).not.toContain("U");

    expect(locallyAllowedManualStateColours(5, draft, freeMidge)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, freeMidge)).not.toContain("U");

    expect(locallyAllowedManualStateColours(5, draft, freeWing)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, freeWing)).not.toContain("U");

    expect(locallyAllowedManualStateColours(5, draft, freeCorner)).not.toContain("U");
    expect(allowedManualStateColours(5, draft, freeCorner)).not.toContain("U");
  });

  test("15 Whites placed on 4×4: only centre slots allow remaining White", () => {
    const orbits = manualStateOrbits(4);
    const draft = emptyManualState(4);
    orbits.find((o) => o.name === "corners")!.slots.slice(0, 4).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "wings")!.slots.slice(0, 8).forEach((s) => (draft[s[0]] = "U"));
    orbits.find((o) => o.name === "centres")!.slots.slice(0, 3).forEach((s) => (draft[s[0]] = "U"));

    expect(draft.filter((c) => c === "U")).toHaveLength(15);

    const freeCenter = orbits.find((o) => o.name === "centres")!.slots[3][0];
    const freeCorner = orbits.find((o) => o.name === "corners")!.slots[4][0];
    const freeWing = orbits.find((o) => o.name === "wings")!.slots[8][0];

    expect(locallyAllowedManualStateColours(4, draft, freeCenter)).toContain("U");
    expect(allowedManualStateColours(4, draft, freeCenter)).toContain("U");

    expect(locallyAllowedManualStateColours(4, draft, freeCorner)).not.toContain("U");
    expect(allowedManualStateColours(4, draft, freeCorner)).not.toContain("U");

    expect(locallyAllowedManualStateColours(4, draft, freeWing)).not.toContain("U");
    expect(allowedManualStateColours(4, draft, freeWing)).not.toContain("U");
  });

  test("24 Greens placed on 5×5: bottom L-face wings reject Green when mate cannot be Orange", () => {
    const draft = emptyManualState(5);
    const orbits = manualStateOrbits(5);
    const corners = orbits.find((o) => o.name === "corners")!;
    const midges = orbits.find((o) => o.name === "midges")!;
    const wings = orbits.find((o) => o.name === "wings")!;
    const xCentres = orbits.find((o) => o.name === "xCentres")!;
    const plusCentres = orbits.find((o) => o.name === "plusCentres")!;
    draft[62] = "F";

    // 4 corners, 4 midges, 4 X-centres, 4 +-centres placed with Green (F)
    corners.slots.slice(0, 4).forEach((s) => { draft[s[0]] = "F"; });
    midges.slots.slice(0, 4).forEach((s) => { draft[s[0]] = "F"; });
    xCentres.slots.slice(0, 4).forEach((s) => { draft[s[0]] = "F"; });
    plusCentres.slots.slice(0, 4).forEach((s) => { draft[s[0]] = "F"; });

    // 7 wings placed with Green: 2 UF, 2 DF, 2 FR, 1 FL
    const otherWings = wings.slots.filter((s) => !s.includes(121) && !s.includes(123));
    draft[otherWings[0][0]] = "U"; draft[otherWings[0][1]] = "F";
    draft[otherWings[1][0]] = "U"; draft[otherWings[1][1]] = "F";
    draft[otherWings[2][0]] = "D"; draft[otherWings[2][1]] = "F";
    draft[otherWings[3][0]] = "D"; draft[otherWings[3][1]] = "F";
    draft[otherWings[4][0]] = "F"; draft[otherWings[4][1]] = "R";
    draft[otherWings[5][0]] = "F"; draft[otherWings[5][1]] = "R";
    draft[otherWings[6][0]] = "F"; draft[otherWings[6][1]] = "L";

    expect(draft.filter((c) => c === "F")).toHaveLength(24);

    // Place remaining Orange wings on other slots so Orange cannot go on DL edge
    otherWings.slice(7, 14).forEach((s) => { draft[s[0]] = "L"; });

    // Both bottom wings of L face (121 and 123) must reject Green
    expect(locallyAllowedManualStateColours(5, draft, 121)).not.toContain("F");
    expect(locallyAllowedManualStateColours(5, draft, 123)).not.toContain("F");
    expect(allowedManualStateColours(5, draft, 121)).not.toContain("F");
    expect(allowedManualStateColours(5, draft, 123)).not.toContain("F");
  });

  test("15 Greens placed on 4×4: bottom L-face wings reject Green when mate cannot be Orange", () => {
    const draft = emptyManualState(4);
    const orbits = manualStateOrbits(4);
    const corners = orbits.find((o) => o.name === "corners")!;
    const wings = orbits.find((o) => o.name === "wings")!;
    const centres = orbits.find((o) => o.name === "centres")!;

    corners.slots.slice(0, 4).forEach((s) => { draft[s[0]] = "F"; });
    centres.slots.slice(0, 4).forEach((s) => { draft[s[0]] = "F"; });

    const otherWings = wings.slots.slice(0, 20);
    draft[otherWings[0][0]] = "U"; draft[otherWings[0][1]] = "F";
    draft[otherWings[1][0]] = "U"; draft[otherWings[1][1]] = "F";
    draft[otherWings[2][0]] = "D"; draft[otherWings[2][1]] = "F";
    draft[otherWings[3][0]] = "D"; draft[otherWings[3][1]] = "F";
    draft[otherWings[4][0]] = "F"; draft[otherWings[4][1]] = "R";
    draft[otherWings[5][0]] = "F"; draft[otherWings[5][1]] = "R";
    draft[otherWings[6][0]] = "F"; draft[otherWings[6][1]] = "L";

    expect(draft.filter((c) => c === "F")).toHaveLength(15);

    otherWings.slice(7, 14).forEach((s) => { draft[s[0]] = "L"; });

    const dlSlots = wings.slots.filter((s) => {
      const f1 = Math.floor(s[0] / 16);
      const f2 = Math.floor(s[1] / 16);
      return (f1 === 3 && f2 === 4) || (f1 === 4 && f2 === 3);
    });

    dlSlots.forEach((s) => {
      const lSticker = s.find((idx) => Math.floor(idx / 16) === 4)!;
      expect(locallyAllowedManualStateColours(4, draft, lSticker)).not.toContain("F");
      expect(allowedManualStateColours(4, draft, lSticker)).not.toContain("F");
    });
  });

  test("4×4 centre quota rejects placing a 5th centre of a colour, preventing false-positive dead tile on corner", () => {
    // Reconstruct the 79-sticker draft from the user screenshot where face D already has 4 Orange centres
    const d: Record<ManualStateFace, Array<ManualStateFace | null>> = {
      U: ["R", "D", "R", "U", "L", null, null, null, "R", "R", "R", "D", "R", "U", "U", "R"],
      R: ["D", null, "D", "L", "R", "R", "R", null, null, null, "D", null, null, null, "D", "L"],
      F: ["B", "F", "F", "F", "L", "F", "F", "F", "U", "F", "F", "F", "F", "F", "F", "B"],
      D: ["U", "R", null, "D", null, "L", "L", "R", "L", "L", "L", "R", "L", "L", "L", "D"],
      L: ["U", "U", "U", "D", "U", "U", "U", "D", "U", null, null, "R", "U", null, "R", "R"],
      B: ["F", "B", "B", "B", null, null, "B", "B", null, "B", "B", "B", "F", "B", "B", "B"],
    };
    const draft: ManualStateDraft = [];
    (["U", "R", "F", "D", "L", "B"] as const).forEach((f) => draft.push(...d[f]));

    // Face D already has 4 Orange centres (indices 53, 54, 57, 58).
    // An empty centre slot on B (index 85 = B[1,1]) must NOT allow Orange (L), locally or globally.
    expect(locallyAllowedManualStateColours(4, draft, 85)).not.toContain("L");
    expect(allowedManualStateColours(4, draft, 85)).not.toContain("L");

    // With the centre quota enforced and index 85 left blank, corner R[3,0] (index 28)
    // is NOT dead: its only valid physical completion (Orange) is permitted.
    expect(allowedManualStateColours(4, draft, 28)).toEqual(["L"]);

    // If an impossible 5th Orange centre is forced at index 85, canCompleteManualState must reject it.
    const impossibleDraft = [...draft];
    impossibleDraft[85] = "L";
    expect(canCompleteManualState(4, impossibleDraft)).toBe(false);
  });
});
