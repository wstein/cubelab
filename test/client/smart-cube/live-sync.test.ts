import {describe, expect, test} from "bun:test";

import * as FaceletCodec from "../../../src/State/FaceletCodec.res.mjs";
import * as StateTypes from "../../../src/State/StateTypes.res.mjs";
import * as MoveExecutor from "../../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../../src/Move/MoveParser.res.mjs";
import {buildTimeline} from "../../../src/client/playback";
import {
  appendRecordedMove,
  assessSmartCubeMove,
  canonicalSmartCubeMove,
  isLastPhysicalMoveInRange,
  nextExpectedSmartCubeMove,
} from "../../../src/client/smart-cube/live-sync";

const face = (name: "R" | "U" | "F" | "B") => ({
  step: {move: {TAG: "FaceTurn" as const, _0: name, _1: {from_: 1, to_: 1}}, turns: 1},
});

describe("smart cube live synchronization", () => {
  const steps = [
    {step: {move: {TAG: "Rotation" as const, _0: "X" as const}, turns: 2}},
    {durationMs: 500},
    face("R"),
    face("U"),
    {step: {move: {TAG: "SliceTurn" as const, _0: "M" as const}, turns: 2}},
    face("F"),
  ];
  const labels = ["x2", "Pause", "R", "U", "M2", "F"];

  test("skips rotations and pauses when finding the expected physical move", () => {
    expect(nextExpectedSmartCubeMove(steps, labels, 0)).toEqual({timelineIndex: 2, token: "R"});
    expect(nextExpectedSmartCubeMove(steps, labels, 3)).toEqual({timelineIndex: 3, token: "D"});
    expect(nextExpectedSmartCubeMove(steps, labels, steps.length)).toBeNull();
  });

  test("distinguishes matched, mismatched, unsupported, and complete Academy turns", () => {
    expect(assessSmartCubeMove(steps, labels, 0, "r").status).toBe("matched");
    expect(assessSmartCubeMove(steps, labels, 0, "U")).toMatchObject({
      status: "mismatch",
      received: "U",
    });
    expect(assessSmartCubeMove(steps, labels, 4, "L").status).toBe("unsupported");
    expect(assessSmartCubeMove(steps, labels, steps.length, "R").status).toBe("complete");
  });

  test("conjugates hints back into the fixed physical cube frame", () => {
    const xRotation = [
      {step: {move: {TAG: "Rotation" as const, _0: "X" as const}, turns: 2}},
      {step: {move: {TAG: "FaceTurn" as const, _0: "B" as const, _1: {from_: 1, to_: 1}}, turns: 3}},
    ];
    expect(nextExpectedSmartCubeMove(xRotation, ["x2", "B'"], 0))
      .toEqual({timelineIndex: 1, token: "F'"});

    const yRotation = [
      {step: {move: {TAG: "Rotation" as const, _0: "Y" as const}, turns: 1}},
      face("F"),
    ];
    expect(nextExpectedSmartCubeMove(yRotation, ["y", "F"], 0))
      .toEqual({timelineIndex: 1, token: "R"});

    const composed = [
      {step: {move: {TAG: "Rotation" as const, _0: "Y" as const}, turns: 1}},
      {step: {move: {TAG: "Rotation" as const, _0: "X" as const}, turns: 2}},
      {step: {move: {TAG: "FaceTurn" as const, _0: "B" as const, _1: {from_: 1, to_: 1}}, turns: 2}},
    ];
    expect(nextExpectedSmartCubeMove(composed, ["y", "x2", "B2"], 0))
      .toEqual({timelineIndex: 2, token: "R2"});
  });

  test("replaying fixed-frame hints reaches the same state as the rotated timeline", () => {
    const solved = StateTypes.solved(3)._0;
    const parsed = MoveParser.parse(3, "x2 B U' R2 x2");
    expect(parsed.TAG).toBe("Ok");
    if (parsed.TAG !== "Ok") return;
    const built = buildTimeline(solved, parsed._0);
    expect(built.TAG).toBe("Ok");
    if (built.TAG !== "Ok") return;
    const timeline = built._0;
    const physicalTokens: string[] = [];
    let cursor = 0;
    while (cursor < timeline.steps.length) {
      const expected = nextExpectedSmartCubeMove(timeline.steps, timeline.labels, cursor);
      if (!expected) break;
      physicalTokens.push(expected.token);
      cursor = expected.timelineIndex + 1;
    }
    expect(physicalTokens).toEqual(["F", "D'", "R2"]);

    const physical = MoveParser.parse(3, physicalTokens.join(" "));
    expect(physical.TAG).toBe("Ok");
    if (physical.TAG !== "Ok") return;
    const fullState = MoveExecutor.applyAlg(solved, parsed._0);
    const physicalState = MoveExecutor.applyAlg(solved, physical._0);
    expect(fullState.TAG).toBe("Ok");
    expect(physicalState.TAG).toBe("Ok");
    if (fullState.TAG !== "Ok" || physicalState.TAG !== "Ok") return;
    expect(FaceletCodec.render(physicalState._0)).toBe(FaceletCodec.render(fullState._0));
  });

  test("accumulates two same-direction quarter-turn packets into one expected half turn", () => {
    const halfSteps = [
      {step: {move: {TAG: "FaceTurn" as const, _0: "R" as const, _1: {from_: 1, to_: 1}}, turns: 2}},
    ];
    const direct = assessSmartCubeMove(halfSteps, ["R2"], 0, "R2");
    expect(direct).toMatchObject({status: "matched", completedHalfTurn: false});

    const first = assessSmartCubeMove(halfSteps, ["R2"], 0, "R");
    expect(first).toMatchObject({
      status: "partial",
      received: "R",
      progress: {timelineIndex: 0, quarterTurn: "R"},
    });
    if (first.status !== "partial") return;
    expect(assessSmartCubeMove(halfSteps, ["R2"], 0, "R", first.progress))
      .toMatchObject({status: "matched", completedHalfTurn: true});
    expect(assessSmartCubeMove(halfSteps, ["R2"], 0, "R'", first.progress).status)
      .toBe("mismatch");

    const counterClockwise = assessSmartCubeMove(halfSteps, ["R2"], 0, "R'");
    expect(counterClockwise.status).toBe("partial");
    if (counterClockwise.status !== "partial") return;
    expect(assessSmartCubeMove(halfSteps, ["R2"], 0, "R'", counterClockwise.progress))
      .toMatchObject({status: "matched", completedHalfTurn: true});
  });

  test("records normalized moves without joining line comments", () => {
    expect(canonicalSmartCubeMove(" r' ")).toBe("R'");
    expect(appendRecordedMove("R U", "f2")).toBe("R U F2");
    expect(appendRecordedMove("R // setup", "U")).toBe("R // setup\nU");
    expect(appendRecordedMove("", "D'")).toBe("D'");
  });

  test("recognizes the final physical move inside a phase range", () => {
    expect(isLastPhysicalMoveInRange(steps, 2, 4)).toBe(false);
    expect(isLastPhysicalMoveInRange(steps, 3, 4)).toBe(true);
    expect(isLastPhysicalMoveInRange(steps, 4, 6)).toBe(false);
    expect(isLastPhysicalMoveInRange(steps, 5, 6)).toBe(true);
  });
});
