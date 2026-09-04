import {describe, expect, test} from "vitest";

import {
  HOLD_TO_READY_MS,
  averageOf,
  beginHold,
  beginInspection,
  coverTimer,
  formatTime,
  initialTimerState,
  readyTimer,
  releaseHold,
  startInspectionTimer,
  stopTimer,
  summarizeSession,
  type SolveRecord,
} from "../../src/client/timer/engine";
import {readTimerSessions, writeTimerSessions, type StorageLike} from "../../src/client/timer/storage";
import {exportCsTimerSession, importCsTimerSession, reconstructionBreakdown, reconstructionReplayNotation} from "../../src/client/timer/cstimer";

const solve = (durationMs: number, penalty: SolveRecord["penalty"] = "none"): SolveRecord => ({
  id: `${durationMs}-${penalty}`,
  completedAt: durationMs,
  durationMs,
  penalty,
  scramble: "R U R'",
});

describe("timer engine", () => {
  test("keeps a virtual scramble covered until explicit inspection", () => {
    const covered = coverTimer();
    expect(covered.phase).toBe("covered");
    expect(beginInspection(covered, 100).phase).toBe("inspection");
  });

  test("requires a hold before a solve can start", () => {
    const held = beginHold(initialTimerState(), 1_000);
    expect(releaseHold(held, 1_000 + HOLD_TO_READY_MS - 1).phase).toBe("idle");
    const ready = readyTimer(beginHold(initialTimerState(), 1_000), 1_000 + HOLD_TO_READY_MS);
    expect(ready.phase).toBe("ready");
    expect(releaseHold(beginHold(initialTimerState(), 1_000), 1_000 + HOLD_TO_READY_MS).phase).toBe("running");
  });

  test("applies WCA inspection penalties when the solve starts", () => {
    const inspection = beginInspection(initialTimerState(), 0);
    const plusTwo = releaseHold(beginHold(inspection, 15_100), 15_500);
    const dnf = releaseHold(beginHold(inspection, 17_100), 17_500);
    expect(plusTwo.pendingPenalty).toBe("+2");
    expect(dnf.pendingPenalty).toBe("DNF");
    expect(startInspectionTimer(inspection, 15_100)).toMatchObject({
      phase: "running",
      pendingPenalty: "+2",
      elapsedMs: 0,
    });
  });

  test("records a stopped solve and formats centiseconds", () => {
    const running = releaseHold(beginHold(initialTimerState(), 0), HOLD_TO_READY_MS);
    const completed = stopTimer(running, 12_345, "solve-1", "R U R'");
    expect(completed.solve).toMatchObject({durationMs: 12_045, penalty: "none"});
    expect(completed.state.phase).toBe("stopped");
    expect(formatTime(completed.solve?.durationMs ?? null)).toBe("12.04");
    expect(formatTime(null)).toBe("DNF");
  });

  test("calculates WCA-style trimmed averages and session statistics", () => {
    const five = [solve(10_000), solve(11_000), solve(12_000), solve(13_000), solve(14_000)];
    expect(averageOf(five)).toBe(12_000);
    expect(averageOf([...five.slice(0, 4), solve(20_000, "DNF")])).toBe(12_000);
    const summary = summarizeSession(five);
    expect(summary).toMatchObject({current: 14_000, best: 10_000, average: 12_000, ao5: 12_000});
    expect(summary.standardDeviation).toBeGreaterThan(0);
  });
});

test("timer session storage ignores malformed data and handles unavailable storage", () => {
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  expect(readTimerSessions(storage)).toEqual([]);
  expect(writeTimerSessions(storage, [{version: 1, id: "default", name: "Default", solves: [solve(10_000)]}])).toBe(true);
  expect(readTimerSessions(storage)[0]?.solves).toHaveLength(1);
  values.set("cubelab-timer-sessions-v1", "not json");
  expect(readTimerSessions(storage)).toEqual([]);
});

test("exports a session in csTimer's native one-session JSON shape", () => {
  const exported = exportCsTimerSession({
    version: 1,
    id: "practice",
    name: "CFOP practice",
    solves: [
      {...solve(10_123), completedAt: 1_725_000_000_000},
      {...solve(11_234, "+2"), completedAt: 1_725_000_001_000},
      {...solve(12_345, "DNF"), completedAt: 1_725_000_002_000},
    ],
  });
  expect(exported.properties).toEqual({
    session: 1,
    sessionN: 1,
    sessionData: {"1": {name: "CFOP practice", opt: {scrType: "333"}, rank: 1}},
  });
  expect(exported.session1).toEqual([
    [[0, 10_123], "R U R'", "", 1_725_000_000],
    [[2_000, 11_234], "R U R'", "", 1_725_000_001],
    [[-1, 12_345], "R U R'", "", 1_725_000_002],
  ]);
});

test("round-trips csTimer smart-cube reconstruction timestamps", () => {
  const source = JSON.stringify({
    session1: [[
      [0, 8_765], "R U R'", "", 1_725_000_000,
      ["R@0 U2@123 R'@456", "333"],
    ]],
  });
  const imported = importCsTimerSession(source);
  expect(imported).toMatchObject({ok: true});
  if (!imported.ok) throw new Error(imported.message);
  expect(imported.solves[0]?.reconstruction).toEqual({
    puzzle: "333",
    moves: [
      {move: "R", elapsedMs: 0}, {move: "U2", elapsedMs: 123}, {move: "R'", elapsedMs: 456},
    ],
  });
  const exported = exportCsTimerSession({version: 1, id: "imported", name: "Imported", solves: imported.solves});
  expect(exported.session1[0]?.[4]).toEqual(["R@0 U2@123 R'@456", "333"]);
  expect(reconstructionReplayNotation(imported.solves[0]?.reconstruction?.moves ?? [])).toBe(
    "R @0.123s U2 @0.333s R'",
  );
});

test("rejects malformed or non-monotonic csTimer reconstruction timestamps", () => {
  const imported = importCsTimerSession(JSON.stringify({
    session1: [[[0, 8_765], "R U", "", 1_725_000_000, ["R@300 U@123", "333"]]],
  }));
  expect(imported).toEqual({ok: false, message: "The csTimer session contains no valid 3×3 solves."});
  expect(reconstructionReplayNotation([{move: "R", elapsedMs: 60_001}])).toBe("@60s @0.001s R");
});

test("summarizes reconstruction TPS, pauses, and per-move intervals", () => {
  expect(reconstructionBreakdown([
    {move: "R", elapsedMs: 100}, {move: "U", elapsedMs: 350}, {move: "F2", elapsedMs: 1_100},
  ])).toEqual({
    moves: [
      {move: "R", elapsedMs: 100, intervalMs: 100, isPause: false},
      {move: "U", elapsedMs: 350, intervalMs: 250, isPause: false},
      {move: "F2", elapsedMs: 1_100, intervalMs: 750, isPause: true},
    ],
    recordedDurationMs: 1_100,
    turnsPerSecond: 3 / 1.1,
    pauseCount: 1,
    longestPauseMs: 750,
  });
  expect(reconstructionBreakdown([])).toMatchObject({turnsPerSecond: null, pauseCount: 0});
});
