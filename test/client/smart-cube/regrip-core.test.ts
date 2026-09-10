import {Subject} from "rxjs";
import {describe, expect, test, vi} from "vitest";
import type {
  SmartCubeEvent,
  SmartCubeTransportConnection,
} from "@wstein/regrip-core/bindings/smartCubeTransport";
import * as VirtualCubeFrame from "@wstein/regrip-core/domain/VirtualCubeFrame.res.mjs";
import type {RegripToken} from "@wstein/regrip-core/domain/CubeNotation.res.mjs";
import type {SmartCubeSessionEvent} from "@wstein/regrip-core/session/smartCubeSession";

import {
  createRegripCoreManager,
  createRegripCoreSession,
  coreBodyOrientationInViewportFrame,
  normalizeCoreEvent,
} from "../../../src/client/smart-cube/regrip-core";

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
  test("maps core body X/Z pose directions into CubeLab's viewport basis", () => {
    const half = Math.sqrt(0.5);
    expect(coreBodyOrientationInViewportFrame({x: half, y: 0, z: 0, w: half}))
      .toEqual({x: -half, y: 0, z: 0, w: half});
    expect(coreBodyOrientationInViewportFrame({x: 0, y: half, z: 0, w: half}))
      .toEqual({x: 0, y: half, z: 0, w: half});
    expect(coreBodyOrientationInViewportFrame({x: 0, y: 0, z: half, w: half}))
      .toEqual({x: 0, y: 0, z: -half, w: half});
  });

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

  test("adapts a core-backed GAN connection to CubeLab's manager contract", async () => {
    const mock = connection();
    const manager = createRegripCoreManager({
      isBluetoothAvailable: () => true,
      connectTransport: async () => mock.connection,
    });
    const seen: string[] = [];
    manager.subscribeEvents((event) => seen.push(event.type));

    await expect(manager.connect()).resolves.toMatchObject({
      name: "GANi4_A73F",
      brand: "gan",
      protocolId: "gan-gen4",
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

    expect(manager.getState()).toMatchObject({phase: "connected", device: {brand: "gan"}});
    expect(seen).toEqual(["move"]);

    await manager.resetCubeState();
    expect(mock.sendCommand).toHaveBeenLastCalledWith({type: "REQUEST_RESET"});

    await manager.disconnect();
    expect(manager.getState().phase).toBe("disconnected");
  });

  test("forwards one core-confirmed virtual regrip instead of a second detector event", async () => {
    const mock = connection();
    const manager = createRegripCoreManager({
      isBluetoothAvailable: () => true,
      connectTransport: async () => mock.connection,
    });
    const regrips: Array<{
      notationToken: string;
      sensorFrameToken: string;
      solverNotationToken?: string;
    }> = [];
    const solverMoves: string[] = [];
    const receivedBodyFacelets: string[] = [];
    const solverFacelets: string[] = [];
    manager.subscribeEvents((event) => {
      if (event.type === "regrip") regrips.push(event);
      if (event.type === "move" && event.solverMove) solverMoves.push(event.solverMove);
      if (event.type === "facelets") {
        receivedBodyFacelets.push(event.facelets);
        if (event.solverFacelets) solverFacelets.push(event.solverFacelets);
      }
    });

    await manager.connect();
    mock.events.next({
      type: "GYRO",
      timestamp: 1,
      quaternion: {x: 0, y: 0, z: 0, w: 1},
    });
    mock.events.next({
      type: "GYRO",
      timestamp: 2,
      quaternion: {x: Math.sqrt(0.5), y: 0, z: 0, w: Math.sqrt(0.5)},
    });

    expect(regrips).toHaveLength(1);
    expect(regrips[0]?.notationToken).toMatch(/^[xyz]'?$/);

    const frame = VirtualCubeFrame.make();
    VirtualCubeFrame.applyRegrip(frame, regrips[0]!.notationToken as RegripToken);
    const bodyFacelets = "URFDLB".repeat(9);
    mock.events.next({
      type: "MOVE",
      timestamp: 3,
      move: "F'",
      face: 2,
      direction: 1,
      localTimestamp: 3,
      cubeTimestamp: 3,
    });
    mock.events.next({type: "FACELETS", timestamp: 4, facelets: bodyFacelets});

    expect(solverMoves).toEqual([VirtualCubeFrame.translate(frame, "F'")]);
    expect(receivedBodyFacelets).toEqual([bodyFacelets]);
    expect(solverFacelets).toEqual([VirtualCubeFrame.reframeFacelets(frame, bodyFacelets)]);
  });

  test("keeps R, y, physical B′ in one solver state frame", () => {
    // Regression capture: GoCube emitted R, then core confirmed y, then the
    // body-fixed encoder emitted B′. The visible history is R y R′, while y
    // is frame metadata—not a second logical state permutation.
    const frame = VirtualCubeFrame.make();
    const events = [
      {type: "MOVE", timestamp: 872736, move: "R", face: 1, direction: 0, localTimestamp: 872736, cubeTimestamp: null},
      {type: "REGRIP", timestamp: 873728, notationToken: "y", sensorFrameToken: "y'"},
      {type: "MOVE", timestamp: 874808, move: "B'", face: 5, direction: 1, localTimestamp: 874808, cubeTimestamp: null},
      {type: "FACELETS", timestamp: 874808, facelets: "LLLUUFUUFRRURRURRFFFDFFDFFDDDBDDBRRRDLLDLLBLLBBBBBBUUU"},
    ] as SmartCubeSessionEvent[];

    const normalized = events.map((event) => normalizeCoreEvent(event, frame));

    expect(normalized).toMatchObject([
      {type: "move", move: "R", solverMove: "R", source: "regrip-core"},
      {type: "regrip", notationToken: "y", sensorFrameToken: "y'", source: "regrip-core"},
      {type: "move", move: "B'", solverMove: "R'", source: "regrip-core"},
      {
        type: "facelets",
        facelets: "LLLUUFUUFRRURRURRFFFDFFDFFDDDBDDBRRRDLLDLLBLLBBBBBBUUU",
        solverFacelets: "UUBUUBLLBRRRRRRUUUFFUFFUFFLRRFDDFDDFLLDLLDLLDDBBDBBRBB",
        source: "regrip-core",
      },
    ]);
  });

  test("maps a body-fixed R through repeated y′ regrips", () => {
    // A user turning the same physical red face after each y′ regrip must see
    // the virtual red, blue, orange, then green faces turn: R B L F.
    const frame = VirtualCubeFrame.make();
    const normalized: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const move = normalizeCoreEvent({
        type: "MOVE",
        timestamp: index * 2,
        move: "R",
        face: 1,
        direction: 0,
        localTimestamp: null,
        cubeTimestamp: null,
      }, frame);
      if (move?.type === "move") normalized.push(move.solverMove ?? move.move);
      if (index < 3) {
        normalizeCoreEvent({
          type: "REGRIP",
          timestamp: index * 2 + 1,
          notationToken: "y'",
          sensorFrameToken: "y'",
        }, frame);
      }
    }
    expect(normalized).toEqual(["R", "B", "L", "F"]);
  });

  test("keeps body-local x/z regrips visible while retaining solver notation", () => {
    const frame = VirtualCubeFrame.make();
    const y = normalizeCoreEvent({
      type: "REGRIP",
      timestamp: 1,
      notationToken: "y",
      sensorFrameToken: "y",
    }, frame);
    const x = normalizeCoreEvent({
      type: "REGRIP",
      timestamp: 2,
      notationToken: "x",
      sensorFrameToken: "x",
    }, frame);

    expect(y).toMatchObject({type: "regrip", notationToken: "y", solverNotationToken: "y"});
    expect(x).toMatchObject({type: "regrip", notationToken: "x", solverNotationToken: "z"});
  });

  test("keeps body moves intact while their solver labels converge after y′ regrips", () => {
    // Exact 07:26 capture: the player/viewport must receive R F L B, while
    // history may label all four as the current virtual R face.
    const frame = VirtualCubeFrame.make();
    const bodyMoves: string[] = [];
    const solverMoves: string[] = [];
    for (const [index, bodyMove] of ["R", "F", "L", "B"].entries()) {
      const normalized = normalizeCoreEvent({
        type: "MOVE",
        timestamp: index * 2,
        move: bodyMove,
        face: [1, 2, 4, 5][index]!,
        direction: 0,
        localTimestamp: null,
        cubeTimestamp: null,
      }, frame);
      if (normalized?.type === "move") {
        bodyMoves.push(normalized.move);
        solverMoves.push(normalized.solverMove ?? normalized.move);
      }
      if (index < 3) {
        normalizeCoreEvent({
          type: "REGRIP",
          timestamp: index * 2 + 1,
          notationToken: "y'",
          sensorFrameToken: "y",
        }, frame);
      }
    }
    expect(bodyMoves).toEqual(["R", "F", "L", "B"]);
    expect(solverMoves).toEqual(["R", "R", "R", "R"]);
  });

  test("feeds a direct GoCube transport through core stabilization before rendering", async () => {
    const mock = connection();
    mock.connection = {
      ...mock.connection,
      deviceName: "GoCube Edge",
      protocol: {id: "gocube", name: "GoCube"},
    };
    const manager = createRegripCoreManager({
      isBluetoothAvailable: () => true,
      connectTransport: async () => mock.connection,
    });
    const orientations: Array<{
      coordinateFrame: string;
      source?: string;
      quaternion: {x: number; y: number; z: number; w: number};
      rawQuaternion?: {x: number; y: number; z: number; w: number};
    }> = [];
    manager.subscribeEvents((event) => {
      if (event.type === "orientation") orientations.push(event);
    });

    await expect(manager.connect()).resolves.toMatchObject({brand: "gocube"});
    mock.events.next({
      type: "GYRO",
      timestamp: 1,
      quaternion: {x: 0.1, y: -0.3, z: -0.2, w: 0.9},
    });

    expect(orientations).toMatchObject([{
      coordinateFrame: "viewport",
      source: "regrip-core",
      quaternion: {x: 0, y: 0, z: 0, w: 1},
      rawQuaternion: {x: 0.1, y: -0.3, z: -0.2, w: 0.9},
    }]);
  });
});
