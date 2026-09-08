import type {
  SmartCubeCommand,
  SmartCubeConnectOptions,
  SmartCubeConnectionState,
  SmartCubeDevice,
  SmartCubeEvent,
  SmartCubeManager,
} from "./types";

export const SMART_CUBE_TAPE_SCHEMA = "cubelab-smart-cube-tape-v1" as const;

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

export type SmartCubeTapeEntry = {offsetMs: number; event: SmartCubeEvent};
export type SmartCubeTapeCommand = {offsetMs: number; command: SmartCubeCommand};

export type SmartCubeTape = {
  schema: typeof SMART_CUBE_TAPE_SCHEMA;
  capturedAt: string;
  note?: string;
  header: SmartCubeTapeHeader;
  events: SmartCubeTapeEntry[];
  commands: SmartCubeTapeCommand[];
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
  getIssuedCommands: () => readonly SmartCubeCommand[];
};

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

const validateEntries = <T>(
  entries: unknown,
  name: string,
  validate: (value: unknown, path: string) => asserts value is T,
): asserts entries is Array<{offsetMs: number} & Record<string, unknown>> => {
  assert(Array.isArray(entries), `${name} must be an array`);
  let previous = -Infinity;
  entries.forEach((entry, index) => {
    assert(isRecord(entry), `${name}[${index}] must be an object`);
    assert(isFiniteNumber(entry.offsetMs) && entry.offsetMs >= 0, `${name}[${index}].offsetMs must be a non-negative finite number`);
    assert(entry.offsetMs >= previous, `${name} offsets must be non-decreasing`);
    previous = entry.offsetMs;
    validate(entry[name === "events" ? "event" : "command"], `${name}[${index}].${name === "events" ? "event" : "command"}`);
  });
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
  validateEntries(value.events, "events", validateEvent);
  validateEntries(value.commands, "commands", validateCommand);
  return value as unknown as SmartCubeTape;
};

const disconnectedState = (): SmartCubeConnectionState => ({
  phase: "disconnected",
  message: "Replay ready",
  device: null,
  error: null,
});

/**
 * An in-memory SmartCubeManager backed by a validated capture tape. It has no
 * Bluetooth or other I/O, so its event timing is reproducible in both the app
 * and fake-timer tests.
 */
export const createReplaySmartCubeManager = (source: SmartCubeTape | unknown): ReplaySmartCubeManager => {
  const tape = validateSmartCubeTape(source);
  const durationMs = tape.events.at(-1)?.offsetMs ?? 0;
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
    const entry = tape.events[eventIndex];
    if (!entry) return false;
    eventIndex += 1;
    offsetMs = entry.offsetMs;
    publishEvent(entry.event);
    return true;
  };
  const scheduleNext = (): void => {
    clearTimer();
    if (status !== "playing" || eventIndex >= tape.events.length) {
      if (eventIndex >= tape.events.length) status = "paused";
      return;
    }
    const entry = tape.events[eventIndex];
    timer = setTimeout(() => {
      timer = null;
      if (status !== "playing") return;
      emitNext();
      scheduleNext();
    }, Math.max(0, (entry.offsetMs - offsetMs) / rate));
  };
  const replayTo = (targetOffsetMs: number) => {
    while (eventIndex < tape.events.length && tape.events[eventIndex].offsetMs <= targetOffsetMs) emitNext();
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
    getIssuedCommands: () => issuedCommands,
  };
};
