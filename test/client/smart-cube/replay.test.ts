import {describe, expect, test, vi} from "vitest";

import fixture from "../../fixtures/smart-cube/gocube-yxz-sample.json";
import {replayTape} from "../../helpers/replay-tape";
import {
  createReplaySmartCubeManager,
  createMockDeviceManager,
  createSmartCubeTapeRecorder,
  loadReplayTape,
  replayTapeNameFromSearch,
  validateSmartCubeTape,
  type SmartCubeTape,
} from "../../../src/client/smart-cube/replay";

const tape: SmartCubeTape = {
  schema: "cubelab-smart-cube-tape-v1",
  profile: "full",
  capturedAt: "2026-09-08T10:07:00.000Z",
  note: "small replay fixture",
  header: {
    device: {
      name: "GoCube_A1B2",
      macAddress: null,
      brand: "gocube",
      brandName: "GoCube",
      protocolId: "gocube",
      protocolName: "GoCube / Rubik's Connected",
      capabilities: {orientation: true, battery: true, facelets: true, hardware: true, reset: true, led: false},
    },
    syncMode: "PhysicalMirror",
    orientationTracking: true,
    recording: false,
    route: null,
    inputHash: "",
    settings: {autoOrbit: false, regripThresholdDegrees: 65},
  },
  events: [
    {offsetMs: 0, event: {type: "hardware", timestamp: 10, orientationSupported: true}},
    {offsetMs: 12, event: {type: "battery", timestamp: 22, level: 87}},
    {offsetMs: 40, event: {type: "move", timestamp: 50, move: "R", face: 1, direction: 0, localTimestamp: 40, cubeTimestamp: 40}},
  ],
  commands: [
    {offsetMs: 5, command: {type: "REQUEST_HARDWARE", timestamp: 15}},
  ],
  timeline: [
    {offsetMs: 0, kind: "input", event: {type: "hardware", timestamp: 10, orientationSupported: true}},
    {offsetMs: 5, kind: "command", command: {type: "REQUEST_HARDWARE", timestamp: 15}},
    {offsetMs: 12, kind: "input", event: {type: "battery", timestamp: 22, level: 87}},
    {offsetMs: 40, kind: "input", event: {type: "move", timestamp: 50, move: "R", face: 1, direction: 0, localTimestamp: 40, cubeTimestamp: 40}},
  ],
};
const inputs = tape.timeline.filter((entry): entry is Extract<typeof entry, {kind: "input"}> => entry.kind === "input");
const commands = tape.timeline.filter((entry): entry is Extract<typeof entry, {kind: "command"}> => entry.kind === "command");

describe("smart-cube replay tape", () => {
  test("accepts the profiled timeline format and replays input entries only", async () => {
    const profiled = validateSmartCubeTape({
      ...tape,
      profile: "diagnostic",
      timeline: [
        {offsetMs: 0, kind: "input", event: inputs[0]!.event},
        {offsetMs: 3, kind: "derived", trigger: "virtual-regrip", in: {}, out: {notationTokens: ["y"]}},
        {offsetMs: 5, kind: "command", command: commands[0]!.command},
      ],
    });
    expect(profiled.profile).toBe("diagnostic");
    expect(profiled.timeline.filter((entry) => entry.kind === "input")).toHaveLength(1);
    const manager = createReplaySmartCubeManager(profiled);
    const received: string[] = [];
    manager.subscribeEvents((event) => received.push(event.type));
    await manager.connect();
    manager.step();
    expect(received).toEqual(["hardware"]);
  });

  test("rejects the retired events-and-commands tape shape", () => {
    expect(() => validateSmartCubeTape({
      schema: "cubelab-smart-cube-tape-v1",
      capturedAt: tape.capturedAt,
      header: tape.header,
      events: [],
      commands: [],
    })).toThrow("profile is required");
  });

  test("records normalized events and commands against one monotonic clock", () => {
    let now = 100;
    const recorder = createSmartCubeTapeRecorder(tape.header, () => now, () => "2026-09-08T10:07:00.000Z");
    recorder.recordEvent(inputs[0]!.event);
    now = 117.6;
    recorder.recordCommand(commands[0]!.command);
    now = 141.2;
    recorder.recordEvent(inputs[2]!.event);

    expect(recorder.finish("replay regression")).toMatchObject({
      schema: "cubelab-smart-cube-tape-v1",
      note: "replay regression",
      timeline: [{offsetMs: 0, kind: "input"}, {offsetMs: 18, kind: "command"}, {offsetMs: 41, kind: "input"}],
    });
  });

  test("mock manager opens a picker instead of touching Bluetooth and delegates replay controls", async () => {
    const pickTape = vi.fn(async () => tape);
    const manager = createMockDeviceManager({catalogue: [{name: "sample", tape}], pickTape});
    const received: string[] = [];
    manager.subscribeEvents((event) => received.push(event.type));

    await manager.connect();
    expect(pickTape).toHaveBeenCalledOnce();
    expect(manager.getState()).toMatchObject({phase: "connected", device: tape.header.device});
    manager.step();
    expect(received).toEqual(["hardware"]);
  });

  test("only enables a named replay behind the explicit dev flag", () => {
    expect(replayTapeNameFromSearch("?replay=gocube-yxz-sample")).toBeNull();
    expect(replayTapeNameFromSearch("?dev&replay=gocube-yxz-sample")).toBe("gocube-yxz-sample");
    expect(replayTapeNameFromSearch("?dev&replay=../../secrets")).toBeNull();
  });

  test("loads a dev replay from local storage before its scratch fallback", async () => {
    const stored = JSON.stringify(fixture);
    const fetchTape = vi.fn();
    await expect(loadReplayTape("gocube-yxz-sample", {
      storage: {getItem: () => stored},
      fetchTape,
    })).resolves.toMatchObject({schema: "cubelab-smart-cube-tape-v1"});
    expect(fetchTape).not.toHaveBeenCalled();
  });

  test("the fixture helper advances the same normalized stream synchronously", () => {
    const received: string[] = [];
    const session = replayTape(fixture, (event) => received.push(event.type));

    session.runTo(12);
    expect(received).toEqual(["hardware", "battery"]);
    session.seek(0);
    session.step();
    expect(received).toEqual(["hardware", "battery", "hardware", "battery"]);
    session.runToEnd();
    expect(received.at(-1)).toBe("move");
  });

  test("validates a complete tape and rejects a clock that moves backwards", () => {
    expect(validateSmartCubeTape(tape)).toEqual(tape);
    expect(() => validateSmartCubeTape({...tape, timeline: [tape.timeline[2], tape.timeline[0]]}))
      .toThrow("timeline offsets must be non-decreasing");
  });

  test("plays normalized events on their relative clock and supports pause, seek, and step", async () => {
    vi.useFakeTimers();
    const manager = createReplaySmartCubeManager(tape);
    const received: string[] = [];
    const resets: number[] = [];
    manager.subscribeEvents((event) => received.push(event.type));
    manager.subscribeReplayReset(() => resets.push(1));

    await manager.connect();
    expect(manager.getState()).toMatchObject({phase: "connected", device: tape.header.device});
    expect(manager.getReplayState()).toMatchObject({status: "paused", offsetMs: 0, eventIndex: 0});

    manager.play();
    await vi.advanceTimersByTimeAsync(12);
    expect(received).toEqual(["hardware", "battery"]);
    expect(manager.getReplayState()).toMatchObject({status: "playing", offsetMs: 12, eventIndex: 2});

    manager.pause();
    manager.seek(0);
    expect(resets).toEqual([1]);
    expect(received).toEqual(["hardware", "battery", "hardware"]);
    expect(manager.getReplayState()).toMatchObject({status: "paused", offsetMs: 0, eventIndex: 1});

    manager.step();
    expect(received).toEqual(["hardware", "battery", "hardware", "battery"]);
    expect(manager.getReplayState()).toMatchObject({status: "paused", offsetMs: 12, eventIndex: 2});
    vi.useRealTimers();
  });

  test("records outbound replay commands without performing I/O", async () => {
    const manager = createReplaySmartCubeManager(tape);
    await manager.connect();
    await manager.refresh();
    await manager.resetCubeState();

    expect(manager.getIssuedCommands().map(({type}) => type)).toEqual([
      "REQUEST_HARDWARE",
      "REQUEST_BATTERY",
      "REQUEST_FACELETS",
      "REQUEST_RESET",
    ]);
  });
});
