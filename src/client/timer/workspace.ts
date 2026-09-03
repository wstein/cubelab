import {
  beginHold,
  beginInspection,
  coverTimer,
  formatTime,
  initialTimerState,
  readyTimer,
  releaseHold,
  resetTimer,
  startInspectionTimer,
  startReadyTimer,
  stopTimer,
  summarizeSession,
  tickTimer,
  type SolveRecord,
  type TimerState,
} from "./engine";
import {readTimerSessions, writeTimerSessions, type TimerSession} from "./storage";
import {hasVerifiedTnoodle, readPreferences} from "../preferences";
import {TnoodleClient} from "../scramble/tnoodle-client";
import {practiceScramble} from "../scramble/practice";
import {downloadCsTimerSession, importCsTimerSession, reconstructionReplayNotation} from "./cstimer";

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const inputActive = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

export const mountTimerWorkspace = (root: HTMLElement): void => {
  const panel = root.querySelector<HTMLElement>("[data-workspace-panel=timer]");
  if (!panel) return;
  const display = panel.querySelector<HTMLButtonElement>("[data-timer-display]")!;
  const status = panel.querySelector<HTMLElement>("[data-timer-status]")!;
  const scramble = panel.querySelector<HTMLElement>("[data-timer-scramble]")!;
  const scrambleSource = panel.querySelector<HTMLElement>("[data-timer-scramble-source]")!;
  const stats = panel.querySelector<HTMLElement>("[data-timer-stats]")!;
  const solves = panel.querySelector<HTMLOListElement>("[data-timer-solves]")!;
  const inspection = panel.querySelector<HTMLButtonElement>("[data-timer-inspection]")!;
  const reset = panel.querySelector<HTMLButtonElement>("[data-timer-reset]")!;
  const cubelabScramble = panel.querySelector<HTMLButtonElement>("[data-timer-cubelab-scramble]")!;
  const tnoodleScramble = panel.querySelector<HTMLButtonElement>("[data-timer-tnoodle-scramble]")!;
  const arena = panel.querySelector<HTMLButtonElement>("[data-timer-arena]")!;
  const exportCsTimer = panel.querySelector<HTMLButtonElement>("[data-timer-export-cstimer]")!;
  const importCsTimer = panel.querySelector<HTMLButtonElement>("[data-timer-import-cstimer]")!;
  const importFile = panel.querySelector<HTMLInputElement>("[data-timer-import-file]")!;
  let state: TimerState = initialTimerState();
  let currentScramble = practiceScramble();
  let currentScrambleSource = "Built-in practice scramble";
  let session: TimerSession = readTimerSessions(window.localStorage)[0]
    ?? {version: 1, id: "default", name: "Default", solves: []};
  let frame: number | null = null;
  let controllerMode = false;
  let inspectionCue = 0;
  let cueAudio: AudioContext | null = null;
  const tnoodle = new TnoodleClient();
  let scrambleRequest = 0;
  let selectedScrambleSource: "cubelab" | "tnoodle" = "cubelab";
  let recordedMoves: SolveRecord["reconstruction"] = undefined;

  const persist = () => {
    writeTimerSessions(window.localStorage, [session]);
  };
  const saveSolve = (solve: SolveRecord) => {
    // TimerEngine deliberately stays pure and uses its injected monotonic clock.
    // Session storage also needs a wall-clock completion time for portable exports.
    session = {
      ...session,
      solves: [...session.solves, {
        ...solve,
        completedAt: Date.now(),
        ...(recordedMoves ? {reconstruction: recordedMoves} : {}),
      }],
    };
    recordedMoves = undefined;
    persist();
  };
  const publishPhase = () => {
    window.dispatchEvent(new CustomEvent("cubelab:timer-phase", {
      detail: {phase: state.phase},
    }));
  };
  const publishHud = (shown: number) => {
    window.dispatchEvent(new CustomEvent("cubelab:timer-hud", {
      detail: {phase: state.phase, shown, scramble: currentScramble, summary: summarizeSession(session.solves)},
    }));
  };
  const playInspectionCue = (seconds: number) => {
    try {
      cueAudio ??= new AudioContext();
      const oscillator = cueAudio.createOscillator();
      const gain = cueAudio.createGain();
      oscillator.frequency.value = seconds === 12 ? 880 : 660;
      gain.gain.setValueAtTime(0.05, cueAudio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, cueAudio.currentTime + 0.16);
      oscillator.connect(gain).connect(cueAudio.destination);
      oscillator.start();
      oscillator.stop(cueAudio.currentTime + 0.17);
    } catch {
      // Audio is supplementary; visual warning and timing remain reliable.
    }
  };
  const phaseMessage = (): string => {
    if (state.phase === "covered") return "Scramble covered. Press Space, Inspect, or tap the cover to begin inspection.";
    if (state.phase === "inspection") return "Inspection running. Your first complete controller turn starts the solve.";
    if (state.phase === "holding") return "Hold Space…";
    if (state.phase === "ready") return "Ready — release Space to start.";
    if (state.phase === "running") return "Solving — press Space or tap the timer to stop.";
    if (state.phase === "stopped") return "Solve saved. Press Space for the next inspection.";
    return "Press Space to begin inspection.";
  };
  const render = () => {
    const preferences = readPreferences(window.localStorage);
    const tnoodleAvailable = preferences.tnoodleEnabled && hasVerifiedTnoodle(preferences);
    tnoodleScramble.disabled = !tnoodleAvailable;
    tnoodleScramble.title = tnoodleAvailable
      ? "Load a verified TNoodle 3×3 scramble"
      : "Test and enable the configured TNoodle server in Settings first.";
    exportCsTimer.disabled = session.solves.length === 0;
    exportCsTimer.title = session.solves.length === 0
      ? "Complete a solve before exporting the session."
      : "Download this 3×3 session as csTimer-compatible JSON.";
    const shown = state.phase === "inspection" && state.inspectionStartedAt !== null
      ? performance.now() - state.inspectionStartedAt
      : state.elapsedMs;
    display.textContent = formatTime(shown);
    display.dataset.phase = state.phase;
    status.textContent = phaseMessage();
    scramble.textContent = currentScramble;
    scrambleSource.textContent = currentScrambleSource;
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
      item.innerHTML = `<code>${formatTime(solve.durationMs)}${solve.penalty === "+2" ? " +2" : solve.penalty === "DNF" ? " DNF" : ""}</code>${solve.reconstruction?.moves.length ? `<button type="button" data-timer-replay="${solve.id}">Replay</button>` : ""}<button type="button" data-timer-penalty="${solve.id}">+2</button><button type="button" data-timer-dnf="${solve.id}">DNF</button><button type="button" data-timer-delete="${solve.id}">Delete</button>`;
      return item;
    }));
    publishHud(shown);
  };
  const animate = () => {
    state = tickTimer(state, performance.now());
    if (state.phase === "holding") state = readyTimer(state, performance.now());
    if (state.phase === "inspection" && state.inspectionStartedAt !== null) {
      const elapsed = performance.now() - state.inspectionStartedAt;
      const cue = elapsed >= 12_000 ? 12 : elapsed >= 8_000 ? 8 : 0;
      if (cue > inspectionCue) {
        inspectionCue = cue;
        playInspectionCue(cue);
        window.dispatchEvent(new CustomEvent("cubelab:timer-cue", {detail: {seconds: cue}}));
      }
    }
    render();
    if (state.phase === "inspection" || state.phase === "holding" || state.phase === "ready" || state.phase === "running") {
      frame = window.requestAnimationFrame(animate);
    } else frame = null;
  };
  const schedule = () => {
    if (frame === null) frame = window.requestAnimationFrame(animate);
  };
  const assignNextScramble = async (sourceKind: "cubelab" | "tnoodle" = "cubelab") => {
    selectedScrambleSource = sourceKind;
    const request = ++scrambleRequest;
    const preferences = readPreferences(window.localStorage);
    let next = practiceScramble();
    let source = "CubeLab practice scramble";
    if (sourceKind === "tnoodle" && preferences.tnoodleEnabled && hasVerifiedTnoodle(preferences)) {
      try {
        const result = await tnoodle.next({
          serverUrl: preferences.tnoodleServerUrl,
          event: preferences.tnoodleEvent,
        });
        next = result.scramble;
        source = `TNoodle ${result.event} scramble`;
      } catch (error) {
        source = `CubeLab fallback: ${error instanceof Error ? error.message : "TNoodle unavailable."}`;
      }
    }
    if (request !== scrambleRequest) return;
    currentScramble = next;
    currentScrambleSource = source;
    if (controllerMode) {
      state = coverTimer();
      publishPhase();
      schedule();
    }
    window.dispatchEvent(new CustomEvent("cubelab:timer-scramble", {detail: {scramble: currentScramble}}));
    render();
  };
  const begin = () => {
    const now = performance.now();
    if (state.phase === "idle" || state.phase === "stopped" || state.phase === "covered") {
      state = beginInspection(state, now);
      inspectionCue = 0;
      recordedMoves = undefined;
    }
    else if (state.phase === "inspection") state = beginHold(state, now);
    else if (state.phase === "running") {
      const completed = stopTimer(state, now, newId(), currentScramble);
      state = completed.state;
      if (completed.solve) {
        saveSolve(completed.solve);
        void assignNextScramble(selectedScrambleSource);
      }
    }
    render();
    publishPhase();
    schedule();
  };
  const release = () => {
    if (state.phase !== "holding" && state.phase !== "ready") return;
    const now = performance.now();
    state = state.phase === "ready" ? startReadyTimer(state, now) : releaseHold(state, now);
    render();
    publishPhase();
    schedule();
  };
  display.addEventListener("pointerdown", (event) => { event.preventDefault(); begin(); });
  display.addEventListener("pointerup", release);
  inspection.addEventListener("click", () => {
    state = beginInspection(state, performance.now());
    render();
    publishPhase();
    schedule();
  });
  reset.addEventListener("click", () => { state = resetTimer(); render(); publishPhase(); });
  cubelabScramble.addEventListener("click", () => { void assignNextScramble("cubelab"); });
  tnoodleScramble.addEventListener("click", () => { void assignNextScramble("tnoodle"); });
  window.addEventListener("cubelab:controller-mode", ((event: CustomEvent<{enabled: boolean}>) => {
    controllerMode = event.detail.enabled;
    render();
  }) as EventListener);
  window.addEventListener("cubelab:preferences-changed", render);
  window.addEventListener("cubelab:timer-inspect", () => {
    if (state.phase === "covered") begin();
  });
  window.addEventListener("cubelab:timer-cover", () => {
    if (!controllerMode) return;
    state = coverTimer();
    publishPhase();
    render();
  });
  arena.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("cubelab:timer-arena", {detail: {enabled: true}}));
  });
  exportCsTimer.addEventListener("click", () => {
    if (session.solves.length === 0) return;
    downloadCsTimerSession(session);
    status.textContent = "Downloaded csTimer-compatible session JSON.";
  });
  importCsTimer.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file) return;
    void file.text().then((source) => {
      const imported = importCsTimerSession(source);
      if (!imported.ok) {
        status.textContent = imported.message;
        return;
      }
      session = {...session, solves: [...session.solves, ...imported.solves]};
      persist();
      render();
      status.textContent = `Imported ${imported.solves.length} csTimer solve${imported.solves.length === 1 ? "" : "s"}.`;
    }).catch(() => {
      status.textContent = "Could not read the selected csTimer file.";
    });
  });
  window.addEventListener("cubelab:controller-turn", ((event: CustomEvent<{move: string; atMs: number}>) => {
    if (panel.hidden) return;
    if (state.phase === "inspection") state = startInspectionTimer(state, event.detail.atMs);
    if (state.phase !== "running" || state.solveStartedAt === null) return;
    const elapsedMs = Math.max(0, event.detail.atMs - state.solveStartedAt);
    recordedMoves = recordedMoves
      ? {...recordedMoves, moves: [...recordedMoves.moves, {move: event.detail.move, elapsedMs}]}
      : {puzzle: "333", moves: [{move: event.detail.move, elapsedMs}]};
    render();
    publishPhase();
    schedule();
  }) as EventListener);
  window.addEventListener("cubelab:controller-solved", () => {
    if (panel.hidden || state.phase !== "running") return;
    const completed = stopTimer(state, performance.now(), newId(), currentScramble);
    state = completed.state;
    if (completed.solve) {
      saveSolve(completed.solve);
    }
    render();
    publishPhase();
  });
  solves.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    const update = (id: string, change: Partial<SolveRecord>) => {
      session = {...session, solves: session.solves.map((solve) => solve.id === id ? {...solve, ...change} : solve)};
    };
    if (button.dataset.timerPenalty) update(button.dataset.timerPenalty, {penalty: "+2"});
    if (button.dataset.timerDnf) update(button.dataset.timerDnf, {penalty: "DNF"});
    if (button.dataset.timerDelete) session = {...session, solves: session.solves.filter((solve) => solve.id !== button.dataset.timerDelete)};
    if (button.dataset.timerReplay) {
      const solve = session.solves.find((candidate) => candidate.id === button.dataset.timerReplay);
      if (solve?.reconstruction) {
        window.dispatchEvent(new CustomEvent("cubelab:timer-replay", {
          detail: {
            scramble: solve.scramble,
            moves: reconstructionReplayNotation(solve.reconstruction.moves),
          },
        }));
      }
      return;
    }
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
  void assignNextScramble();
};
