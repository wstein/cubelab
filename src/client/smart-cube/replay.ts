import type {
  SmartCubeCommand,
  SmartCubeConnectOptions,
  SmartCubeConnectionState,
  SmartCubeDevice,
  SmartCubeEvent,
  SmartCubeManager,
} from "./types";

export const SMART_CUBE_TAPE_SCHEMA = "cubelab-smart-cube-tape-v1" as const;
const replayNamePattern = /^[a-z0-9][a-z0-9_-]*$/i;

export type SmartCubeTapeHeader = {
  device: SmartCubeDevice;
  syncMode: "PhysicalMirror" | "VirtualController";
  orientationTracking: boolean;
  recording: boolean;
  route: string | null;
  inputHash: string;
  settings: {
    autoOrbit: boolean;
    regripThresholdDegrees: number;
  };
};

export type SmartCubeTapeTimelineEntry =
  | ({offsetMs: number; kind: "input"} & {event: SmartCubeEvent})
  | ({offsetMs: number; kind: "command"} & {command: SmartCubeCommand})
  | {offsetMs: number; kind: "derived"; trigger: string; in: Record<string, unknown>; out: Record<string, unknown>}
  | {offsetMs: number; kind: "state"; field: string; value: unknown};

export type SmartCubeTape = {
  schema: typeof SMART_CUBE_TAPE_SCHEMA;
  profile: "full" | "diagnostic";
  capturedAt: string;
  note?: string;
  header: SmartCubeTapeHeader;
  timeline: SmartCubeTapeTimelineEntry[];
};

export type ReplayTapeLoaderDependencies = {
  storage?: Pick<Storage, "getItem">;
  /** Injected by tests; production fetches the dev-only scratch tape URL. */
  fetchTape?: (name: string) => Promise<unknown>;
};

export type SmartCubeTapeRecorder = {
  recordEvent: (event: SmartCubeEvent) => void;
  recordCommand: (command: SmartCubeCommand) => void;
  recordDerived: (trigger: string, input: Record<string, unknown>, output: Record<string, unknown>) => void;
  finish: (note?: string) => SmartCubeTape;
};

export const replayTapeStorageKey = (name: string): string => `cubelab.smartCube.tape.${name}`;

/** Returns a safe replay name only when the explicitly opt-in dev flag is set. */
export const replayTapeNameFromSearch = (search: string): string | null => {
  const params = new URLSearchParams(search);
  const name = params.get("replay");
  return params.has("dev") && name !== null && replayNamePattern.test(name) ? name : null;
};

export type ReplayStatus = "playing" | "paused";

export type ReplayState = {
  status: ReplayStatus;
  offsetMs: number;
  /** The index of the next event to emit. */
  eventIndex: number;
  rate: number;
  durationMs: number;
};

export type ReplaySmartCubeManager = SmartCubeManager & {
  getReplayState: () => ReplayState;
  play: () => void;
  pause: () => void;
  seek: (offsetMs: number) => void;
  step: () => void;
  setRate: (rate: number) => void;
  /** Fires before a backwards seek replays inputs from offset zero. */
  subscribeReplayReset: (listener: () => void) => () => void;
  getIssuedCommands: () => readonly SmartCubeCommand[];
};

export type MockTapeCatalogueEntry = {name: string; tape: SmartCubeTape};
export type MockDeviceManagerOptions = {
  catalogue: readonly MockTapeCatalogueEntry[];
  pickTape: (catalogue: readonly MockTapeCatalogueEntry[]) => Promise<SmartCubeTape>;
};
export type MockDeviceManager = ReplaySmartCubeManager & {getSelectedTape: () => SmartCubeTape | null};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(`Invalid smart-cube tape: ${message}`);
};

const validateEvent = (value: unknown, path: string): asserts value is SmartCubeEvent => {
  assert(isRecord(value), `${path} must be an object`);
  assert(typeof value.type === "string", `${path}.type must be a string`);
  assert(isFiniteNumber(value.timestamp), `${path}.timestamp must be a finite number`);
  switch (value.type) {
    case "move":
      assert(typeof value.move === "string" && isFiniteNumber(value.face) && isFiniteNumber(value.direction), `${path} must be a normalized move`);
      assert(value.localTimestamp === null || isFiniteNumber(value.localTimestamp), `${path}.localTimestamp must be number or null`);
      assert(value.cubeTimestamp === null || isFiniteNumber(value.cubeTimestamp), `${path}.cubeTimestamp must be number or null`);
      return;
    case "orientation": {
      assert(isRecord(value.quaternion), `${path}.quaternion must be an object`);
      for (const key of ["x", "y", "z", "w"] as const) assert(isFiniteNumber(value.quaternion[key]), `${path}.quaternion.${key} must be a finite number`);
      assert(typeof value.coordinateFrame === "string", `${path}.coordinateFrame must be a string`);
      return;
    }
    case "battery":
      assert(isFiniteNumber(value.level), `${path}.level must be a finite number`);
      return;
    case "facelets":
      assert(typeof value.facelets === "string", `${path}.facelets must be a string`);
      return;
    case "hardware":
    case "disconnected":
      return;
    default:
      throw new Error(`Invalid smart-cube tape: ${path}.type is unsupported`);
  }
};

const validateCommand = (value: unknown, path: string): asserts value is SmartCubeCommand => {
  assert(isRecord(value), `${path} must be an object`);
  assert(isFiniteNumber(value.timestamp), `${path}.timestamp must be a finite number`);
  assert(
    value.type === "REQUEST_HARDWARE" || value.type === "REQUEST_BATTERY" || value.type === "REQUEST_FACELETS"
      || value.type === "REQUEST_RESET" || value.type === "FLASH_LED",
    `${path}.type is unsupported`,
  );
};

/** Validates untrusted JSON before it is allowed to drive a replay session. */
export const validateSmartCubeTape = (value: unknown): SmartCubeTape => {
  assert(isRecord(value), "tape must be an object");
  assert(value.schema === SMART_CUBE_TAPE_SCHEMA, `schema must be ${SMART_CUBE_TAPE_SCHEMA}`);
  assert(typeof value.capturedAt === "string", "capturedAt must be a string");
  assert(isRecord(value.header), "header must be an object");
  assert(isRecord(value.header.device), "header.device must be an object");
  assert(typeof value.header.device.name === "string", "header.device.name must be a string");
  assert(typeof value.header.device.brand === "string", "header.device.brand must be a string");
  assert(isRecord(value.header.device.capabilities), "header.device.capabilities must be an object");
  assert(value.header.syncMode === "PhysicalMirror" || value.header.syncMode === "VirtualController", "header.syncMode is unsupported");
  assert(typeof value.header.orientationTracking === "boolean" && typeof value.header.recording === "boolean", "header tracking fields must be boolean");
  assert(isRecord(value.header.settings) && typeof value.header.settings.autoOrbit === "boolean" && isFiniteNumber(value.header.settings.regripThresholdDegrees), "header.settings is invalid");
  assert(value.profile === "full" || value.profile === "diagnostic", "profile is required and must be full or diagnostic");
  const profile = value.profile;
  if (Array.isArray(value.timeline)) {
    const timeline: SmartCubeTapeTimelineEntry[] = [];
    let previous = -Infinity;
    value.timeline.forEach((entry, index) => {
      assert(isRecord(entry), `timeline[${index}] must be an object`);
      assert(isFiniteNumber(entry.offsetMs) && entry.offsetMs >= 0 && entry.offsetMs >= previous, "timeline offsets must be non-decreasing");
      previous = entry.offsetMs;
      if (entry.kind === "input") {
        validateEvent(entry.event, `timeline[${index}].event`);
        const normalized = {offsetMs: entry.offsetMs, kind: "input" as const, event: entry.event};
        timeline.push(normalized);
      } else if (entry.kind === "command") {
        validateCommand(entry.command, `timeline[${index}].command`);
        const normalized = {offsetMs: entry.offsetMs, kind: "command" as const, command: entry.command};
        timeline.push(normalized);
      } else if (entry.kind === "derived") {
        assert(typeof entry.trigger === "string" && isRecord(entry.in) && isRecord(entry.out), `timeline[${index}] derived entry is invalid`);
        timeline.push({offsetMs: entry.offsetMs, kind: "derived", trigger: entry.trigger, in: entry.in, out: entry.out});
      } else if (entry.kind === "state") {
        assert(typeof entry.field === "string", `timeline[${index}] state entry is invalid`);
        timeline.push({offsetMs: entry.offsetMs, kind: "state", field: entry.field, value: entry.value});
      } else throw new Error(`Invalid smart-cube tape: timeline[${index}].kind is unsupported`);
    });
    return {...value, profile, timeline} as unknown as SmartCubeTape;
  }
  throw new Error("Invalid smart-cube tape: timeline must be an array");
};

/** Loads a validated tape from the capture cache, then the bundled QA catalogue. */
export const loadReplayTape = async (
  name: string,
  dependencies: ReplayTapeLoaderDependencies = {},
): Promise<SmartCubeTape> => {
  if (!replayNamePattern.test(name)) throw new Error("Invalid replay tape name");
  const storage = dependencies.storage ?? window.localStorage;
  const stored = storage.getItem(replayTapeStorageKey(name));
  if (stored !== null) return validateSmartCubeTape(JSON.parse(stored));
  if (dependencies.fetchTape) return validateSmartCubeTape(await dependencies.fetchTape(name));
  const response = await fetch(`/smart-cube/tapes/${encodeURIComponent(name)}.json`);
  if (!response.ok) throw new Error(`Replay tape ${name} could not be loaded (${response.status})`);
  return validateSmartCubeTape(await response.json());
};

/** Captures the exact normalized manager stream without using wall-clock event timestamps. */
export const createSmartCubeTapeRecorder = (
  header: SmartCubeTapeHeader,
  now: () => number = () => performance.now(),
  capturedAt: () => string = () => new Date().toISOString(),
): SmartCubeTapeRecorder => {
  const origin = now();
  let previousOffsetMs = 0;
  const offsetMs = () => {
    previousOffsetMs = Math.max(previousOffsetMs, Math.round(now() - origin));
    return previousOffsetMs;
  };
  const timeline: SmartCubeTapeTimelineEntry[] = [];
  return {
    recordEvent: (event) => timeline.push({offsetMs: offsetMs(), kind: "input", event}),
    recordCommand: (command) => timeline.push({offsetMs: offsetMs(), kind: "command", command}),
    recordDerived: (trigger, input, output) => timeline.push({offsetMs: offsetMs(), kind: "derived", trigger, in: input, out: output}),
    finish: (note) => ({
      schema: SMART_CUBE_TAPE_SCHEMA,
      profile: "full",
      capturedAt: capturedAt(),
      ...(note ? {note} : {}),
      header,
      timeline: [...timeline],
    }),
  };
};

const disconnectedState = (): SmartCubeConnectionState => ({
  phase: "disconnected",
  message: "Replay ready",
  device: null,
  error: null,
});

const inputEntries = (tape: SmartCubeTape): Array<{offsetMs: number; event: SmartCubeEvent}> =>
  tape.timeline.flatMap((entry) => entry.kind === "input" ? [{offsetMs: entry.offsetMs, event: entry.event}] : []);

/**
 * An in-memory SmartCubeManager backed by a validated capture tape. It has no
 * Bluetooth or other I/O, so its event timing is reproducible in both the app
 * and fake-timer tests.
 */
export const createReplaySmartCubeManager = (source: SmartCubeTape | unknown): ReplaySmartCubeManager => {
  const tape = validateSmartCubeTape(source);
  const inputs = inputEntries(tape);
  const durationMs = inputs.at(-1)?.offsetMs ?? 0;
  let state = disconnectedState();
  let status: ReplayStatus = "paused";
  let offsetMs = 0;
  let eventIndex = 0;
  let rate = 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const issuedCommands: SmartCubeCommand[] = [];
  const stateListeners = new Set<(state: SmartCubeConnectionState) => void>();
  const eventListeners = new Set<(event: SmartCubeEvent) => void>();
  const commandListeners = new Set<(command: SmartCubeCommand) => void>();
  const replayResetListeners = new Set<() => void>();

  const publishState = (next: SmartCubeConnectionState) => {
    state = next;
    stateListeners.forEach((listener) => listener(state));
  };
  const publishEvent = (event: SmartCubeEvent) => eventListeners.forEach((listener) => listener(event));
  const requireConnection = () => {
    if (state.phase !== "connected") throw new Error("No smart cube is connected");
  };
  const issue = (command: Omit<SmartCubeCommand, "timestamp">) => {
    const issued = {timestamp: Date.now(), ...command} as SmartCubeCommand;
    issuedCommands.push(issued);
    commandListeners.forEach((listener) => listener(issued));
  };
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const emitNext = () => {
    const entry = inputs[eventIndex];
    if (!entry) return false;
    eventIndex += 1;
    offsetMs = entry.offsetMs;
    publishEvent(entry.event);
    return true;
  };
  const scheduleNext = (): void => {
    clearTimer();
    if (status !== "playing" || eventIndex >= inputs.length) {
      if (eventIndex >= inputs.length) status = "paused";
      return;
    }
    const entry = inputs[eventIndex];
    timer = setTimeout(() => {
      timer = null;
      if (status !== "playing") return;
      emitNext();
      scheduleNext();
    }, Math.max(0, (entry.offsetMs - offsetMs) / rate));
  };
  const replayTo = (targetOffsetMs: number) => {
    while (eventIndex < inputs.length && inputs[eventIndex].offsetMs <= targetOffsetMs) emitNext();
    offsetMs = Math.min(targetOffsetMs, durationMs);
  };

  return {
    getState: () => state,
    connect: async (_options?: SmartCubeConnectOptions) => {
      const device = tape.header.device;
      publishState({phase: "connected", message: `${device.name} replay connected`, device, error: null});
      return device;
    },
    reconnect: async () => {
      const device = tape.header.device;
      publishState({phase: "connected", message: `${device.name} replay connected`, device, error: null});
      return device;
    },
    disconnect: async () => {
      clearTimer();
      status = "paused";
      if (state.phase === "connected") publishEvent({type: "disconnected", timestamp: Date.now()});
      publishState(disconnectedState());
    },
    refresh: async () => {
      requireConnection();
      const capabilities = tape.header.device.capabilities;
      if (capabilities.hardware) issue({type: "REQUEST_HARDWARE"});
      if (capabilities.battery) issue({type: "REQUEST_BATTERY"});
      if (capabilities.facelets) issue({type: "REQUEST_FACELETS"});
    },
    resetCubeState: async () => {
      requireConnection();
      if (!tape.header.device.capabilities.reset) throw new Error(`${tape.header.device.name} does not support remote state reset`);
      issue({type: "REQUEST_RESET"});
    },
    flashLed: async (colour, durationMs) => {
      requireConnection();
      if (!tape.header.device.capabilities.led) throw new Error(`${tape.header.device.name} does not expose verified LED control`);
      issue({type: "FLASH_LED", colour, durationMs: Math.max(50, Math.min(5000, Math.round(durationMs)))});
    },
    subscribeState(listener) {
      stateListeners.add(listener);
      listener(state);
      return () => stateListeners.delete(listener);
    },
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    subscribeCommands(listener) {
      commandListeners.add(listener);
      return () => commandListeners.delete(listener);
    },
    getReplayState: () => ({status, offsetMs, eventIndex, rate, durationMs}),
    play: () => {
      if (state.phase !== "connected") throw new Error("Replay smart cube is not connected");
      status = "playing";
      scheduleNext();
    },
    pause: () => {
      status = "paused";
      clearTimer();
    },
    seek: (nextOffsetMs) => {
      const target = Math.max(0, Math.min(durationMs, Math.round(nextOffsetMs)));
      status = "paused";
      clearTimer();
      if (target < offsetMs) {
        replayResetListeners.forEach((listener) => listener());
        eventIndex = 0;
        offsetMs = 0;
      }
      replayTo(target);
    },
    step: () => {
      status = "paused";
      clearTimer();
      emitNext();
    },
    setRate: (nextRate) => {
      if (!Number.isFinite(nextRate) || nextRate < 0.25 || nextRate > 4) throw new Error("Replay rate must be between 0.25 and 4");
      rate = nextRate;
      if (status === "playing") scheduleNext();
    },
    subscribeReplayReset(listener) {
      replayResetListeners.add(listener);
      return () => replayResetListeners.delete(listener);
    },
    getIssuedCommands: () => issuedCommands,
  };
};

/**
 * A picker-backed manager for the mock page. It deliberately owns no Bluetooth
 * code: choosing a tape is its equivalent of the platform device chooser.
 */
export const createMockDeviceManager = ({catalogue, pickTape}: MockDeviceManagerOptions): MockDeviceManager => {
  let state = disconnectedState();
  let inner: ReplaySmartCubeManager | null = null;
  let selectedTape: SmartCubeTape | null = null;
  const stateListeners = new Set<(state: SmartCubeConnectionState) => void>();
  const eventListeners = new Set<(event: SmartCubeEvent) => void>();
  const commandListeners = new Set<(command: SmartCubeCommand) => void>();
  const publishState = (next: SmartCubeConnectionState) => {
    state = next;
    stateListeners.forEach((listener) => listener(state));
  };
  const requireInner = () => {
    if (!inner) throw new Error("No mock tape is selected");
    return inner;
  };
  const connect = async (): Promise<SmartCubeDevice> => {
    // Stop the prior clock without emitting its synthetic disconnect into the
    // shared downstream pipeline while a new tape is being selected.
    if (inner) inner.pause();
    const tape = validateSmartCubeTape(await pickTape(catalogue));
    selectedTape = tape;
    const replay = createReplaySmartCubeManager(tape);
    inner = replay;
    replay.subscribeState(publishState);
    replay.subscribeEvents((event) => eventListeners.forEach((listener) => listener(event)));
    replay.subscribeCommands((command) => commandListeners.forEach((listener) => listener(command)));
    return replay.connect();
  };
  return {
    getState: () => state,
    connect: async (_options?: SmartCubeConnectOptions) => connect(),
    reconnect: connect,
    disconnect: async () => {
      if (inner) await inner.disconnect();
      inner = null;
      selectedTape = null;
      if (state.phase !== "disconnected") publishState(disconnectedState());
    },
    refresh: () => requireInner().refresh(),
    resetCubeState: () => requireInner().resetCubeState(),
    flashLed: (colour, durationMs) => requireInner().flashLed(colour, durationMs),
    subscribeState(listener) {
      stateListeners.add(listener);
      listener(state);
      return () => stateListeners.delete(listener);
    },
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    subscribeCommands(listener) {
      commandListeners.add(listener);
      return () => commandListeners.delete(listener);
    },
    getReplayState: () => requireInner().getReplayState(),
    play: () => requireInner().play(),
    pause: () => requireInner().pause(),
    seek: (offsetMs) => requireInner().seek(offsetMs),
    step: () => requireInner().step(),
    setRate: (rate) => requireInner().setRate(rate),
    subscribeReplayReset(listener) {
      let unsubscribe = () => {};
      const attach = () => {
        unsubscribe();
        if (inner) unsubscribe = inner.subscribeReplayReset(listener);
      };
      // A newly selected inner replay must keep the same downstream reset hook.
      const stateUnsubscribe = this.subscribeState((next) => {
        if (next.phase === "connected") attach();
      });
      return () => { unsubscribe(); stateUnsubscribe(); };
    },
    getIssuedCommands: () => inner?.getIssuedCommands() ?? [],
    getSelectedTape: () => selectedTape,
  };
};
