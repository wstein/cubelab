import {describe, expect, test} from "bun:test";

import {
  assessSmartCubeRecovery,
  beginSmartCubeRecovery,
  inverseSmartCubeMove,
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
    expect(undoU).toMatchObject({status: "recovering", state: {undoMoves: ["F'"]}});
    if (undoU.status !== "recovering") return;
    expect(assessSmartCubeRecovery(undoU.state, "F'").status).toBe("realigned");
  });
});
