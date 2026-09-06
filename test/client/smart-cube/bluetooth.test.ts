import {describe, expect, test} from "vitest";
import type {
  SmartCubeConnection as TransportConnection,
  SmartCubeEvent as TransportEvent,
} from "smartcube-web-bluetooth";

import {
  createSmartCubeManager,
  normalizeTransportEvent,
} from "../../../src/client/smart-cube/bluetooth";
import {
  assessGyroRotation,
  detectGyroQuarterRotation,
} from "../../../src/client/smart-cube/orientation-verifier";
import {
  orientationInViewportFrame,
  deviceOrientationDelta,
} from "../../../src/client/cube-gl";

const solved = "U".repeat(9) + "R".repeat(9) + "F".repeat(9)
  + "D".repeat(9) + "L".repeat(9) + "B".repeat(9);

describe("smart cube event normalization", () => {
  test("normalizes all transport event families", () => {
    expect(normalizeTransportEvent({
      type: "MOVE",
      timestamp: 12,
      move: "R'",
      face: 1,
      direction: 1,
      localTimestamp: 11,
      cubeTimestamp: 10,
    })).toMatchObject({type: "move", move: "R'", timestamp: 12});
    expect(normalizeTransportEvent({
      type: "GYRO",
      timestamp: 20,
      quaternion: {x: 0, y: 0, z: 0, w: 1},
      velocity: {x: 1, y: 2, z: 3},
    })).toMatchObject({type: "orientation", angularVelocity: {x: 1, y: 2, z: 3}});
    expect(normalizeTransportEvent({type: "BATTERY", timestamp: 30, batteryLevel: 104}))
      .toEqual({type: "battery", timestamp: 30, level: 100});
    expect(normalizeTransportEvent({type: "FACELETS", timestamp: 40, facelets: solved}))
      .toEqual({type: "facelets", timestamp: 40, facelets: solved});
    expect(normalizeTransportEvent({
      type: "HARDWARE",
      timestamp: 50,
      hardwareName: "GAN12ui",
      gyroSupported: true,
    })).toMatchObject({type: "hardware", hardwareName: "GAN12ui", orientationSupported: true});
    expect(normalizeTransportEvent({type: "DISCONNECT", timestamp: 60}))
      .toEqual({type: "disconnected", timestamp: 60});
  });

  test("drops malformed moves, facelets, and quaternions", () => {
    expect(normalizeTransportEvent({
      type: "MOVE",
      timestamp: 1,
      move: "x",
      face: 0,
      direction: 0,
      localTimestamp: null,
      cubeTimestamp: null,
    })).toBeNull();
    expect(normalizeTransportEvent({type: "FACELETS", timestamp: 1, facelets: "U".repeat(54)}))
      .toBeNull();
    expect(normalizeTransportEvent({
      type: "GYRO",
      timestamp: 1,
      quaternion: {x: Number.NaN, y: 0, z: 0, w: 1},
    })).toBeNull();
  });

  test("restores GoCube wire axes before viewport-relative calibration", () => {
    // smartcube-web-bluetooth's GoCube parser remaps wire (rx, ry, rz, rw)
    // to (nx, -nz, -ny, nw). normalizeTransportEvent reverses this swap
    // (y: -z, z: -y) so downstream code receives canonical wire axes:
    // y = -(-0.2) = 0.2, z = -(-0.3) = 0.3.
    const normalized = normalizeTransportEvent({
      type: "GYRO",
      timestamp: 20,
      quaternion: {x: 0.1, y: -0.3, z: -0.2, w: 0.9},
    }, "gocube");
    expect(normalized).toMatchObject({
      type: "orientation",
      coordinateFrame: "gocube-wire",
      quaternion: {x: 0.1, y: 0.2, z: 0.3, w: 0.9},
    });
  });

  test("tags GAN orientation events with gan-wire coordinate frame", () => {
    const normalized = normalizeTransportEvent({
      type: "GYRO",
      timestamp: 20,
      quaternion: {x: 0.1, y: 0.2, z: 0.3, w: 0.9},
    }, "gan");
    expect(normalized).toMatchObject({
      type: "orientation",
      coordinateFrame: "gan-wire",
      quaternion: {x: 0.1, y: 0.2, z: 0.3, w: 0.9},
    });
  });
});

describe("live cube orientation tracking and wire coordinate regression tests", () => {
  const half = Math.sqrt(0.5);
  const identity = {x: 0, y: 0, z: 0, w: 1};

  // Simulates vendor smartcube-web-bluetooth gocube.ts parser mapping:
  // Wire (rx, ry, rz, rw) -> normalized (nx, ny, nz, nw) -> (nx, -nz, -ny, nw).
  const simulateGoCubeVendorPayload = (rx: number, ry: number, rz: number, rw: number) => {
    const len = Math.hypot(rx, ry, rz, rw);
    const nx = rx / len;
    const ny = ry / len;
    const nz = rz / len;
    const nw = rw / len;
    return {x: nx, y: -nz, z: -ny, w: nw};
  };

  test("verifies GoCube physical rotations correctly identify X, Y, and Z axes", () => {
    // gocube-wire's axis mapping (see deviceOrientationDelta's "gocube-wire"
    // branch): 180° around Y plus inverted sensor rotation direction maps
    // raw (rx, ry, rz) to (rx, -ry, rz). Applied to the true raw values this
    // pipeline's un-swap restores, wire X/Y/Z each map straight onto viewport X/Y/Z.

    // 1. Identity base
    const idTransport = simulateGoCubeVendorPayload(0, 0, 0, 1);
    const baseEvent = normalizeTransportEvent({type: "GYRO", timestamp: 0, quaternion: idTransport}, "gocube");
    expect(baseEvent).not.toBeNull();
    const base = baseEvent!.quaternion;

    // 2. Physical pitch forward (raw wire X-component):
    const xTransport = simulateGoCubeVendorPayload(half, 0, 0, half);
    const xEvent = normalizeTransportEvent({type: "GYRO", timestamp: 10, quaternion: xTransport}, "gocube")!;
    expect(xEvent.coordinateFrame).toBe("gocube-wire");
    const xAssessment = assessGyroRotation(base, xEvent.quaternion, xEvent.coordinateFrame, "X", -1);
    expect(xAssessment.matched).toBe(true);
    expect(xAssessment.axisAlignment).toBeGreaterThanOrEqual(0.99);

    // Viewport mapping for a raw wire X-component: pure rotation around viewport X
    const xViewport = orientationInViewportFrame(xEvent.quaternion, xEvent.coordinateFrame);
    expect(xViewport.x).toBeCloseTo(half);
    expect(xViewport.y).toBeCloseTo(0);
    expect(xViewport.z).toBeCloseTo(0);

    // 3. Physical yaw left (raw wire Y-component):
    // Note: vendor gocube.ts maps (0, -half, 0, half) to (0, 0, half, half)
    const yTransport = simulateGoCubeVendorPayload(0, -half, 0, half);
    expect(yTransport.x).toBeCloseTo(0);
    expect(yTransport.y).toBeCloseTo(0);
    expect(yTransport.z).toBeCloseTo(half);
    expect(yTransport.w).toBeCloseTo(half);
    const yEvent = normalizeTransportEvent({type: "GYRO", timestamp: 20, quaternion: yTransport}, "gocube")!;
    expect(yEvent.coordinateFrame).toBe("gocube-wire");
    // Wire un-swap must restore y: -half, z: 0
    expect(yEvent.quaternion.y).toBeCloseTo(-half);
    expect(yEvent.quaternion.z).toBeCloseTo(0);
    const yAssessment = assessGyroRotation(base, yEvent.quaternion, yEvent.coordinateFrame, "Y", -1);
    expect(yAssessment.matched).toBe(true);
    expect(yAssessment.axisAlignment).toBeGreaterThanOrEqual(0.99);

    // Viewport mapping for a raw wire Y-component: pure rotation around viewport Y
    const yViewport = orientationInViewportFrame(yEvent.quaternion, yEvent.coordinateFrame);
    expect(yViewport.x).toBeCloseTo(0);
    expect(yViewport.y).toBeCloseTo(half);
    expect(yViewport.z).toBeCloseTo(0);

    // 4. Physical roll clockwise (raw wire Z-component):
    // Note: vendor gocube.ts maps (0, 0, half, half) to (0, -half, 0, half)
    const zTransport = simulateGoCubeVendorPayload(0, 0, half, half);
    expect(zTransport.x).toBeCloseTo(0);
    expect(zTransport.y).toBeCloseTo(-half);
    expect(zTransport.z).toBeCloseTo(0);
    expect(zTransport.w).toBeCloseTo(half);
    const zEvent = normalizeTransportEvent({type: "GYRO", timestamp: 30, quaternion: zTransport}, "gocube")!;
    expect(zEvent.coordinateFrame).toBe("gocube-wire");
    // Wire un-swap must restore y: 0, z: half
    expect(zEvent.quaternion.y).toBeCloseTo(0);
    expect(zEvent.quaternion.z).toBeCloseTo(half);
    const zAssessment = assessGyroRotation(base, zEvent.quaternion, zEvent.coordinateFrame, "Z", -1);
    expect(zAssessment.matched).toBe(true);
    expect(zAssessment.axisAlignment).toBeGreaterThanOrEqual(0.99);

    // Viewport mapping for a raw wire Z-component: pure rotation around viewport Z
    const zViewport = orientationInViewportFrame(zEvent.quaternion, zEvent.coordinateFrame);
    expect(zViewport.x).toBeCloseTo(0);
    expect(zViewport.y).toBeCloseTo(0);
    expect(zViewport.z).toBeCloseTo(half);
  });

  test("regression: verifies that omitting the GoCube un-swap gives the wrong axis", () => {
    // If the un-swap was omitted, the raw vendor transport quaternion would be used directly:
    const rawYTransport = simulateGoCubeVendorPayload(0, -half, 0, half);
    // The correct, full-pipeline answer for this physical input is Y (see the
    // test above) — omitting the un-swap must not also give Y.
    const brokenYAssessment = assessGyroRotation(identity, rawYTransport, "gocube-wire", "Y", -1);
    expect(brokenYAssessment.matched).toBe(false);
    // Instead, it erroneously detects as a Z rotation — the vendor swap
    // exchanges wire Y and Z (with a sign flip), so skipping the un-swap
    // feeds gocube-wire's Y-input straight into its Z-slot.
    const detectedFromRawY = detectGyroQuarterRotation(identity, rawYTransport, "gocube-wire");
    expect(detectedFromRawY?.axis).toBe("Z");

    const rawZTransport = simulateGoCubeVendorPayload(0, 0, half, half);
    // The correct, full-pipeline answer for this physical input is Z.
    const brokenZAssessment = assessGyroRotation(identity, rawZTransport, "gocube-wire", "Z", -1);
    expect(brokenZAssessment.matched).toBe(false);
    // Instead, it erroneously detects as a Y rotation (the same Y/Z exchange, reversed).
    const detectedFromRawZ = detectGyroQuarterRotation(identity, rawZTransport, "gocube-wire");
    expect(detectedFromRawZ?.axis).toBe("Y");
  });

  test("verifies relative world orientation delta across multiple GoCube turns", () => {
    // Start at initial position
    const q0 = normalizeTransportEvent({
      type: "GYRO",
      timestamp: 0,
      quaternion: simulateGoCubeVendorPayload(0, 0, 0, 1),
    }, "gocube")!.quaternion;

    // First physical turn: raw wire Y-component, which the gocube-wire
    // mapping resolves straight onto a viewport Y rotation (no permutation
    // — see the test above).
    const q1 = normalizeTransportEvent({
      type: "GYRO",
      timestamp: 10,
      quaternion: simulateGoCubeVendorPayload(0, -half, 0, half),
    }, "gocube")!.quaternion;

    const deltaFirst = deviceOrientationDelta(q0, q1, "gocube-wire", "world");
    const firstCheck = assessGyroRotation(q0, q1, "gocube-wire", "Y", -1, "world");
    expect(firstCheck.matched).toBe(true);
    expect(deltaFirst.y).toBeCloseTo(half);

    // Second physical turn from that state: raw wire X-component, which
    // resolves straight onto a viewport X rotation.
    // In wire frame, combined quaternion: wireX * wireY
    // wireX = {half, 0, 0, half}, wireY = {0, -half, 0, half}
    // Result = {0.5, -0.5, -0.5, 0.5}
    const q2 = normalizeTransportEvent({
      type: "GYRO",
      timestamp: 20,
      quaternion: simulateGoCubeVendorPayload(0.5, -0.5, -0.5, 0.5),
    }, "gocube")!.quaternion;

    const secondCheck = assessGyroRotation(q1, q2, "gocube-wire", "X", -1, "world");
    expect(secondCheck.matched).toBe(true);
  });
});

type Observer = {
  next: (event: TransportEvent) => void;
  error: (error: unknown) => void;
};

const fakeConnection = (overrides: Partial<TransportConnection> = {}) => {
  let observer: Observer | null = null;
  const commands: string[] = [];
  let disconnectCount = 0;
  const connection = {
    deviceName: "GAN12ui",
    deviceMAC: "aa:bb:cc:dd:ee:ff",
    protocol: {id: "gan-gen2", name: "GAN Gen2"},
    capabilities: {gyroscope: true, battery: true, facelets: true, hardware: true, reset: true},
    events$: {
      subscribe(nextObserver: Observer) {
        observer = nextObserver;
        return {unsubscribe: () => { observer = null; }};
      },
    },
    async sendCommand(command: {type: string}) {
      commands.push(command.type);
    },
    async disconnect() {
      disconnectCount += 1;
    },
    ...overrides,
  } as unknown as TransportConnection;
  return {
    connection,
    commands,
    emit: (event: TransportEvent) => observer?.next(event),
    fail: (error: unknown) => observer?.error(error),
    disconnectCount: () => disconnectCount,
  };
};

describe("smart cube connection manager", () => {
  test("reports unavailable browsers before opening a chooser", async () => {
    let calls = 0;
    const manager = createSmartCubeManager({
      isBluetoothAvailable: () => false,
      connectTransport: async () => {
        calls += 1;
        throw new Error("unexpected");
      },
    });
    expect(manager.getState().phase).toBe("unavailable");
    await expect(manager.connect()).rejects.toThrow("supported browser");
    expect(calls).toBe(0);
  });

  test("connects, exposes capabilities, refreshes reports, and normalizes moves", async () => {
    const fake = fakeConnection();
    const statuses: string[] = [];
    const manager = createSmartCubeManager({
      isBluetoothAvailable: () => true,
      connectTransport: async (options) => {
        options?.onStatus?.("Connecting…");
        return fake.connection;
      },
    });
    manager.subscribeState((state) => statuses.push(state.message));
    const events: string[] = [];
    manager.subscribeEvents((event) => events.push(event.type));

    const device = await manager.connect({enableAddressSearch: true});
    expect(device).toMatchObject({brand: "gan", protocolId: "gan-gen2"});
    expect(device.capabilities).toMatchObject({orientation: true, facelets: true, reset: true, led: false});
    expect(manager.getState().phase).toBe("connected");
    expect(statuses).toContain("Connecting…");

    await manager.refresh();
    expect(fake.commands).toEqual(expect.arrayContaining([
      "REQUEST_HARDWARE",
      "REQUEST_BATTERY",
      "REQUEST_FACELETS",
    ]));
    fake.emit({
      type: "MOVE",
      timestamp: 100,
      move: "U2",
      face: 0,
      direction: 2,
      localTimestamp: 99,
      cubeTimestamp: 90,
    });
    expect(events).toContain("move");

    await manager.resetCubeState();
    expect(fake.commands).toContain("REQUEST_RESET");
    await expect(manager.flashLed("amber", 500)).rejects.toThrow("verified LED control");
    await manager.disconnect();
    expect(fake.disconnectCount()).toBe(1);
    expect(manager.getState().phase).toBe("disconnected");
  });

  test("exposes LED feedback only when the transport supplies a verified writer", async () => {
    const flashes: Array<[string, number]> = [];
    const fake = fakeConnection({
      flashLed: async (colour: string, durationMs: number) => {
        flashes.push([colour, durationMs]);
      },
    } as unknown as Partial<TransportConnection>);
    const manager = createSmartCubeManager({
      isBluetoothAvailable: () => true,
      connectTransport: async () => fake.connection,
    });
    const device = await manager.connect();
    expect(device.capabilities.led).toBe(true);
    await manager.flashLed("green", 10_000);
    expect(flashes).toEqual([["green", 5000]]);
  });

  test("clears the active connection after a hardware disconnect", async () => {
    const fake = fakeConnection();
    const manager = createSmartCubeManager({
      isBluetoothAvailable: () => true,
      connectTransport: async () => fake.connection,
    });
    await manager.connect();
    fake.emit({type: "DISCONNECT", timestamp: 500});
    expect(manager.getState().phase).toBe("disconnected");
    await expect(manager.refresh()).rejects.toThrow("No smart cube");
  });

  test("surfaces transport failures without leaving a stale device", async () => {
    const fake = fakeConnection();
    const manager = createSmartCubeManager({
      isBluetoothAvailable: () => true,
      connectTransport: async () => fake.connection,
    });
    await manager.connect();
    fake.fail(new Error("GATT notification failed"));
    expect(manager.getState()).toMatchObject({phase: "error", device: null});
    expect(manager.getState().error?.message).toBe("GATT notification failed");
  });
});
