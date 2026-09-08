import {describe, expect, test, vi} from "vitest";

import fixture from "../../fixtures/smart-cube/gocube-yxz-sample.json";
import {replayTape} from "../../helpers/replay-tape";
import {
  createReplaySmartCubeManager,
  loadReplayTape,
  replayTapeNameFromSearch,
  validateSmartCubeTape,
  type SmartCubeTape,
} from "../../../src/client/smart-cube/replay";

const tape: SmartCubeTape = {
  schema: "cubelab-smart-cube-tape-v1",
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
};

describe("smart-cube replay tape", () => {
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
    expect(() => validateSmartCubeTape({...tape, events: [tape.events[1], tape.events[0]]}))
      .toThrow("events offsets must be non-decreasing");
  });

  test("plays normalized events on their relative clock and supports pause, seek, and step", async () => {
    vi.useFakeTimers();
    const manager = createReplaySmartCubeManager(tape);
    const received: string[] = [];
    manager.subscribeEvents((event) => received.push(event.type));

    await manager.connect();
    expect(manager.getState()).toMatchObject({phase: "connected", device: tape.header.device});
    expect(manager.getReplayState()).toMatchObject({status: "paused", offsetMs: 0, eventIndex: 0});

    manager.play();
    await vi.advanceTimersByTimeAsync(12);
    expect(received).toEqual(["hardware", "battery"]);
    expect(manager.getReplayState()).toMatchObject({status: "playing", offsetMs: 12, eventIndex: 2});

    manager.pause();
    manager.seek(0);
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
