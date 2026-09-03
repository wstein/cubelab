import {describe, expect, test} from "vitest";

import {
  HOLD_TO_READY_MS,
  averageOf,
  beginHold,
  beginInspection,
  formatTime,
  initialTimerState,
  readyTimer,
  releaseHold,
  stopTimer,
  summarizeSession,
  type SolveRecord,
} from "../../src/client/timer/engine";
import {readTimerSessions, writeTimerSessions, type StorageLike} from "../../src/client/timer/storage";

const solve = (durationMs: number, penalty: SolveRecord["penalty"] = "none"): SolveRecord => ({
  id: `${durationMs}-${penalty}`,
  completedAt: durationMs,
  durationMs,
  penalty,
  scramble: "R U R'",
});

describe("timer engine", () => {
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
