import {
  connectSmartCube as connectTransport,
  type ConnectSmartCubeOptions as TransportConnectOptions,
  type SmartCubeConnection as TransportConnection,
  type SmartCubeEvent as TransportEvent,
} from "smartcube-web-bluetooth";

import {resolveSmartCubeDriver} from "./drivers";
import type {
  SmartCubeCapabilities,
  SmartCubeConnectOptions,
  SmartCubeConnectionState,
  SmartCubeDevice,
  SmartCubeEvent,
  SmartCubeManager,
} from "./types";

type EventSubscription = {unsubscribe: () => void};
type TransportConnector = (options?: TransportConnectOptions) => Promise<TransportConnection>;
type FeedbackTransport = TransportConnection & {
  flashLed?: (colour: "amber" | "green", durationMs: number) => Promise<void>;
};

export type SmartCubeManagerDependencies = {
  connectTransport: TransportConnector;
  isBluetoothAvailable: () => boolean;
};

const disconnectedState = (): SmartCubeConnectionState => ({
  phase: "disconnected",
  message: "No smart cube connected",
  device: null,
  error: null,
});

const unavailableState = (): SmartCubeConnectionState => ({
  phase: "unavailable",
  message: "Web Bluetooth is unavailable in this browser or context",
  device: null,
  error: null,
});

export const isWebBluetoothAvailable = (): boolean => {
  if (typeof navigator === "undefined") return false;
  if (typeof isSecureContext !== "undefined" && !isSecureContext) return false;
  return typeof navigator.bluetooth?.requestDevice === "function";
};

const normalizeCapabilities = (
  capabilities: TransportConnection["capabilities"],
  led = false,
): SmartCubeCapabilities => ({
  orientation: capabilities.gyroscope,
  battery: capabilities.battery,
  facelets: capabilities.facelets,
  hardware: capabilities.hardware,
  reset: capabilities.reset,
  led,
});

const hasBalancedFacelets = (facelets: string): boolean =>
  facelets.length === 54
  && [..."URFDLB"].every((face) => facelets.split(face).length - 1 === 9);

export const normalizeTransportEvent = (
  event: TransportEvent,
  protocolId = "",
): SmartCubeEvent | null => {
  switch (event.type) {
    case "MOVE":
      if (!/^[URFDLB](?:2|')?$/.test(event.move)) return null;
      return {
        type: "move",
        timestamp: event.timestamp,
        move: event.move,
        face: event.face,
        direction: event.direction,
        localTimestamp: event.localTimestamp,
        cubeTimestamp: event.cubeTimestamp,
      };
    case "GYRO":
      if (!Object.values(event.quaternion).every(Number.isFinite)) return null;
      // The pinned GoCube transport maps wire (x,y,z,w) to (x,-z,-y,w).
      // Undo that presentation mapping here. The viewport applies the measured
      // sensor basis after calculating the relative rotation, where a change of
      // basis is mathematically valid and cannot swap pitch with roll.
      const quaternion = protocolId === "gocube"
        ? {
          x: event.quaternion.x,
          y: -event.quaternion.z,
          z: -event.quaternion.y,
          w: event.quaternion.w,
        }
        : event.quaternion;
      return {
        type: "orientation",
        timestamp: event.timestamp,
        quaternion,
        coordinateFrame: protocolId === "gocube" ? "gocube-wire" : "viewport",
        ...(event.velocity ? {angularVelocity: event.velocity} : {}),
      };
    case "BATTERY":
      if (!Number.isFinite(event.batteryLevel)) return null;
      return {
        type: "battery",
        timestamp: event.timestamp,
        level: Math.max(0, Math.min(100, event.batteryLevel)),
      };
    case "FACELETS":
      if (!/^[URFDLB]{54}$/.test(event.facelets) || !hasBalancedFacelets(event.facelets)) return null;
      return {type: "facelets", timestamp: event.timestamp, facelets: event.facelets};
    case "HARDWARE":
      return {
        type: "hardware",
        timestamp: event.timestamp,
        ...(event.hardwareName ? {hardwareName: event.hardwareName} : {}),
        ...(event.hardwareVersion ? {hardwareVersion: event.hardwareVersion} : {}),
        ...(event.softwareVersion ? {softwareVersion: event.softwareVersion} : {}),
        ...(event.productDate ? {productDate: event.productDate} : {}),
        ...(event.gyroSupported === undefined
          ? {}
          : {orientationSupported: event.gyroSupported}),
      };
    case "DISCONNECT":
      return {type: "disconnected", timestamp: event.timestamp};
  }
};

const transportOptions = (
  options: SmartCubeConnectOptions,
  onStatus: (message: string) => void,
): TransportConnectOptions => ({
  ...(options.macAddressProvider ? {macAddressProvider: options.macAddressProvider} : {}),
  ...(options.deviceName ? {deviceName: options.deviceName} : {}),
  ...(options.signal ? {signal: options.signal} : {}),
  deviceSelection: options.acceptAnyDevice ? "any" : "filtered",
  enableAddressSearch: options.enableAddressSearch === true,
  onStatus,
});

export const createSmartCubeManager = (
  dependencies: Partial<SmartCubeManagerDependencies> = {},
): SmartCubeManager => {
  const connector = dependencies.connectTransport ?? connectTransport;
  const bluetoothAvailable = dependencies.isBluetoothAvailable ?? isWebBluetoothAvailable;
  let state = bluetoothAvailable() ? disconnectedState() : unavailableState();
  let connection: TransportConnection | null = null;
  let eventSubscription: EventSubscription | null = null;
  let lastOptions: SmartCubeConnectOptions | null = null;
  let connectionGeneration = 0;
  const stateListeners = new Set<(next: SmartCubeConnectionState) => void>();
  const eventListeners = new Set<(event: SmartCubeEvent) => void>();

  const publishState = (next: SmartCubeConnectionState) => {
    state = next;
    stateListeners.forEach((listener) => listener(state));
  };

  const publishEvent = (event: SmartCubeEvent) => {
    eventListeners.forEach((listener) => listener(event));
  };

  const clearTransport = () => {
    eventSubscription?.unsubscribe();
    eventSubscription = null;
    connection = null;
  };

  const requireConnection = (): TransportConnection => {
    if (!connection || state.phase !== "connected") {
      throw new Error("No smart cube is connected");
    }
    return connection;
  };

  const refresh = async (): Promise<void> => {
    const active = requireConnection();
    if (active.capabilities.hardware) await active.sendCommand({type: "REQUEST_HARDWARE"});
    if (active.capabilities.battery) await active.sendCommand({type: "REQUEST_BATTERY"});
    if (active.capabilities.facelets) await active.sendCommand({type: "REQUEST_FACELETS"});
  };

  const disconnect = async (): Promise<void> => {
    connectionGeneration += 1;
    if (!connection) {
      if (state.phase !== "unavailable") publishState(disconnectedState());
      return;
    }
    const active = connection;
    publishState({...state, phase: "disconnecting", message: "Disconnecting…", error: null});
    clearTransport();
    try {
      await active.disconnect();
    } finally {
      publishState(disconnectedState());
    }
  };

  const connect = async (options: SmartCubeConnectOptions = {}): Promise<SmartCubeDevice> => {
    if (!bluetoothAvailable()) {
      const error = new Error("Web Bluetooth requires a supported browser and secure context");
      publishState({...unavailableState(), error});
      throw error;
    }
    if (connection) await disconnect();

    const generation = ++connectionGeneration;
    lastOptions = {...options};
    publishState({phase: "connecting", message: "Select your smart cube…", device: null, error: null});

    try {
      const transport = await connector(
        transportOptions(options, (message) => {
          if (generation !== connectionGeneration) return;
          publishState({phase: "connecting", message, device: null, error: null});
        }),
      );
      if (generation !== connectionGeneration) {
        await transport.disconnect();
        throw new DOMException("Connection superseded", "AbortError");
      }

      const driver = resolveSmartCubeDriver(transport.protocol.id, transport.deviceName);
      if (!driver) {
        await transport.disconnect();
        throw new Error(`Unsupported smart cube protocol: ${transport.protocol.id}`);
      }

      const device: SmartCubeDevice = {
        name: transport.deviceName,
        macAddress: transport.deviceMAC || null,
        brand: driver.brand,
        brandName: driver.brandName,
        protocolId: transport.protocol.id,
        protocolName: transport.protocol.name,
        capabilities: normalizeCapabilities(
          transport.capabilities,
          typeof (transport as FeedbackTransport).flashLed === "function",
        ),
      };

      connection = transport;
      eventSubscription = transport.events$.subscribe({
        next(rawEvent) {
          if (connection !== transport) return;
          const event = normalizeTransportEvent(rawEvent, transport.protocol.id);
          if (!event) return;
          publishEvent(event);
          if (event.type === "disconnected") {
            clearTransport();
            publishState(disconnectedState());
          }
        },
        error(error: unknown) {
          if (connection !== transport) return;
          clearTransport();
          const normalized = error instanceof Error ? error : new Error(String(error));
          publishState({phase: "error", message: normalized.message, device: null, error: normalized});
        },
      });
      publishState({phase: "connected", message: `${device.name} connected`, device, error: null});

      // Initial reports are best-effort; a model may advertise a command before its firmware responds.
      void refresh().catch(() => {});
      return device;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (generation === connectionGeneration) {
        clearTransport();
        publishState({phase: "error", message: normalized.message, device: null, error: normalized});
      }
      throw normalized;
    }
  };

  return {
    getState: () => state,
    connect,
    reconnect: () => {
      if (!lastOptions) return Promise.reject(new Error("No previous smart cube connection"));
      return connect(lastOptions);
    },
    disconnect,
    refresh,
    resetCubeState: async () => {
      const active = requireConnection();
      if (!active.capabilities.reset) {
        throw new Error(`${active.deviceName} does not support remote state reset`);
      }
      await active.sendCommand({type: "REQUEST_RESET"});
    },
    flashLed: async (colour, durationMs) => {
      const active = requireConnection() as FeedbackTransport;
      if (typeof active.flashLed !== "function") {
        throw new Error(`${active.deviceName} does not expose verified LED control`);
      }
      await active.flashLed(colour, Math.max(50, Math.min(5000, Math.round(durationMs))));
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
  };
};
