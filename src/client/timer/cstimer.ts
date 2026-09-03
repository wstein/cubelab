import type {RecordedMove, SolveRecord} from "./engine";
import type {TimerSession} from "./storage";

type CsTimerPenalty = -1 | 0 | 2000;
type CsTimerReconstruction = [string, "333"];
type CsTimerSolve = [[CsTimerPenalty, number], string, string, number, CsTimerReconstruction?];

export type CsTimerSessionExport = {
  session1: CsTimerSolve[];
  properties: {
    session: 1;
    sessionN: 1;
    sessionData: Record<"1", {
      name: string;
      opt: {scrType: "333"};
      rank: 1;
    }>;
  };
};

export type CsTimerImportResult =
  | {ok: true; solves: SolveRecord[]}
  | {ok: false; message: string};

const penaltyFor = (penalty: SolveRecord["penalty"]): CsTimerPenalty =>
  penalty === "DNF" ? -1 : penalty === "+2" ? 2_000 : 0;

const unixSeconds = (completedAt: number, fallbackMs: number, offset: number): number => {
  // Early CubeLab records used performance.now(), which is monotonic rather
  // than a wall-clock timestamp. Preserve their order on export; newer records
  // are stamped with Date.now() when saved.
  const epochMs = completedAt >= 1_000_000_000_000
    ? completedAt
    : fallbackMs + offset;
  return Math.floor(epochMs / 1_000);
};

const reconstructionFor = (solve: SolveRecord): CsTimerReconstruction | undefined => {
  const moves = solve.reconstruction?.moves;
  if (!moves || moves.length === 0) return undefined;
  return [moves.map(({move, elapsedMs}) => `${move}@${Math.max(0, Math.round(elapsedMs))}`).join(" "), "333"];
};

/** Produces the one-session JSON shape consumed by csTimer's native importer. */
export const exportCsTimerSession = (
  session: TimerSession,
  exportedAtMs = Date.now(),
): CsTimerSessionExport => ({
  session1: session.solves.map((solve, index) => {
    const reconstruction = reconstructionFor(solve);
    const entry: CsTimerSolve = [
      [penaltyFor(solve.penalty), Math.max(0, Math.round(solve.durationMs))],
      solve.scramble,
      "",
      unixSeconds(solve.completedAt, exportedAtMs, index - session.solves.length),
    ];
    if (reconstruction) entry.push(reconstruction);
    return entry;
  }),
  properties: {
    session: 1,
    sessionN: 1,
    sessionData: {
      "1": {
        name: session.name,
        opt: {scrType: "333"},
        rank: 1,
      },
    },
  },
});

export const downloadCsTimerSession = (session: TimerSession): void => {
  const payload = JSON.stringify(exportCsTimerSession(session), null, 2);
  const blob = new Blob([payload], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cubelab-cstimer-session.json";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const recordedMoves = (value: unknown): RecordedMove[] | null => {
  if (!Array.isArray(value) || typeof value[0] !== "string" || (value[1] !== undefined && value[1] !== "333")) return null;
  const source = value[0].trim();
  if (source === "") return [];
  const moves: RecordedMove[] = [];
  let previousElapsedMs = 0;
  for (const token of source.split(/\s+/)) {
    const match = /^([^\s@]+)@(\d+)$/.exec(token);
    if (!match) return null;
    const elapsedMs = Number(match[2]);
    if (!Number.isSafeInteger(elapsedMs) || elapsedMs < previousElapsedMs) return null;
    moves.push({move: match[1], elapsedMs});
    previousElapsedMs = elapsedMs;
  }
  return moves;
};

const pauseNotation = (durationMs: number): string[] => {
  const pauses: string[] = [];
  let remaining = Math.max(0, Math.round(durationMs));
  while (remaining > 60_000) {
    pauses.push("@60s");
    remaining -= 60_000;
  }
  if (remaining > 0) {
    const seconds = (remaining / 1_000).toFixed(3).replace(/\.?0+$/, "");
    pauses.push(`@${seconds}s`);
  }
  return pauses;
};

/**
 * Converts csTimer's elapsed move timestamps into CubeLab's timed-pause syntax.
 * At 1× tape speed, the pauses preserve each recorded delay; longer gaps are
 * split because a single CubeLab timed pause is deliberately capped at 60 s.
 */
export const reconstructionReplayNotation = (moves: RecordedMove[]): string => {
  let previousElapsedMs = 0;
  const notation: string[] = [];
  for (const {move, elapsedMs} of moves) {
    notation.push(...pauseNotation(elapsedMs - previousElapsedMs), move);
    previousElapsedMs = elapsedMs;
  }
  return notation.join(" ");
};

/** Reads csTimer's `session1` entries, including its optional smart-cube replay field. */
export const importCsTimerSession = (source: string): CsTimerImportResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return {ok: false, message: "This file is not valid JSON."};
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as {session1?: unknown}).session1)) {
    return {ok: false, message: "No csTimer session1 data was found."};
  }
  const solves: SolveRecord[] = [];
  for (const [index, entry] of (parsed as {session1: unknown[]}).session1.entries()) {
    if (!Array.isArray(entry) || !Array.isArray(entry[0]) || typeof entry[1] !== "string" || typeof entry[3] !== "number") continue;
    const [penalty, duration] = entry[0];
    if (typeof duration !== "number" || !Number.isFinite(duration) || ![0, 2_000, -1].includes(penalty)) continue;
    const moves = entry.length >= 5 ? recordedMoves(entry[4]) : [];
    if (moves === null) continue;
    solves.push({
      id: `cstimer-${entry[3]}-${index}`,
      completedAt: Math.max(0, Math.round(entry[3] * 1_000)),
      durationMs: Math.max(0, Math.round(duration)),
      penalty: penalty === -1 ? "DNF" : penalty === 2_000 ? "+2" : "none",
      scramble: entry[1],
      ...(moves.length > 0 ? {reconstruction: {puzzle: "333" as const, moves}} : {}),
    });
  }
  return solves.length > 0
    ? {ok: true, solves}
    : {ok: false, message: "The csTimer session contains no valid 3×3 solves."};
};
