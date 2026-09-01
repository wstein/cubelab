import {describe, expect, test} from "bun:test";

import {
  assessSmartCubeRecovery,
  beginSmartCubeRecovery,
  inverseSmartCubeMove,
  normalizeSmartCubeMoves,
  quarterTurnsCancel,
  smartCubeRecoveryPrompt,
} from "../../../src/client/smart-cube/deviation-verifier";

const expected = {timelineIndex: 7, token: "R"};

describe("smart cube deviation recovery", () => {
  test("inverts every physical face-turn form", () => {
    expect(inverseSmartCubeMove("F")).toBe("F'");
    expect(inverseSmartCubeMove("f'")).toBe("F");
    expect(inverseSmartCubeMove("U2")).toBe("U2");
    expect(inverseSmartCubeMove("M")).toBeNull();
    expect(quarterTurnsCancel("R", "R'")).toBe(true);
    expect(quarterTurnsCancel("R'", "R")).toBe(true);
    expect(quarterTurnsCancel("R", "R")).toBe(false);
  });

  test("asks for the inverse slip before resuming the expected move", () => {
    const recovery = beginSmartCubeRecovery(expected, "F");
    expect(recovery).toEqual({expected, undoMoves: ["F'"], deviations: ["F"]});
    expect(smartCubeRecoveryPrompt(recovery!)).toBe(
      "Slip detected: turn F' to realign, then R.",
    );
    expect(assessSmartCubeRecovery(recovery!, "F'")).toEqual({
      status: "realigned",
      received: "F'",
    });
  });

  test("uses a LIFO undo stack when another slip occurs during recovery", () => {
    const first = beginSmartCubeRecovery(expected, "F")!;
    const second = assessSmartCubeRecovery(first, "U");
    expect(second).toMatchObject({
      status: "extended",
      state: {undoMoves: ["U'", "F'"], deviations: ["F", "U"]},
    });
    if (second.status !== "extended") return;
    const undoU = assessSmartCubeRecovery(second.state, "U'");
    expect(undoU).toMatchObject({
      status: "recovering",
      state: {undoMoves: ["F'"], deviations: ["F"]},
    });
    if (undoU.status !== "recovering") return;
    expect(assessSmartCubeRecovery(undoU.state, "F'").status).toBe("realigned");
  });

  test("canonicalizes repeated turns and removes net-zero detours", () => {
    expect(normalizeSmartCubeMoves(["D'", "D'", "R'", "R'", "R'", "R'"]))
      .toEqual(["D2"]);
    expect(normalizeSmartCubeMoves(["U", "U'"])).toEqual([]);
    expect(normalizeSmartCubeMoves(["R", "R"])).toEqual(["R2"]);

    const first = beginSmartCubeRecovery(expected, "D'")!;
    const half = assessSmartCubeRecovery(first, "D'");
    expect(half).toMatchObject({
      status: "extended",
      state: {deviations: ["D2"], undoMoves: ["D2"]},
    });
    if (half.status !== "extended") return;
    expect(assessSmartCubeRecovery(half.state, "D2").status).toBe("realigned");
  });
});
