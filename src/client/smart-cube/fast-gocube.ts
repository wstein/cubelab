import {Subject} from "rxjs";
import type {
  SmartCubeCapabilities as TransportCapabilities,
  SmartCubeCommand as TransportCommand,
  SmartCubeConnection as TransportConnection,
  SmartCubeEvent as TransportEvent,
  SmartCubeProtocolInfo,
} from "smartcube-web-bluetooth";

const UUID_SUFFIX = "-b5a3-f393-e0a9-e50e24dcca9e";
export const GOCUBE_SERVICE_UUID = `6e400001${UUID_SUFFIX}`;
export const GOCUBE_CHRCT_WRITE = `6e400002${UUID_SUFFIX}`;
export const GOCUBE_CHRCT_READ = `6e400003${UUID_SUFFIX}`;

export const WRITE_BATTERY = 50;
export const WRITE_STATE = 51;
export const WRITE_RESET = 53;
export const WRITE_ENABLE_ORIENTATION = 0x38;
/** GoCube NUS `A`: flash the cube lights three times (no packet framing). */
export const WRITE_FLASH_LIGHTS = 0x41;

export const AXIS_PERM = [5, 2, 0, 3, 1, 4];
export const FACE_PERM = [0, 1, 2, 5, 8, 7, 6, 3];
export const FACE_OFFSET = [0, 0, 6, 2, 0, 0];
export const OPPOSITE_AXIS = [3, 4, 5, 0, 1, 2];

export const isGoCubeDeviceName = (deviceName: string): boolean =>
  /^(GoCube|Rubik)/i.test((deviceName || "").trim());

export const goCubeDeviceSupportsGyro = (deviceName: string): boolean => {
  const clean = (deviceName || "").trim();
  if (!clean.startsWith("GoCube")) return false;
  if (clean.startsWith("GoCubeX")) return false;
  return true;
};

export const gocubeChecksumValid = (value: DataView): boolean => {
  if (value.byteLength < 7) return false;
  let sum = 0;
  for (let i = 0; i <= value.byteLength - 4; i++) {
    sum += value.getUint8(i);
  }
  return (sum & 0xff) === value.getUint8(value.byteLength - 3);
};

export const parseGoCubeOrientationPayload = (
  payloadUtf8: string,
): {x: number; y: number; z: number; w: number} | null => {
  const parts = payloadUtf8.split("#");
  if (parts.length !== 4) return null;
  const rx = Number.parseInt(parts[0]!.trim(), 10);
  const ry = Number.parseInt(parts[1]!.trim(), 10);
  const rz = Number.parseInt(parts[2]!.trim(), 10);
  const rw = Number.parseInt(parts[3]!.trim(), 10);
  if (![rx, ry, rz, rw].every(Number.isFinite)) return null;
  const len = Math.hypot(rx, ry, rz, rw);
  if (len === 0) return null;
  return {x: rx / len, y: -rz / len, z: -ry / len, w: rw / len};
};

export const decodeGoCubeFacelets = (value: DataView): string | null => {
  if (value.byteLength < 3 + 6 * 9) return null;
  const facelet: string[] = [];
  for (let a = 0; a < 6; a++) {
    const axis = AXIS_PERM[a] * 9;
    const aoff = FACE_OFFSET[a];
    facelet[axis + 4] = "BFUDRL".charAt(value.getUint8(3 + a * 9));
    for (let i = 0; i < 8; i++) {
      facelet[axis + FACE_PERM[(i + aoff) % 8]] = "BFUDRL".charAt(value.getUint8(3 + a * 9 + i + 1));
    }
  }
  return facelet.join("");
};

export type BleTimingBreakdown = {
  chooserMs?: number;
  gattConnectMs?: number;
  serviceResolveMs?: number;
  notificationsMs?: number;
  streamReadyMs: number;
  firstPacketMs?: number;
};

/**
 * Non-standard metadata carried by CubeLab's direct GoCube connector.
 * The public smartcube transport interface intentionally knows nothing about
 * timings, so consumers must treat this as optional diagnostic information.
 */
export type TimedGoCubeConnection = TransportConnection & {
  timing: BleTimingBreakdown;
};

export const GOCUBE_PROTOCOL_INFO: SmartCubeProtocolInfo = {
  id: "gocube",
  name: "GoCube",
};

export const connectFastGoCube = async (
  device: BluetoothDevice,
  options?: {
    onStatus?: (message: string) => void;
    signal?: AbortSignal;
    tPickerStart?: number;
    tPickerEnd?: number;
    onTiming?: (metrics: BleTimingBreakdown) => void;
  },
): Promise<TransportConnection> => {
  if (options?.signal?.aborted) {
    throw new DOMException("Connection aborted", "AbortError");
  }

  const rawName = device.name ?? "GoCube";
  const displayName = rawName.startsWith("GoCube") ? "GoCube" : "Rubik's Connected";
  const gyroSupported = goCubeDeviceSupportsGyro(rawName);

  const tGattStart = performance.now();
  options?.onStatus?.("Connecting GATT…");

  const gatt = await device.gatt!.connect();
  const tGattEnd = performance.now();

  options?.onStatus?.("Resolving service…");
  const service = await gatt.getPrimaryService(GOCUBE_SERVICE_UUID);
  const writeChrct = await service.getCharacteristic(GOCUBE_CHRCT_WRITE);
  const readChrct = await service.getCharacteristic(GOCUBE_CHRCT_READ);
  const tServiceEnd = performance.now();

  options?.onStatus?.("Subscribing to notifications…");
  await readChrct.startNotifications();
  const tNotificationsEnd = performance.now();

  const streamReadyMs = tNotificationsEnd - (options?.tPickerEnd ?? tGattStart);
  const timing: BleTimingBreakdown = {
    ...(options?.tPickerStart !== undefined && options.tPickerEnd !== undefined
      ? {chooserMs: options.tPickerEnd - options.tPickerStart}
      : {}),
    gattConnectMs: tGattEnd - tGattStart,
    serviceResolveMs: tServiceEnd - tGattEnd,
    notificationsMs: tNotificationsEnd - tServiceEnd,
    streamReadyMs,
  };

  console.info(
    `[BLE Timing] Connected to ${rawName} in ${streamReadyMs.toFixed(1)}ms:\n` +
      `  - GATT connect: ${(tGattEnd - tGattStart).toFixed(1)}ms\n` +
      `  - Service resolve: ${(tServiceEnd - tGattEnd).toFixed(1)}ms\n` +
      `  - Notifications: ${(tNotificationsEnd - tServiceEnd).toFixed(1)}ms`,
  );

  const events$ = new Subject<TransportEvent>();
  let lastMoveMeta: {axis: number; dirBit: number} | null = null;
  let receivedFirstPacket = false;
  let batteryInterval: ReturnType<typeof setInterval> | null = null;

  const onDisconnect = () => {
    device.removeEventListener("gattserverdisconnected", onDisconnect);
    if (batteryInterval) {
      clearInterval(batteryInterval);
      batteryInterval = null;
    }
    events$.next({timestamp: Date.now(), type: "DISCONNECT"});
    events$.complete();
  };
  device.addEventListener("gattserverdisconnected", onDisconnect);

  const writeValue = async (bytes: number[]) => {
    try {
      const buffer = new Uint8Array(bytes).buffer;
      if (typeof writeChrct.writeValueWithoutResponse === "function") {
        await writeChrct.writeValueWithoutResponse(buffer);
      } else {
        await writeChrct.writeValue(buffer);
      }
    } catch {
      // Best-effort send
    }
  };

  const onPacket = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value || value.byteLength < 4) return;
    if (
      value.getUint8(0) !== 0x2a ||
      value.getUint8(value.byteLength - 2) !== 0x0d ||
      value.getUint8(value.byteLength - 1) !== 0x0a
    ) {
      return;
    }
    if (value.byteLength >= 7 && !gocubeChecksumValid(value)) return;

    const now = Date.now();
    if (!receivedFirstPacket) {
      receivedFirstPacket = true;
      const firstPacketDelay = performance.now() - tNotificationsEnd;
      timing.firstPacketMs = firstPacketDelay;
      options?.onTiming?.(timing);
      console.info(
        `[BLE Timing] First valid GoCube packet received ${firstPacketDelay.toFixed(1)}ms after stream ready`,
      );
    }

    const msgType = value.getUint8(2);

    if (msgType === 3) {
      // Gyro orientation
      if (!gyroSupported || value.byteLength < 8) return;
      const end = value.byteLength - 3;
      const payload = new Uint8Array(value.buffer, value.byteOffset + 3, end - 3);
      const text = new TextDecoder("utf-8", {fatal: false}).decode(payload);
      const q = parseGoCubeOrientationPayload(text);
      if (q) {
        events$.next({
          timestamp: now,
          type: "GYRO",
          quaternion: q,
        });
      }
      return;
    }

    if (msgType === 1) {
      // Move frame
      const msgLen = value.byteLength - 6;
      if (value.byteLength < 8) {
        if (lastMoveMeta) {
          const oppAxis = OPPOSITE_AXIS[lastMoveMeta.axis];
          const newDirBit = 1 - lastMoveMeta.dirBit;
          const power = [0, 2][newDirBit];
          const moveStr = ("URFDLB".charAt(oppAxis) + " 2'".charAt(power)).trim();
          lastMoveMeta = {axis: oppAxis, dirBit: newDirBit};
          events$.next({
            timestamp: now,
            type: "MOVE",
            face: oppAxis,
            direction: power === 0 ? 0 : 1,
            move: moveStr,
            localTimestamp: now,
            cubeTimestamp: null,
          });
        }
        return;
      }
      for (let i = 0; i < msgLen; i += 2) {
        const axis = AXIS_PERM[value.getUint8(3 + i) >> 1];
        const dirBit = value.getUint8(3 + i) & 1;
        const power = [0, 2][dirBit];
        const moveStr = ("URFDLB".charAt(axis) + " 2'".charAt(power)).trim();
        lastMoveMeta = {axis, dirBit};
        events$.next({
          timestamp: now,
          type: "MOVE",
          face: axis,
          direction: power === 0 ? 0 : 1,
          move: moveStr,
          localTimestamp: now,
          cubeTimestamp: null,
        });
      }
      return;
    }

    if (msgType === 2) {
      // Full cube state
      const facelets = decodeGoCubeFacelets(value);
      if (facelets) {
        events$.next({
          timestamp: now,
          type: "FACELETS",
          facelets,
        });
      }
      return;
    }

    if (msgType === 5) {
      // Battery
      const raw = value.getUint8(3);
      if (Number.isFinite(raw)) {
        events$.next({
          timestamp: now,
          type: "BATTERY",
          batteryLevel: Math.min(100, Math.max(0, Math.round(raw))),
        });
      }
    }
  };

  readChrct.addEventListener("characteristicvaluechanged", onPacket);

  // Send initialization writes asynchronously (non-blocking!)
  if (gyroSupported) {
    void writeValue([WRITE_ENABLE_ORIENTATION]);
  }
  void writeValue([WRITE_STATE]);
  void writeValue([WRITE_BATTERY]);

  batteryInterval = setInterval(() => {
    void writeValue([WRITE_BATTERY]);
  }, 60_000);

  const capabilities: TransportCapabilities = {
    gyroscope: gyroSupported,
    battery: true,
    facelets: true,
    hardware: true,
    reset: true,
  };

  const connection: TimedGoCubeConnection = {
    deviceName: displayName,
    deviceMAC: "",
    protocol: GOCUBE_PROTOCOL_INFO,
    capabilities,
    events$,
    timing,
    async sendCommand(command: TransportCommand) {
      if (command.type === "REQUEST_BATTERY") {
        await writeValue([WRITE_BATTERY]);
      } else if (command.type === "REQUEST_FACELETS") {
        await writeValue([WRITE_STATE]);
      } else if (command.type === "REQUEST_HARDWARE") {
        events$.next({
          timestamp: Date.now(),
          type: "HARDWARE",
          hardwareName: displayName,
          gyroSupported,
        });
      } else if (command.type === "REQUEST_RESET") {
        await writeValue([WRITE_RESET]);
      }
    },
    async flashLed(_colour: "amber" | "green", _durationMs: number) {
      // GoCube exposes one fixed LED effect: bare ASCII `A` on the NUS write
      // characteristic. It flashes three times; colour and duration are not
      // parameters in this protocol.
      await writeValue([WRITE_FLASH_LIGHTS]);
    },
    async disconnect() {
      readChrct.removeEventListener("characteristicvaluechanged", onPacket);
      await readChrct.stopNotifications().catch(() => {});
      if (batteryInterval) {
        clearInterval(batteryInterval);
        batteryInterval = null;
      }
      device.removeEventListener("gattserverdisconnected", onDisconnect);
      events$.next({timestamp: Date.now(), type: "DISCONNECT"});
      events$.complete();
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    },
  };

  return connection;
};
