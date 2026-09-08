import {describe, expect, test, vi} from "vitest";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import {
  inspectPetrus5x5State,
  petrus5x5CubieFocus,
  petrus5x5PhaseDefinitions,
  planPetrus5x5Guide,
  createPetrus5x5EvaluationCache,
  evaluatePetrus5x5State,
} from "../../src/client/petrus-5x5-academy";

const parseAlg = (notation: string) => {
  const parsed = MoveParser.parseWithOptions(5, "Wide", "Modern", notation);
  if (parsed.TAG !== "Ok") throw new Error(`Parse failed for ${notation}`);
  return parsed._0;
};

describe("5×5 Petrus Academy Client Bridge", () => {
  test("rejects sparse facelet arrays before evaluation and clears the cached state", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    const evaluate = vi.fn(() => ({status: null, guide: null}));
    const cache = createPetrus5x5EvaluationCache(evaluate);
    cache.evaluate(solved._0, true);

    // Deliberately malformed input: Array.every skips these missing entries.
    const missingSticker = structuredClone(solved._0);
    delete missingSticker.facelets[0][0];
    for (const state of [{size: 5, facelets: new Array(6)}, missingSticker]) {
      expect(cache.evaluate(state, true)).toBeNull();
    }
    expect(evaluate).toHaveBeenCalledTimes(1);
    cache.evaluate(solved._0, true);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  test("skips inactive panels and reuses only the latest complete state by content", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    const state = solved._0;
    const evaluate = vi.fn((state) => ({status: inspectPetrus5x5State(state), guide: null}));
    const cache = createPetrus5x5EvaluationCache(evaluate);

    expect(cache.evaluate(state, false)).toBeNull();
    expect(evaluate).not.toHaveBeenCalled();
    cache.evaluate(state, true);
    cache.evaluate(structuredClone(state), true);
    expect(evaluate).toHaveBeenCalledTimes(1);

    // Mutating the same object must invalidate the cached state identity.
    const original = state.facelets[0][0];
    state.facelets[0][0] = "R";
    cache.evaluate(state, true);
    expect(evaluate).toHaveBeenCalledTimes(2);
    state.facelets[0][0] = original;
    cache.evaluate(state, true);
    expect(evaluate).toHaveBeenCalledTimes(3); // No retained state history.
    cache.evaluate(state, false);
    cache.evaluate(state, true);
    expect(evaluate).toHaveBeenCalledTimes(4);
  });

  test("isolates cached results and skips evaluation for malformed input", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    const status = inspectPetrus5x5State(solved._0)!;
    const evaluate = vi.fn(() => ({status, guide: null}));
    const cache = createPetrus5x5EvaluationCache(evaluate);
    const first = cache.evaluate(solved._0, true)!;
    first.status!.eoStatus.badSlots.push(11);
    status.eoStatus.badSlots.push(10);
    expect(cache.evaluate(solved._0, true)!.status!.eoStatus.badSlots).toEqual([]);
    expect(cache.evaluate({size: 5, facelets: []}, true)).toBeNull();
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  test("combined evaluation matches the public standalone inspector and planner", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    const turned = MoveExecutor.applyAlg(solved._0, parseAlg("R U R'"));
    if (turned.TAG !== "Ok") throw new Error("Expected replayed state");
    for (const state of [solved._0, turned._0]) {
      expect(evaluatePetrus5x5State(state)).toEqual({
        status: inspectPetrus5x5State(state), guide: planPetrus5x5Guide(state),
      });
    }
  });

  test("defines 5 pedagogical curriculum phases", () => {
    expect(petrus5x5PhaseDefinitions.length).toBe(5);
    expect(petrus5x5PhaseDefinitions[0].title).toContain("2×2×2");
    expect(petrus5x5PhaseDefinitions[1].title).toContain("2×2×3");
    expect(petrus5x5PhaseDefinitions[2].title).toContain("EO");
    expect(petrus5x5PhaseDefinitions[3].title).toContain("Wing Pairing");
    expect(petrus5x5PhaseDefinitions[4].title).toContain("Last Layer");
  });

  test("inspects solved 5×5 state into solved phase status", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    const status = inspectPetrus5x5State(solved._0);
    expect(status).not.toBeNull();
    if (!status) return;

    expect(status.ok).toBe(true);
    expect(status.phaseNumber).toBe(6);
    expect(status.phaseTitle).toBe("Cube Solved");
    expect(status.block222Progress.isComplete).toBe(true);
    expect(status.block223Progress.isComplete).toBe(true);
    expect(status.eoStatus.badCount).toBe(0);
    expect(status.wingsPaired).toBe(24);
  });

  test("generates 3D cubie focus elements for active 19-piece block", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    // Scramble U/R faces
    const scrambled = MoveExecutor.applyAlg(solved._0, parseAlg("U R U' R'"));
    expect(scrambled.TAG).toBe("Ok");
    if (scrambled.TAG !== "Ok") return;

    const status = inspectPetrus5x5State(scrambled._0);
    expect(status).not.toBeNull();
    if (!status) return;

    const focusList = petrus5x5CubieFocus(status);
    expect(focusList.length).toBe(status.targetCubies.length);
    if (focusList.length > 0) {
      expect(focusList[0].source).toBeDefined();
      expect(focusList[0].target).toBeDefined();
      expect(focusList[0].label).toBe(status.phaseTitle);
    }
  });

  test("plans replay-verified guide step", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    const scrambled = MoveExecutor.applyAlg(solved._0, parseAlg("U R U' R'"));
    expect(scrambled.TAG).toBe("Ok");
    if (scrambled.TAG !== "Ok") return;

    const guide = planPetrus5x5Guide(scrambled._0);
    expect(guide).not.toBeNull();
    if (!guide) return;

    expect(guide.title).toBeDefined();
    expect(guide.instruction).toBeDefined();
  });
});
