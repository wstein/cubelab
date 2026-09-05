/**
 * Opt-in console tracing for the state editor's colour dots.
 *
 * The dot pipeline has three stages that can each look like the others when
 * it misbehaves: the cheap local value painted synchronously, the exact value
 * the worker returns, and the debt bookkeeping that decides whether a sticker
 * gets re-queued after a cancelled pass. A dark tile is the same pixel whether
 * it means "verification never ran", "verification was cancelled" or "this
 * draft genuinely has no completion". This narrates which one it is.
 *
 * Off by default and free when off. Turn it on with either:
 *   localStorage.setItem("cubeRosetta.traceDots", "1")   // persists
 *   ?traceDots=1                                          // one session
 */
import {
  explainManualStateColours,
  manualStateColourBudget,
  type ManualStateDraft,
  type ManualStateFace,
  type ManualStateSize,
} from "./manual-state";

const resolveEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("traceDots") === "1") return true;
    return window.localStorage.getItem("cubeRosetta.traceDots") === "1";
  } catch {
    // Private-mode storage denial must not break the editor.
    return false;
  }
};

const enabled = resolveEnabled();

const stamp = (): string => `${performance.now().toFixed(1)}ms`;

/** Compact facelet string, so a traced draft can be replayed in a test. */
const compact = (draft: ManualStateDraft): string => draft.map((face) => face ?? "-").join("");

export type DotTraceEvent =
  | {type: "render"; index: number; local: ManualStateFace[]; generation: number}
  | {type: "queue"; queued: number; debt: number; generation: number}
  | {type: "verify"; index: number; choices: ManualStateFace[]; generation: number}
  | {type: "promote"; index: number; colour: ManualStateFace; generation: number}
  | {type: "cancel"; from: number; to: number; debt: number}
  | {type: "skip"; index: number; reason: string};

export const dotTrace = {
  enabled,

  log(event: DotTraceEvent): void {
    if (!enabled) return;
    switch (event.type) {
      case "render":
        console.debug(`[Dots ${stamp()}] render idx=${event.index} local=[${event.local.join("") || "∅"}] gen=${event.generation}`);
        return;
      case "queue":
        console.debug(`[Dots ${stamp()}] queued ${event.queued} sticker(s), outstanding debt=${event.debt}, gen=${event.generation}`);
        return;
      case "verify":
        console.debug(`[Dots ${stamp()}] verified idx=${event.index} exact=[${event.choices.join("") || "∅"}] gen=${event.generation}`);
        return;
      case "promote":
        console.debug(`[Dots ${stamp()}] promoted idx=${event.index} -> ${event.colour} (forced) gen=${event.generation}`);
        return;
      case "cancel":
        console.debug(`[Dots ${stamp()}] pass cancelled gen ${event.from} -> ${event.to}, ${event.debt} sticker(s) still unverified`);
        return;
      case "skip":
        console.debug(`[Dots ${stamp()}] skip idx=${event.index} (${event.reason})`);
        return;
    }
  },

  /**
   * A sticker that can take no colour at all. This is the loud one: it means
   * the draft has no legal completion, which the paint gate should have
   * prevented. Prints which sub-check rejected each colour, the colour budget
   * (an exhausted colour that a blank slot still needs is the usual cause),
   * and a replayable draft string.
   */
  deadTile(size: ManualStateSize, draft: ManualStateDraft, index: number, source: string): void {
    if (!enabled) return;
    const face = ["U", "R", "F", "D", "L", "B"][Math.floor(index / (size * size))];
    const local = index % (size * size);
    console.group(`%c[Dots ${stamp()}] DEAD TILE idx=${index} (${face} r${Math.floor(local / size)}c${local % size}) via ${source}`, "color:#ff6b6b;font-weight:bold");
    console.table(explainManualStateColours(size, draft, index));
    console.table(manualStateColourBudget(size, draft));
    const exhausted = manualStateColourBudget(size, draft).filter(({free}) => free === 0);
    if (exhausted.length > 0) {
      console.warn(`Exhausted colour(s): ${exhausted.map(({colour}) => colour).join(", ")} — a blank slot still needing one of these is unsatisfiable.`);
    }
    console.info(`Replay: canCompleteManualState(${size}, "${compact(draft)}".split("").map(c => c === "-" ? null : c))`);
    console.groupEnd();
  },
};
