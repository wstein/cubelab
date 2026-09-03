import {
  beginHold,
  beginInspection,
  formatTime,
  initialTimerState,
  readyTimer,
  releaseHold,
  resetTimer,
  startReadyTimer,
  stopTimer,
  summarizeSession,
  tickTimer,
  type SolveRecord,
  type TimerState,
} from "./engine";
import {readTimerSessions, writeTimerSessions, type TimerSession} from "./storage";

const PRACTICE_FACES = ["U", "R", "F", "D", "L", "B"];
const TURN_SUFFIXES = ["", "2", "'"];

const practiceScramble = (): string => {
  let previous = "";
  const moves: string[] = [];
  while (moves.length < 20) {
    const face = PRACTICE_FACES[Math.floor(Math.random() * PRACTICE_FACES.length)]!;
    if (face === previous) continue;
    previous = face;
    moves.push(`${face}${TURN_SUFFIXES[Math.floor(Math.random() * TURN_SUFFIXES.length)]}`);
  }
  return moves.join(" ");
};

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const inputActive = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

export const mountTimerWorkspace = (root: HTMLElement): void => {
  const panel = root.querySelector<HTMLElement>("[data-workspace-panel=timer]");
  if (!panel) return;
  const display = panel.querySelector<HTMLButtonElement>("[data-timer-display]")!;
  const status = panel.querySelector<HTMLElement>("[data-timer-status]")!;
  const scramble = panel.querySelector<HTMLElement>("[data-timer-scramble]")!;
  const stats = panel.querySelector<HTMLElement>("[data-timer-stats]")!;
  const solves = panel.querySelector<HTMLOListElement>("[data-timer-solves]")!;
  const inspection = panel.querySelector<HTMLButtonElement>("[data-timer-inspection]")!;
  const reset = panel.querySelector<HTMLButtonElement>("[data-timer-reset]")!;
  const nextScramble = panel.querySelector<HTMLButtonElement>("[data-timer-new-scramble]")!;
  let state: TimerState = initialTimerState();
  let currentScramble = practiceScramble();
  let session: TimerSession = readTimerSessions(window.localStorage)[0]
    ?? {version: 1, id: "default", name: "Default", solves: []};
  let frame: number | null = null;

  const persist = () => {
    writeTimerSessions(window.localStorage, [session]);
  };
  const phaseMessage = (): string => {
    if (state.phase === "inspection") return "Inspection running. Hold Space until green, then release.";
    if (state.phase === "holding") return "Hold Space…";
    if (state.phase === "ready") return "Ready — release Space to start.";
    if (state.phase === "running") return "Solving — press Space or tap the timer to stop.";
    if (state.phase === "stopped") return "Solve saved. Press Space for the next inspection.";
    return "Press Space to begin inspection.";
  };
  const render = () => {
    const shown = state.phase === "inspection" && state.inspectionStartedAt !== null
      ? performance.now() - state.inspectionStartedAt
      : state.elapsedMs;
    display.textContent = formatTime(shown);
    display.dataset.phase = state.phase;
    status.textContent = phaseMessage();
    scramble.textContent = currentScramble;
    const summary = summarizeSession(session.solves);
    stats.replaceChildren(...([
      ["Best", formatTime(summary.best)], ["Ao5", formatTime(summary.ao5)], ["Ao12", formatTime(summary.ao12)],
    ] as const).map(([label, value]) => {
      const row = document.createElement("div");
      row.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
      return row;
    }));
    solves.replaceChildren(...session.solves.slice().reverse().map((solve) => {
      const item = document.createElement("li");
      item.innerHTML = `<code>${formatTime(solve.durationMs)}${solve.penalty === "+2" ? " +2" : solve.penalty === "DNF" ? " DNF" : ""}</code><button type="button" data-timer-penalty="${solve.id}">+2</button><button type="button" data-timer-dnf="${solve.id}">DNF</button><button type="button" data-timer-delete="${solve.id}">Delete</button>`;
      return item;
    }));
  };
  const animate = () => {
    state = tickTimer(state, performance.now());
    if (state.phase === "holding") state = readyTimer(state, performance.now());
    render();
    if (state.phase === "inspection" || state.phase === "holding" || state.phase === "ready" || state.phase === "running") {
      frame = window.requestAnimationFrame(animate);
    } else frame = null;
  };
  const schedule = () => {
    if (frame === null) frame = window.requestAnimationFrame(animate);
  };
  const begin = () => {
    const now = performance.now();
    if (state.phase === "idle" || state.phase === "stopped") state = beginInspection(state, now);
    else if (state.phase === "inspection") state = beginHold(state, now);
    else if (state.phase === "running") {
      const completed = stopTimer(state, now, newId(), currentScramble);
      state = completed.state;
      if (completed.solve) {
        session = {...session, solves: [...session.solves, completed.solve]};
        persist();
        currentScramble = practiceScramble();
      }
    }
    render();
    schedule();
  };
  const release = () => {
    if (state.phase !== "holding" && state.phase !== "ready") return;
    const now = performance.now();
    state = state.phase === "ready" ? startReadyTimer(state, now) : releaseHold(state, now);
    render();
    schedule();
  };
  display.addEventListener("pointerdown", (event) => { event.preventDefault(); begin(); });
  display.addEventListener("pointerup", release);
  inspection.addEventListener("click", () => { state = beginInspection(state, performance.now()); render(); schedule(); });
  reset.addEventListener("click", () => { state = resetTimer(); render(); });
  nextScramble.addEventListener("click", () => { currentScramble = practiceScramble(); render(); });
  solves.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    const update = (id: string, change: Partial<SolveRecord>) => {
      session = {...session, solves: session.solves.map((solve) => solve.id === id ? {...solve, ...change} : solve)};
    };
    if (button.dataset.timerPenalty) update(button.dataset.timerPenalty, {penalty: "+2"});
    if (button.dataset.timerDnf) update(button.dataset.timerDnf, {penalty: "DNF"});
    if (button.dataset.timerDelete) session = {...session, solves: session.solves.filter((solve) => solve.id !== button.dataset.timerDelete)};
    persist(); render();
  });
  window.addEventListener("keydown", (event) => {
    if (panel.hidden || inputActive(event.target) || event.code !== "Space" || event.repeat) return;
    event.preventDefault(); begin();
  });
  window.addEventListener("keyup", (event) => {
    if (panel.hidden || event.code !== "Space") return;
    event.preventDefault(); release();
  });
  render();
};
