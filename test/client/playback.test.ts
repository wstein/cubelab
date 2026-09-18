import {describe, expect, test} from "vitest";

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
  stateSnapshotTimeline,
  tutorialSequenceDescription,
  timelineHoverEnabled,
} from "../../src/client/playback";
import {dialectForAlgorithmInput} from "../../src/client/notation-dialect";

describe("algorithm playback timeline", () => {
  test("keeps a zero-step tape position for canonical state input", () => {
    const state = StateTypes.solved(3)._0;
    expect(stateSnapshotTimeline(state)).toMatchObject({
      finalState: state,
      steps: [],
      labels: [],
      states: [state],
    });
  });

  test("describes the purpose of Academy groups instead of repeating their moves", () => {
    const rotation = {step: {move: {TAG: "Rotation", _0: "X"}, turns: 2}};
    const insertion = {step: {move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}}, turns: 1}};
    const alignment = {step: {move: {TAG: "FaceTurn", _0: "U", _1: {from_: 1, to_: 1}}, turns: -1}};
    const firstLayer = {number: 1, title: "White Cross", instruction: "Build the first layer."};
    const middle = {number: 3, title: "Middle Layer", instruction: "Insert middle edges."};
    expect(describeTimelineGroup([rotation], firstLayer)).toContain("white is on the bottom");
    expect(describeTimelineGroup([alignment], middle)).toContain("Align the next middle-layer edge");
    expect(describeTimelineGroup([insertion], middle)).toContain("beginner left or right insertion");
    expect(describeTimelineGroup([insertion])).toBe(
      "Execute this parenthesized algorithm as one sequence.",
    );
  });

  test("describes CFOP groups using their four-stage teaching purpose", () => {
    const entries = [{step: {move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}}, turns: 1}}];
    expect(describeTimelineGroup(entries, {
      method: "fullCfop",
      number: 2,
      title: "F2L Pairs",
      instruction: "Complete the first two layers.",
    })).toContain("F2L");
    expect(describeTimelineGroup(entries, {
      method: "beginnerCfop",
      number: 3,
      title: "Two-Look OLL",
      instruction: "Orient the last layer in two looks.",
    })).toContain("two-look OLL");
  });

  test("describes Petrus groups as block, EO, and two-generator work", () => {
    const entries = [{step: {move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 1}}, turns: 1}}];
    expect(describeTimelineGroup(entries, {
      method: "petrus",
      number: 2,
      title: "Expand to 2×2×3",
      instruction: "Expand the block.",
    })).toContain("2×2×3");
    expect(describeTimelineGroup(entries, {
      method: "petrus",
      number: 3,
      title: "Orient Bad Edges",
      instruction: "Orient edges.",
    })).toContain("bad-edge");
    expect(describeTimelineGroup(entries, {
      method: "enhancedPetrus",
      number: 5,
      title: "COLL + EPLL Finish",
      instruction: "Finish the last layer.",
    })).toContain("COLL");
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
      method: "fullCfop" as const,
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

  test("detects native SSE prefixes in Workbench algorithms", () => {
    const input = "WD' WR' WD NR' MR NL NU2 ND2 NF2 NB2";
    const detected = dialectForAlgorithmInput(5, "Modern", input);
    expect(detected).toBe("Sse");
    const result = evaluateAlgorithm(5, "Wide", detected, input);
    const explicit = evaluateAlgorithm(5, "Wide", "Sse", input);
    expect(result.TAG).toBe("Ok");
    expect(result).toEqual(explicit);
    if (result.TAG === "Ok") expect(result._0.labels).toHaveLength(10);
  });

  test("detects Jaap suffix moves in pasted Workbench algorithms", () => {
    const input = "F2 R2 Ua' (R2 F2)2 Ua F2 R2";
    const detected = dialectForAlgorithmInput(3, "Modern", input);
    expect(detected).toBe("Jaap");
    const result = evaluateAlgorithm(3, "Wide", detected, input);
    const explicit = evaluateAlgorithm(3, "Wide", "Jaap", input);
    expect(result.TAG).toBe("Ok");
    expect(result).toEqual(explicit);
    expect(dialectForAlgorithmInput(3, "Modern", "R U // try Ua next")).toBe("Modern");
    expect(dialectForAlgorithmInput(3, "Modern", "((Rm U)4 Rc Uc')3")).toBe("Jaap");
    expect(dialectForAlgorithmInput(3, "Modern", "R U // try Rc next")).toBe("Modern");
    const published4x4 =
      "D2 (F2 R2)3 D2 L2 (u2 F2)2 f2 u2 f2 L2 r2 u2 (f2 u2 r2)3 u2 r2";
    const publishedDialect = dialectForAlgorithmInput(
      4,
      "Modern",
      published4x4,
    );
    expect(publishedDialect).toBe("Jaap");
    const published = evaluateAlgorithm(4, "Wide", publishedDialect, published4x4);
    expect(published.TAG).toBe("Ok");
    if (published.TAG === "Ok") {
      expect(FaceletCodec.render(published._0.finalState)).toBe(
        "UUDUUUUDDUUUUDUURRLRRRRLLRRRRLRRFBFFBFFFFFFBFFBFDDUDDDDUUDDDDUDDLLRLLLLRRLLLLRLLBFBBFBBBBBBFBBFB",
      );
    }
    expect(dialectForAlgorithmInput(4, "Modern", "u2 F2 r2")).toBe("Modern");
  });

  test("detects only SSE move families available on each cube size", () => {
    for (const [size, input] of [[2, "CR"], [3, "MR"], [4, "WR"], [5, "NR"]] as const) {
      const dialect = dialectForAlgorithmInput(size, "Modern", input);
      expect(dialect).toBe("Sse");
      expect(evaluateAlgorithm(size, "Wide", dialect, input).TAG).toBe("Ok");
    }
    expect(dialectForAlgorithmInput(5, "Modern", "M R W U S F")).toBe("Modern");
    expect(dialectForAlgorithmInput(5, "Modern", "R U // try WR next")).toBe("Modern");
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

  test("reports rotations in ETM while keeping them zero in HTM", () => {
    const timeline = evaluateAlgorithm(3, "Wide", "Modern", "R @0.5s x y' z2 M U");
    expect(timeline.TAG).toBe("Ok");
    if (timeline.TAG !== "Ok") return;
    expect(physicalMoveProgress(timeline._0.steps, 0)).toEqual({
      current: 0,
      total: 6,
      htmCurrent: 0,
      htmTotal: 3,
    });
    expect(physicalMoveProgress(timeline._0.steps, 5)).toEqual({
      current: 4,
      total: 6,
      htmCurrent: 1,
      htmTotal: 3,
    });
    expect(physicalMoveProgress(timeline._0.steps, timeline._0.steps.length)).toEqual({
      current: 6,
      total: 6,
      htmCurrent: 3,
      htmTotal: 3,
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
    expect(forward[1].physicalMovesRemaining).toBe(5);
    expect(planHoverPreview(steps, steps.length, 0).map(({speedMultiplier}) => speedMultiplier))
      .toEqual([10, 10, 10, 6, 4, 4, 2]);
  });

  test("enables timeline hover only while playback is stopped or paused", () => {
    expect(timelineHoverEnabled(0)).toBe(true);
    expect(timelineHoverEnabled(1)).toBe(false);
    expect(timelineHoverEnabled(-1)).toBe(false);
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
