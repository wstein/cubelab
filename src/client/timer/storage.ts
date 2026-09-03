import type {SolveRecord} from "./engine";

export type TimerSession = {
  version: 1;
  id: string;
  name: string;
  solves: SolveRecord[];
};

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const TIMER_SESSIONS_STORAGE_KEY = "cubelab-timer-sessions-v1";

const validPenalty = (value: unknown): value is SolveRecord["penalty"] =>
  value === "none" || value === "+2" || value === "DNF";

const validSolve = (value: unknown): value is SolveRecord => {
  if (typeof value !== "object" || value === null) return false;
  const solve = value as Partial<SolveRecord>;
  return typeof solve.id === "string"
    && typeof solve.completedAt === "number"
    && typeof solve.durationMs === "number"
    && typeof solve.scramble === "string"
    && validPenalty(solve.penalty);
};

const validSession = (value: unknown): value is TimerSession => {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Partial<TimerSession>;
  return session.version === 1
    && typeof session.id === "string"
    && typeof session.name === "string"
    && Array.isArray(session.solves)
    && session.solves.every(validSolve);
};

export const readTimerSessions = (storage: StorageLike): TimerSession[] => {
  try {
    const parsed = JSON.parse(storage.getItem(TIMER_SESSIONS_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(validSession) : [];
  } catch {
    return [];
  }
};

export const writeTimerSessions = (storage: StorageLike, sessions: TimerSession[]): boolean => {
  try {
    storage.setItem(TIMER_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch {
    return false;
  }
};
