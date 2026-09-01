import {describe, expect, test} from "bun:test";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {
  buildTimeline,
  describeTimelineGroup,
  evaluateAlgorithm,
  formatStep,
  isSingleStepExtension,
  MAX_PLAYBACK_STEPS,
  nextSequence,
  planHoverPreview,
  planSequenceStep,
  planTimelineClick,
  physicalMoveProgress,
  tutorialSequenceDescription,
} from "../../src/client/playback";

describe("algorithm playback timeline", () => {
  test("describes the purpose of Academy groups instead of repeating their moves", () => {
    const rotation = {step: {move: {TAG: "Rotation", _0: "X"}, turns: 2}};
    const insertion = {step: {move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}}, turns: 1}};
    const alignment = {step: {move: {TAG: "FaceTurn", _0: "U", _1: {from_: 1, to_: 1}}, turns: -1}};
    const middle = {number: 3, title: "Middle Layer", instruction: "Insert middle edges."};
    expect(describeTimelineGroup([rotation], middle)).toContain("yellow faces up");
    expect(describeTimelineGroup([alignment], middle)).toContain("Align the next middle-layer edge");
    expect(describeTimelineGroup([insertion], middle)).toContain("beginner left or right insertion");
    expect(describeTimelineGroup([insertion])).toBe(
      "Execute this parenthesized algorithm as one sequence.",
    );
  });

  test("describes CFOP groups using their four-stage teaching purpose", () => {
    const entries = [{step: {move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}}, turns: 1}}];
    expect(describeTimelineGroup(entries, {
      method: "cfop",
      number: 2,
      title: "F2L Pairs",
      instruction: "Complete the first two layers.",
    })).toContain("F2L");
  });

  test("uses solver-provided case recognition for Academy sequence groups", () => {
    const steps = [
      {groupId: 7},
      {groupId: 7},
      {durationMs: 500},
      {groupId: 8},
      {groupId: 8},
    ];
    const phase = {
      number: 2,
      title: "F2L Pairs",
      instruction: "Solve four pairs.",
      method: "cfop" as const,
      start: 0,
      sequences: [
        "Solve the white–green–red pair — connected pair in the top layer.",
        "Solve the white–blue–orange pair — edge trapped in an F2L slot.",
      ],
    };
    expect(tutorialSequenceDescription(steps, 0, phase)).toContain("white–green–red");
    expect(tutorialSequenceDescription(steps, 3, phase)).toContain("white–blue–orange");
    expect(tutorialSequenceDescription(steps, 2, phase)).toBeNull();
  });

  test("expands composite algorithms into labeled canonical states", () => {
    const result = evaluateAlgorithm(3, "Wide", "Modern", "[R, U]");
    expect(result.TAG).toBe("Ok");
    if (result.TAG !== "Ok") return;
    expect(result._0.labels).toEqual(["R", "U", "R'", "U'"]);
    expect(result._0.states).toHaveLength(5);
    expect(FaceletCodec.render(result._0.finalState)).toBe(
      FaceletCodec.render(result._0.states?.at(-1)),
    );
  });

  test("retains expanded pauses as state-neutral playback steps", () => {
    const result = evaluateAlgorithm(3, "Wide", "Modern", "(R . U)2 /* inspect */");
    expect(result.TAG).toBe("Ok");
    if (result.TAG !== "Ok") return;
    expect(result._0.labels).toEqual(["R", "", "U", "R", "", "U"]);
    expect(result._0.steps.filter((entry) => entry.step === undefined)).toHaveLength(2);
    expect(result._0.states).toHaveLength(7);
    expect(result._0.states?.[1]).toBe(result._0.states?.[2]);
    expect(result._0.steps.slice(0, 3).map((entry) => entry.groupId)).toEqual([1, 1, 1]);
    expect(result._0.steps.slice(3).map((entry) => entry.groupId)).toEqual([2, 2, 2]);
  });

  test("retains timestamp duration as non-token timeline metadata", () => {
    const result = evaluateAlgorithm(3, "Wide", "Modern", "R @1.3s U");
    expect(result.TAG).toBe("Ok");
    if (result.TAG !== "Ok") return;
    expect(result._0.labels).toEqual(["R", "", "U"]);
    expect(result._0.steps[1].durationMs).toBe(1300);
    expect(result._0.states?.[1]).toBe(result._0.states?.[2]);
  });

  test("counts only physical layer turns as moves", () => {
    const timeline = evaluateAlgorithm(3, "Wide", "Modern", "R @0.5s x y' z2 M U");
    expect(timeline.TAG).toBe("Ok");
    if (timeline.TAG !== "Ok") return;
    expect(physicalMoveProgress(timeline._0.steps, 0)).toEqual({current: 0, total: 3});
    expect(physicalMoveProgress(timeline._0.steps, 5)).toEqual({current: 1, total: 3});
    expect(physicalMoveProgress(timeline._0.steps, timeline._0.steps.length)).toEqual({
      current: 3,
      total: 3,
    });
  });

  test("formats ranges, slices, rotations, and normalized turns", () => {
    expect(formatStep({move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 3}}, turns: 1})).toBe("3Rw");
    expect(formatStep({move: {TAG: "FaceTurn", _0: "F", _1: {from_: 2, to_: 3}}, turns: 2})).toBe("2-3Fw2");
    expect(formatStep({move: {TAG: "SliceTurn", _0: "M"}, turns: -1})).toBe("M'");
    expect(formatStep({move: {TAG: "Rotation", _0: "X"}, turns: 6})).toBe("x2");
  });

  test("detects only a single appended expanded move", () => {
    const one = evaluateAlgorithm(3, "Wide", "Modern", "R");
    const two = evaluateAlgorithm(3, "Wide", "Modern", "R U");
    const changed = evaluateAlgorithm(3, "Wide", "Modern", "R F");
    expect(one.TAG).toBe("Ok");
    expect(two.TAG).toBe("Ok");
    expect(changed.TAG).toBe("Ok");
    if (one.TAG === "Ok" && two.TAG === "Ok" && changed.TAG === "Ok") {
      expect(isSingleStepExtension(one._0, two._0)).toBe(true);
      expect(isSingleStepExtension(two._0, changed._0)).toBe(false);
    }
  });

  test("plans animated token navigation by adjacency and algorithm group", () => {
    const steps = [
      {groupId: 1},
      {groupId: 1},
      {groupId: 1},
      {groupId: 2},
      {groupId: 2},
      {groupId: 2},
    ];
    expect(planTimelineClick(steps, 2, 3)).toEqual({
      jumpTo: null,
      targets: [3],
      speedMultiplier: 1,
    });
    expect(planTimelineClick(steps, 0, 3)).toEqual({
      jumpTo: null,
      targets: [1, 2, 3],
      speedMultiplier: 2,
    });
    expect(planTimelineClick(steps, 3, 0)).toEqual({
      jumpTo: null,
      targets: [2, 1, 0],
      speedMultiplier: 2,
    });
    expect(planTimelineClick(steps, 0, 6)).toEqual({
      jumpTo: 5,
      targets: [6],
      speedMultiplier: 1,
    });
  });

  test("caps hover travel at 10x and slows over the final three physical moves", () => {
    const face = (name: "R" | "U" | "F" | "L" | "D") => ({
      step: {move: {TAG: "FaceTurn" as const, _0: name, _1: {from_: 1, to_: 1}}, turns: 1},
    });
    const steps = [
      face("R"),
      {step: {move: {TAG: "Rotation" as const, _0: "Y" as const}, turns: 1}},
      {durationMs: 500},
      face("U"),
      face("F"),
      face("L"),
      face("D"),
    ];
    const forward = planHoverPreview(steps, 0, steps.length);
    expect(forward.map(({target}) => target)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(forward.map(({speedMultiplier}) => speedMultiplier)).toEqual([10, 10, 10, 10, 6, 4, 2]);
    expect(forward[1].physicalMovesRemaining).toBe(4);
    expect(planHoverPreview(steps, steps.length, 0).map(({speedMultiplier}) => speedMultiplier))
      .toEqual([10, 10, 6, 4, 2, 2, 2]);
  });

  test("plans real-move sequence steps while skipping pause nodes", () => {
    const steps = [
      {groupId: 1, step: {move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}}, turns: 1}},
      {groupId: 1, durationMs: 500},
      {groupId: 1, step: {move: {TAG: "FaceTurn", _0: "U", _1: {from_: 1, to_: 1}}, turns: 1}},
      {durationMs: 1200},
      {groupId: 2, step: {move: {TAG: "FaceTurn", _0: "F", _1: {from_: 1, to_: 1}}, turns: 1}},
    ];
    expect(planSequenceStep(steps, 0, 1)?.moveIndices).toEqual([0, 2]);
    expect(planSequenceStep(steps, 3, -1)?.moveIndices).toEqual([2, 0]);
    expect(planSequenceStep(steps, 3, 1)?.moveIndices).toEqual([4]);
    expect(nextSequence(steps, 3)?.start).toBe(4);
  });

  test("keeps final conversion but omits oversized playback state caches", () => {
    const result = evaluateAlgorithm(3, "Wide", "Modern", `(R)${MAX_PLAYBACK_STEPS + 1}`);
    expect(result.TAG).toBe("Ok");
    if (result.TAG === "Ok") {
      expect(result._0.steps).toHaveLength(MAX_PLAYBACK_STEPS + 1);
      expect(result._0.states).toBeNull();
    }
  });

  test("builds a solution timeline from an arbitrary recognized state", () => {
    const initial = evaluateAlgorithm(3, "Wide", "Modern", "R U");
    const solution = evaluateAlgorithm(3, "Wide", "Modern", "U' R'");
    expect(initial.TAG).toBe("Ok");
    expect(solution.TAG).toBe("Ok");
    if (initial.TAG !== "Ok" || solution.TAG !== "Ok") return;
    const timeline = buildTimeline(initial._0.finalState, solution._0.alg);
    expect(timeline.TAG).toBe("Ok");
    if (timeline.TAG === "Ok") {
      expect(FaceletCodec.render(timeline._0.finalState)).toBe(FaceletCodec.render(StateTypes.solved(3)._0));
      expect(timeline._0.labels).toEqual(["U'", "R'"]);
    }
  });
});
