export const HOLD_TO_READY_MS = 300;
export const INSPECTION_PLUS_TWO_MS = 15_000;
export const INSPECTION_DNF_MS = 17_000;

export type TimerPenalty = "none" | "+2" | "DNF";
export type TimerPhase = "idle" | "inspection" | "holding" | "ready" | "running" | "stopped";

export type TimerState = {
  phase: TimerPhase;
  inspectionStartedAt: number | null;
  holdStartedAt: number | null;
  solveStartedAt: number | null;
  pendingPenalty: TimerPenalty;
  elapsedMs: number;
};

export type SolveRecord = {
  id: string;
  completedAt: number;
  durationMs: number;
  penalty: TimerPenalty;
  scramble: string;
};

export type TimerSummary = {
  current: number | null;
  best: number | null;
  average: number | null;
  standardDeviation: number | null;
  ao5: number | null;
  ao12: number | null;
};

export const initialTimerState = (): TimerState => ({
  phase: "idle",
  inspectionStartedAt: null,
  holdStartedAt: null,
  solveStartedAt: null,
  pendingPenalty: "none",
  elapsedMs: 0,
});

const validNow = (now: number): number => Math.max(0, Math.floor(now));

export const inspectionPenalty = (inspectionElapsedMs: number): TimerPenalty => {
  if (inspectionElapsedMs > INSPECTION_DNF_MS) return "DNF";
  if (inspectionElapsedMs > INSPECTION_PLUS_TWO_MS) return "+2";
  return "none";
};

export const beginInspection = (state: TimerState, now: number): TimerState => ({
  ...initialTimerState(),
  phase: "inspection",
  inspectionStartedAt: validNow(now),
});

export const beginHold = (state: TimerState, now: number): TimerState => {
  if (state.phase !== "idle" && state.phase !== "inspection") return state;
  return {...state, phase: "holding", holdStartedAt: validNow(now)};
};

export const releaseHold = (state: TimerState, now: number): TimerState => {
  if (state.phase !== "holding" || state.holdStartedAt === null) return state;
  const releasedAt = validNow(now);
  if (releasedAt - state.holdStartedAt < HOLD_TO_READY_MS) {
    return {
      ...state,
      phase: state.inspectionStartedAt === null ? "idle" : "inspection",
      holdStartedAt: null,
    };
  }
  const inspectionElapsed = state.inspectionStartedAt === null
    ? 0
    : releasedAt - state.inspectionStartedAt;
  return {
    ...state,
    phase: "running",
    holdStartedAt: null,
    solveStartedAt: releasedAt,
    pendingPenalty: inspectionPenalty(inspectionElapsed),
    elapsedMs: 0,
  };
};

export const readyTimer = (state: TimerState, now: number): TimerState => {
  if (state.phase !== "holding" || state.holdStartedAt === null) return state;
  return validNow(now) - state.holdStartedAt >= HOLD_TO_READY_MS
    ? {...state, phase: "ready"}
    : state;
};

export const startReadyTimer = (state: TimerState, now: number): TimerState => {
  if (state.phase !== "ready") return state;
  const startedAt = validNow(now);
  const inspectionElapsed = state.inspectionStartedAt === null
    ? 0
    : startedAt - state.inspectionStartedAt;
  return {
    ...state,
    phase: "running",
    holdStartedAt: null,
    solveStartedAt: startedAt,
    pendingPenalty: inspectionPenalty(inspectionElapsed),
    elapsedMs: 0,
  };
};

export const tickTimer = (state: TimerState, now: number): TimerState => {
  if (state.phase !== "running" || state.solveStartedAt === null) return state;
  return {...state, elapsedMs: Math.max(0, validNow(now) - state.solveStartedAt)};
};

export const stopTimer = (
  state: TimerState,
  now: number,
  id: string,
  scramble: string,
): {state: TimerState; solve: SolveRecord | null} => {
  if (state.phase !== "running" || state.solveStartedAt === null) return {state, solve: null};
  const elapsedMs = Math.max(0, validNow(now) - state.solveStartedAt);
  const solve: SolveRecord = {
    id,
    completedAt: validNow(now),
    durationMs: elapsedMs,
    penalty: state.pendingPenalty,
    scramble,
  };
  return {
    solve,
    state: {
      ...state,
      phase: "stopped",
      elapsedMs,
      holdStartedAt: null,
      solveStartedAt: null,
    },
  };
};

export const resetTimer = (): TimerState => initialTimerState();

export const scoredTime = (solve: SolveRecord): number | null =>
  solve.penalty === "DNF" ? null : solve.durationMs + (solve.penalty === "+2" ? 2_000 : 0);

export const averageOf = (solves: SolveRecord[]): number | null => {
  if (solves.length < 3) return null;
  const scored = solves.map(scoredTime);
  const dnfCount = scored.filter((time) => time === null).length;
  if (dnfCount >= 2) return null;
  const finite = scored.filter((time): time is number => time !== null).sort((left, right) => left - right);
  if (finite.length < solves.length - 1) return null;
  const trimmed = dnfCount === 1 ? finite.slice(1) : finite.slice(1, -1);
  if (trimmed.length === 0) return null;
  return Math.round(trimmed.reduce((total, time) => total + time, 0) / trimmed.length);
};

const latestAverage = (solves: SolveRecord[], count: number): number | null =>
  solves.length < count ? null : averageOf(solves.slice(-count));

export const summarizeSession = (solves: SolveRecord[]): TimerSummary => {
  const times = solves.map(scoredTime).filter((time): time is number => time !== null);
  const average = times.length === 0 ? null : Math.round(times.reduce((total, time) => total + time, 0) / times.length);
  const variance = average === null || times.length < 2
    ? null
    : times.reduce((total, time) => total + (time - average) ** 2, 0) / times.length;
  return {
    current: solves.length === 0 ? null : scoredTime(solves.at(-1)!),
    best: times.length === 0 ? null : Math.min(...times),
    average,
    standardDeviation: variance === null ? null : Math.round(Math.sqrt(variance)),
    ao5: latestAverage(solves, 5),
    ao12: latestAverage(solves, 12),
  };
};

export const formatTime = (milliseconds: number | null): string => {
  if (milliseconds === null) return "DNF";
  const centiseconds = Math.max(0, Math.floor(milliseconds / 10));
  const seconds = Math.floor(centiseconds / 100);
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  const remainderCentiseconds = centiseconds % 100;
  const prefix = minutes > 0 ? `${minutes}:${String(remainderSeconds).padStart(2, "0")}` : String(remainderSeconds);
  return `${prefix}.${String(remainderCentiseconds).padStart(2, "0")}`;
};
