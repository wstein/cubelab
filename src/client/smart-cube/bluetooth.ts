import {
  connectSmartCube,
  type ConnectSmartCubeOptions as TransportConnectOptions,
  type SmartCubeConnection as TransportConnection,
  type SmartCubeEvent as TransportEvent,
} from "smartcube-web-bluetooth";

import {resolveSmartCubeDriver} from "./drivers";
import {reverseGanMacAddress} from "./gan-mac";
import type {
  SmartCubeCapabilities,
  SmartCubeCommand,
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
      let quaternion = event.quaternion;
      let coordinateFrame: OrientationCoordinateFrame = "viewport";
      if (protocolId === "gocube") {
        // smartcube-web-bluetooth's GoCube parser remaps raw UART (rx, ry, rz, rw)
        // to (nx, -nz, -ny, nw). Invert this transformation (y: -z, z: -y) back
        // to (nx, ny, nz, nw) so deviceOrientationDelta receives pure GoCube
        // wire axes before applying its viewport basis transformation.
        quaternion = {
          x: event.quaternion.x,
          y: -event.quaternion.z,
          z: -event.quaternion.y,
          w: event.quaternion.w,
        };
        coordinateFrame = "gocube-wire";
      } else if (protocolId === "gan" || /^gan-gen[1-4]$/.test(protocolId)) {
        // GAN i4 is a Gen4 cube. All supported GAN generations publish the
        // same device-axis convention, so keep gyro/regrip math in gan-wire
        // rather than falling back to an uncalibrated viewport frame.
        coordinateFrame = "gan-wire";
      }
      return {
        type: "orientation",
        timestamp: event.timestamp,
        quaternion,
        coordinateFrame,
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

/** Use the vendor's picker, pre-GATT advertisement capture, and protocol routing. */
export const smartCubeTransportConnector: TransportConnector = (
  options: TransportConnectOptions = {},
): Promise<TransportConnection> => connectSmartCube(options);

export const createSmartCubeManager = (
  dependencies: Partial<SmartCubeManagerDependencies> = {},
): SmartCubeManager => {
  const connector = dependencies.connectTransport ?? smartCubeTransportConnector;
  const bluetoothAvailable = dependencies.isBluetoothAvailable ?? isWebBluetoothAvailable;
  let state = bluetoothAvailable() ? disconnectedState() : unavailableState();
  let connection: TransportConnection | null = null;
  let eventSubscription: EventSubscription | null = null;
  let lastOptions: SmartCubeConnectOptions | null = null;
  let connectionGeneration = 0;
  const stateListeners = new Set<(next: SmartCubeConnectionState) => void>();
  const eventListeners = new Set<(event: SmartCubeEvent) => void>();
  const commandListeners = new Set<(command: SmartCubeCommand) => void>();

  const publishState = (next: SmartCubeConnectionState) => {
    state = next;
    stateListeners.forEach((listener) => listener(state));
  };

  const publishEvent = (event: SmartCubeEvent) => {
    eventListeners.forEach((listener) => listener(event));
  };

  const publishCommand = (command: SmartCubeCommand) => {
    commandListeners.forEach((listener) => listener(command));
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
    if (active.capabilities.hardware) {
      publishCommand({timestamp: Date.now(), type: "REQUEST_HARDWARE"});
      await active.sendCommand({type: "REQUEST_HARDWARE"});
    }
    if (active.capabilities.battery) {
      publishCommand({timestamp: Date.now(), type: "REQUEST_BATTERY"});
      await active.sendCommand({type: "REQUEST_BATTERY"});
    }
    if (active.capabilities.facelets) {
      publishCommand({timestamp: Date.now(), type: "REQUEST_FACELETS"});
      await active.sendCommand({type: "REQUEST_FACELETS"});
    }
  };

  const flashLed = async (colour: "amber" | "green", durationMs: number): Promise<void> => {
    const active = requireConnection() as FeedbackTransport;
    if (typeof active.flashLed !== "function") {
      throw new Error(`${active.deviceName} does not expose verified LED control`);
    }
    const normalizedDuration = Math.max(50, Math.min(5000, Math.round(durationMs)));
    publishCommand({timestamp: Date.now(), type: "FLASH_LED", colour, durationMs: normalizedDuration});
    await active.flashLed(colour, normalizedDuration);
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

      // Gen4 advertises the same capability set for models with and without
      // active orientation telemetry. The i4 capture shows move/facelet
      // packets only, so do not promise gyro until a real 0xEC packet proves
      // it on this connection.
      const transportCapabilities = normalizeCapabilities(
        transport.capabilities,
        typeof (transport as FeedbackTransport).flashLed === "function",
      );
      if (transport.protocol.id === "gan-gen4") transportCapabilities.orientation = false;
      // The i4 transport receives its MAC byte-reversed to compensate for the
      // vendor package's fixed AES-salt reversal. Keep user-visible metadata
      // in normal advertised order.
      const displayMac = transport.protocol.id === "gan-gen4" && /^GANi4(?:_|$)/i.test(transport.deviceName)
        ? reverseGanMacAddress(transport.deviceMAC) ?? transport.deviceMAC
        : transport.deviceMAC;
      let device: SmartCubeDevice = {
        name: transport.deviceName,
        macAddress: displayMac || null,
        brand: driver.brand,
        brandName: driver.brandName,
        protocolId: transport.protocol.id,
        protocolName: transport.protocol.name,
        capabilities: transportCapabilities,
      };

      connection = transport;
      eventSubscription = transport.events$.subscribe({
        next(rawEvent) {
          if (connection !== transport) return;
          const event = normalizeTransportEvent(rawEvent, transport.protocol.id);
          if (!event) return;
          publishEvent(event);
          if (event.type === "orientation" && !device.capabilities.orientation) {
            device = {...device, capabilities: {...device.capabilities, orientation: true}};
            publishState({phase: "connected", message: `${device.name} connected · gyro detected`, device, error: null});
          } else if (event.type === "hardware" && event.orientationSupported !== undefined
            && event.orientationSupported !== device.capabilities.orientation) {
            device = {...device, capabilities: {...device.capabilities, orientation: event.orientationSupported}};
            publishState({phase: "connected", message: `${device.name} connected`, device, error: null});
          }
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

      // Initial reports and the connection flash are best-effort: some models
      // advertise a command before their firmware is ready to answer it.
      await refresh().catch(() => {});
      // GAN i4 commonly drops the battery reply when it is requested alongside
      // its initial fragmented hardware and facelet replies. Retry just that
      // lightweight query once the Gen4 stream is established.
      if (transport.protocol.id === "gan-gen4" && transport.capabilities.battery) {
        globalThis.setTimeout(() => {
          if (connection !== transport || state.phase !== "connected") return;
          publishCommand({timestamp: Date.now(), type: "REQUEST_BATTERY"});
          void transport.sendCommand({type: "REQUEST_BATTERY"}).catch(() => {});
        }, 750);
      }
      if (device.capabilities.led) await flashLed("green", 300).catch(() => {});
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
      publishCommand({timestamp: Date.now(), type: "REQUEST_RESET"});
      await active.sendCommand({type: "REQUEST_RESET"});
    },
    flashLed,
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
  };
};
