import {describe, expect, test} from "bun:test";

import {
  appendRecordedMove,
  assessSmartCubeMove,
  canonicalSmartCubeMove,
  isLastPhysicalMoveInRange,
  nextExpectedSmartCubeMove,
} from "../../../src/client/smart-cube/live-sync";

const face = (name: "R" | "U" | "F") => ({
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
    expect(nextExpectedSmartCubeMove(steps, labels, 3)).toEqual({timelineIndex: 3, token: "U"});
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
