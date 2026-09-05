import {describe, expect, test} from "vitest";
import {
  ManualStateDotVerificationTracker,
  runManualStateVerificationLoop,
} from "../../src/client/manual-state";

describe("manual state dot verification queue (regression: mid-flight cancellation)", () => {
  test("cancels a pass mid-flight and asserts unverified stickers get requeued on the next pass", async () => {
    const tracker = new ManualStateDotVerificationTracker();

    // Initial pass: stickers 0, 1, 2, 3, 4 are blank and need dots rendered
    const initialStickers = [0, 1, 2, 3, 4];
    const initialPending: number[] = [];
    initialStickers.forEach((index) => {
      if (tracker.planPending(index, true)) {
        initialPending.push(index);
      }
    });

    expect(initialPending).toEqual([0, 1, 2, 3, 4]);
    expect([...tracker.unverified]).toEqual([0, 1, 2, 3, 4]);

    // Track which stickers the worker verified
    const verifiedStickers: number[] = [];

    // Run verification loop, but cancel it after sticker 1 completes (before sticker 2)
    let generation = 1;
    tracker.generation = generation;

    const loopPromise = runManualStateVerificationLoop(
      initialPending.map((index) => ({index})),
      () => generation,
      async (index) => {
        // Simulate async worker verification latency
        await new Promise((resolve) => setTimeout(resolve, 10));
        return ["U", "R"];
      },
      (item) => {
        tracker.markVerified(item.index);
        verifiedStickers.push(item.index);
        // Mid-flight cancellation: after verifying index 1, an external draft edit bumps the generation
        if (item.index === 1) {
          generation += 1;
          tracker.generation = generation;
        }
      },
      (cb) => setTimeout(cb, 0),
    );

    await loopPromise;

    // The first pass was killed after index 1:
    expect(verifiedStickers).toEqual([0, 1]);
    // Stickers 0 and 1 are verified; stickers 2, 3, 4 remain unverified
    expect([...tracker.unverified]).toEqual([2, 3, 4]);

    // Next render pass occurs (e.g. after draft edit or UI update).
    // For stickers 0..4, needsDots is FALSE (dirtyDots did not affect them).
    // Under Fix 1, unverified stickers 2, 3, 4 must get requeued!
    const requeuedPending: number[] = [];
    initialStickers.forEach((index) => {
      if (tracker.planPending(index, false)) {
        requeuedPending.push(index);
      }
    });

    expect(requeuedPending).toEqual([2, 3, 4]);

    // Resume verification on the requeued pending list with new generation
    const resumedVerified: number[] = [];
    await runManualStateVerificationLoop(
      requeuedPending.map((index) => ({index})),
      () => generation,
      async () => ["U", "R"],
      (item) => {
        tracker.markVerified(item.index);
        resumedVerified.push(item.index);
      },
      (cb) => setTimeout(cb, 0),
    );

    expect(resumedVerified).toEqual([2, 3, 4]);
    // All stickers are now fully verified
    expect(tracker.unverified.size).toBe(0);
  });

  test("Fix 2: chrome-only renders with empty dirty set do not bump generation", () => {
    const tracker = new ManualStateDotVerificationTracker();
    expect(tracker.generation).toBe(0);

    // Initial render or draft edit (dirtyDots === null) bumps generation
    expect(tracker.shouldBumpGeneration(null)).toBe(true);
    tracker.bumpGeneration(null);
    expect(tracker.generation).toBe(1);

    // Edit that dirties specific stickers bumps generation
    const dirty = new Set([4, 5]);
    expect(tracker.shouldBumpGeneration(dirty)).toBe(true);
    tracker.bumpGeneration(dirty);
    expect(tracker.generation).toBe(2);

    // Chrome-only render (palette click, eraser, representation toggle) ends with empty dirty set
    const emptyDirty = new Set<number>();
    expect(tracker.shouldBumpGeneration(emptyDirty)).toBe(false);
    tracker.bumpGeneration(emptyDirty);
    // Generation must NOT be bumped
    expect(tracker.generation).toBe(2);
  });
});
