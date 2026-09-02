import {describe, expect, test} from "bun:test";
import type {
  SmartCubeConnection as TransportConnection,
  SmartCubeEvent as TransportEvent,
} from "smartcube-web-bluetooth";

import {
  createSmartCubeManager,
  normalizeTransportEvent,
} from "../../../src/client/smart-cube/bluetooth";

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
    const normalized = normalizeTransportEvent({
      type: "GYRO",
      timestamp: 20,
      // smartcube-web-bluetooth currently emits wire (x,y,z) as (x,-z,-y).
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
