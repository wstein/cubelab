import assert from "node:assert/strict";
import test from "node:test";

import * as SmartCubeDeviation from "../src/SmartCube/SmartCubeDeviation.res.mjs";

const {
  assessSmartCubeRecovery,
  beginSmartCubeRecovery,
  inverseSmartCubeMove,
  normalizeSmartCubeMoves,
  quarterTurnsCancel,
  smartCubeRecoveryMatchesExpected,
  smartCubeRecoveryPrompt,
} = SmartCubeDeviation;

const expected = {timelineIndex: 7, token: "R"};

test("inverts every physical face-turn form", () => {
  assert.equal(inverseSmartCubeMove("F"), "F'");
  assert.equal(inverseSmartCubeMove("f'"), "F");
  assert.equal(inverseSmartCubeMove("U2"), "U2");
  assert.equal(inverseSmartCubeMove("M"), undefined);
  assert.equal(quarterTurnsCancel("R", "R'"), true);
  assert.equal(quarterTurnsCancel("R'", "R"), true);
  assert.equal(quarterTurnsCancel("R", "R"), false);
});

test("asks for the inverse slip before resuming the expected move", () => {
  const recovery = beginSmartCubeRecovery(expected, "F");
  assert.deepEqual(recovery, {expected, undoMoves: ["F'"], deviations: ["F"]});
  assert.equal(
    smartCubeRecoveryPrompt(recovery),
    "Slip detected: turn F' to realign, then R.",
  );
  assert.deepEqual(assessSmartCubeRecovery(recovery, "F'"), {
    TAG: "Realigned",
    received: "F'",
  });
});

test("uses a LIFO undo stack when another slip occurs during recovery", () => {
  const first = beginSmartCubeRecovery(expected, "F");
  const second = assessSmartCubeRecovery(first, "U");
  assert.equal(second.TAG, "Extended");
  assert.deepEqual(second.state.undoMoves, ["U'", "F'"]);
  assert.deepEqual(second.state.deviations, ["F", "U"]);
  const undoU = assessSmartCubeRecovery(second.state, "U'");
  assert.equal(undoU.TAG, "Recovering");
  assert.deepEqual(undoU.state.undoMoves, ["F'"]);
  assert.deepEqual(undoU.state.deviations, ["F"]);
  assert.equal(assessSmartCubeRecovery(undoU.state, "F'").TAG, "Realigned");
});

test("canonicalizes repeated turns and removes net-zero detours", () => {
  assert.deepEqual(
    normalizeSmartCubeMoves(["D'", "D'", "R'", "R'", "R'", "R'"]),
    ["D2"],
  );
  assert.deepEqual(normalizeSmartCubeMoves(["U", "U'"]), []);
  assert.deepEqual(normalizeSmartCubeMoves(["R", "R"]), ["R2"]);

  const first = beginSmartCubeRecovery(expected, "D'");
  const half = assessSmartCubeRecovery(first, "D'");
  assert.equal(half.TAG, "Extended");
  assert.deepEqual(half.state.deviations, ["D2"]);
  assert.deepEqual(half.state.undoMoves, ["D2"]);
  assert.equal(assessSmartCubeRecovery(half.state, "D2").TAG, "Realigned");
});

test("removes a redundant undo plus replay when the slip already equals the expected move", () => {
  const expectedPrime = {timelineIndex: 4, token: "F'"};
  const alreadyCompleted = beginSmartCubeRecovery(expectedPrime, "F'");
  assert.equal(smartCubeRecoveryMatchesExpected(alreadyCompleted), true);
  assert.deepEqual(
    normalizeSmartCubeMoves([...alreadyCompleted.undoMoves, expectedPrime.token]),
    [],
  );
});
