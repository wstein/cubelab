import {describe, expect, test} from "vitest";
import {
  allowedManualStateColours2,
  canCompleteManualState,
  canCompleteManualState2,
  emptyManualState,
  fillForcedManualStateColours2,
  manualStateEnteredCount,
  solvedManualState2,
  solvedManualState,
  type ManualStateDraft,
} from "../../src/client/manual-state";

describe("2×2 manual state constraints", () => {
  test("accepts solved and exposes every colour in an empty draft", () => {
    expect(canCompleteManualState2(solvedManualState2())).toBe(true);
    const empty: ManualStateDraft = Array(24).fill(null);
    expect(allowedManualStateColours2(empty, 0)).toEqual(["U", "R", "F", "D", "L", "B"]);
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
});
