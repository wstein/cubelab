import {Subject} from "rxjs";
import {describe, expect, test, vi} from "vitest";
import type {
  SmartCubeEvent,
  SmartCubeTransportConnection,
} from "@wstein/regrip-core/bindings/smartCubeTransport";

import {createRegripCoreSession} from "../../../src/client/smart-cube/regrip-core";

const connection = (): {
  connection: SmartCubeTransportConnection;
  events: Subject<SmartCubeEvent>;
  sendCommand: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
} => {
  const events = new Subject<SmartCubeEvent>();
  const sendCommand = vi.fn().mockResolvedValue(undefined);
  const disconnect = vi.fn().mockResolvedValue(undefined);
  return {
    events,
    sendCommand,
    disconnect,
    connection: {
      deviceName: "GANi4_A73F",
      deviceMAC: "00:11:22:33:44:55",
      protocol: {id: "gan-gen4", name: "GAN Gen4"},
      capabilities: {
        gyroscope: true,
        battery: true,
        facelets: true,
        hardware: true,
        reset: true,
        vendorCommands: [],
      },
      events$: events,
      sendCommand,
      disconnect,
    },
  };
};

describe("Regrip core migration seam", () => {
  test("runs a CubeLab-provided GAN/GoCube transport through the core session", async () => {
    const mock = connection();
    const session = createRegripCoreSession({connect: async () => mock.connection});
    const seen: string[] = [];
    session.subscribeEvents((event) => seen.push(event.type));

    await session.connect();

    expect(session.getState()).toMatchObject({
      status: "connected",
      connection: mock.connection,
    });
    expect(mock.sendCommand.mock.calls.map(([command]) => command.type)).toEqual([
      "REQUEST_HARDWARE",
      "REQUEST_FACELETS",
      "REQUEST_BATTERY",
    ]);

    mock.events.next({
      type: "GYRO",
      timestamp: 1,
      quaternion: {x: 0, y: 0, z: 0, w: 1},
    });
    mock.events.next({
      type: "MOVE",
      timestamp: 2,
      move: "R",
      face: 1,
      direction: 0,
      localTimestamp: 2,
      cubeTimestamp: 2,
    });

    expect(seen).toEqual(["GYRO", "MOVE"]);
    expect(session.getState().lastEvent).toMatchObject({type: "MOVE", move: "R"});

    await session.disconnect();
    expect(mock.disconnect).toHaveBeenCalledOnce();
    expect(session.getState().status).toBe("disconnected");
  });
});
