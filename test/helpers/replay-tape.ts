import {
  validateSmartCubeTape,
  type SmartCubeEvent,
  type SmartCubeTape,
} from "../../src/client/smart-cube";

export type TapeReplaySession = {
  getOffsetMs: () => number;
  getEventIndex: () => number;
  seek: (offsetMs: number) => void;
  step: () => boolean;
  runTo: (offsetMs: number) => void;
  runToEnd: () => void;
};

/**
 * Synchronous counterpart to the live replay manager. Tests supply their real
 * downstream event handler, then drive this helper one tape entry at a time.
 */
export const replayTape = (
  source: SmartCubeTape | unknown,
  onEvent: (event: SmartCubeEvent, offsetMs: number) => void,
): TapeReplaySession => {
  const tape = validateSmartCubeTape(source);
  const durationMs = tape.events.at(-1)?.offsetMs ?? 0;
  let offsetMs = 0;
  let eventIndex = 0;

  const step = (): boolean => {
    const entry = tape.events[eventIndex];
    if (!entry) return false;
    eventIndex += 1;
    offsetMs = entry.offsetMs;
    onEvent(entry.event, offsetMs);
    return true;
  };
  const runTo = (targetOffsetMs: number) => {
    const target = Math.max(0, Math.min(durationMs, Math.round(targetOffsetMs)));
    if (target < offsetMs) {
      eventIndex = 0;
      offsetMs = 0;
    }
    while (eventIndex < tape.events.length && tape.events[eventIndex].offsetMs <= target) step();
    offsetMs = target;
  };

  return {
    getOffsetMs: () => offsetMs,
    getEventIndex: () => eventIndex,
    seek: runTo,
    step,
    runTo,
    runToEnd: () => runTo(durationMs),
  };
};
