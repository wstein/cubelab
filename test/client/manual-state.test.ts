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
