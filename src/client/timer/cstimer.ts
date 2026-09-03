import type {SolveRecord} from "./engine";
import type {TimerSession} from "./storage";

type CsTimerPenalty = -1 | 0 | 2000;
type CsTimerSolve = [[CsTimerPenalty, number], string, string, number];

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

/** Produces the one-session JSON shape consumed by csTimer's native importer. */
export const exportCsTimerSession = (
  session: TimerSession,
  exportedAtMs = Date.now(),
): CsTimerSessionExport => ({
  session1: session.solves.map((solve, index) => [
    [penaltyFor(solve.penalty), Math.max(0, Math.round(solve.durationMs))],
    solve.scramble,
    "",
    unixSeconds(solve.completedAt, exportedAtMs, index - session.solves.length),
  ]),
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
