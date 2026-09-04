import {describe, expect, test} from "vitest";
import {
  allowedManualStateColours,
  allowedManualStateColours2,
  canCompleteManualState,
  canCompleteManualState2,
  emptyManualState,
  faceletOrder,
  fillForcedManualStateColours2,
  fillLocallyForcedManualStateColours,
  locallyAllowedManualStateColours,
  manualStateCornerSlots,
  manualStateEdgeSlots,
  manualStateEnteredCount,
  manualStatePieceMates,
  solvedManualState2,
  solvedManualState,
  type ManualStateDraft,
} from "../../src/client/manual-state";
import * as PieceReducer from "../../src/State/PieceReducer.res.mjs";

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
  test("keeps canonical centres and accepts a solved state", () => {
    expect(canCompleteManualState(3, solvedManualState(3))).toBe(true);
    const empty = emptyManualState(3);
    expect(empty[4]).toBe("U");
    expect(empty[13]).toBe("R");
    expect(empty[22]).toBe("F");
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

  test("pins the six 5×5 core centres while leaving its other centres editable", () => {
    const empty = emptyManualState(5);
    expect(empty.filter((colour) => colour !== null)).toHaveLength(6);
    expect([12, 37, 62, 87, 112, 137].map((index) => empty[index])).toEqual(faceletOrder);
    expect(allowedManualStateColours(5, empty, 12)).toEqual(["U"]);
    expect(allowedManualStateColours(5, empty, 6)).toEqual(["U", "D", "R", "L", "F", "B"]);
    const malformed = [...empty];
    malformed[12] = "R";
    expect(canCompleteManualState(5, malformed)).toBe(false);
  });
});

test("keeps FaceletCodec's URFDLB serialization independent from the editor presentation", () => {
  expect(solvedManualState(2).join("")).toBe("UUUURRRRFFFFDDDDLLLLBBBB");
  expect(solvedManualState(3).join("")).toBe(
    "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
  );
});

describe("manualStatePieceMates", () => {
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

  test("is empty for a fixed centre and for a 2×2 (no edges)", () => {
    expect(manualStatePieceMates(3, 4)).toEqual([]);
    // Index 8 is a 2×2 corner sticker too, just a different piece grouping.
    expect(manualStatePieceMates(2, 8).length).toBeGreaterThan(0);
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
