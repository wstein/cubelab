import {
  createSmartCubeSession,
  type SmartCubeSession,
  type SmartCubeSessionEvent,
  type SmartCubeSessionState,
} from "@wstein/regrip-core/session/smartCubeSession";
import type {SmartCubeTransportConnection} from "@wstein/regrip-core/bindings/smartCubeTransport";
import type {SessionFeaturesPatch} from "@wstein/regrip-core/session/features";
import * as VirtualCubeFrame from "@wstein/regrip-core/domain/VirtualCubeFrame.res.mjs";

import {
  connectCubeLabTransport,
  isWebBluetoothAvailable,
  normalizeTransportEvent,
} from "./bluetooth";
import {resolveSmartCubeDriver} from "./drivers";
import {reverseGanMacAddress} from "./gan-mac";
import type {
  SmartCubeCommand,
  SmartCubeConnectOptions,
  SmartCubeConnectionState,
  SmartCubeDevice,
  SmartCubeEvent,
  SmartCubeManager,
} from "./types";

/**
 * Temporary GAN/GoCube migration seam.
 *
 * CubeLab retains its established chooser, direct GoCube UART path, and GAN i4
 * MAC recovery. The returned core session owns only normalized lifecycle,
 * profile, gyro, virtual-regrip, and replay behavior. The existing
 * `createSmartCubeManager()` remains the default UI transport until parity is
 * proven per protocol family.
 */
export type RegripCoreSessionOptions = {
  connect?: () => Promise<SmartCubeTransportConnection>;
  features?: SessionFeaturesPatch;
};

export const createRegripCoreSession = (
  options: RegripCoreSessionOptions = {},
): SmartCubeSession =>
  createSmartCubeSession({
    connect: options.connect ?? connectCubeLabTransport,
    features: options.features,
  });

export type RegripCoreManagerDependencies = {
  connectTransport: (options: SmartCubeConnectOptions) => Promise<SmartCubeTransportConnection>;
  isBluetoothAvailable: () => boolean;
  features?: SessionFeaturesPatch;
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

const deviceFor = (connection: SmartCubeTransportConnection): SmartCubeDevice => {
  const driver = resolveSmartCubeDriver(connection.protocol.id, connection.deviceName);
  if (!driver || (driver.brand !== "gan" && driver.brand !== "gocube")) {
    throw new Error(`Regrip core migration supports GAN and GoCube only: ${connection.protocol.id}`);
  }
  const displayMac = connection.protocol.id === "gan-gen4" && /^GANi4(?:_|$)/i.test(connection.deviceName)
    ? reverseGanMacAddress(connection.deviceMAC) ?? connection.deviceMAC
    : connection.deviceMAC;
  return {
    name: connection.deviceName,
    macAddress: displayMac || null,
    brand: driver.brand,
    brandName: driver.brandName,
    protocolId: connection.protocol.id,
    protocolName: connection.protocol.name,
    capabilities: {
      orientation: connection.capabilities.gyroscope,
      battery: connection.capabilities.battery,
      facelets: connection.capabilities.facelets,
      hardware: connection.capabilities.hardware,
      reset: connection.capabilities.reset,
      led: false,
    },
  };
};

const normalizeCoreEvent = (
  event: SmartCubeSessionEvent,
  protocolId: string,
  solverFrame: VirtualCubeFrame.VirtualCubeFrame,
): SmartCubeEvent | null => {
  switch (event.type) {
    case "BATTERY":
    case "HARDWARE":
    case "DISCONNECT":
      return normalizeTransportEvent(event, protocolId);
    case "MOVE": {
      const normalized = normalizeTransportEvent(event, protocolId);
      return normalized?.type === "move"
        ? {...normalized, solverMove: VirtualCubeFrame.translate(solverFrame, event.move), source: "regrip-core"}
        : normalized;
    }
    case "FACELETS": {
      const normalized = normalizeTransportEvent(event, protocolId);
      return normalized?.type === "facelets"
        ? {
          ...normalized,
          facelets: VirtualCubeFrame.reframeFacelets(solverFrame, event.facelets),
          rawFacelets: event.facelets,
          source: "regrip-core",
        }
        : normalized;
    }
    case "GYRO": {
      const normalized = normalizeTransportEvent(event, protocolId);
      return normalized?.type === "orientation"
        ? {
          ...normalized,
          // Regrip core has already applied the profile sensor→body mapping,
          // established a session calibration basis, and optionally stabilized
          // the pose. The renderer must treat this as canonical viewport
          // orientation rather than applying CubeLab's legacy wire transform.
          quaternion: event.stabilized,
          coordinateFrame: "viewport",
          rawQuaternion: normalized.quaternion,
          source: "regrip-core",
        }
        : normalized;
    }
    case "REGRIP":
      VirtualCubeFrame.applyRegrip(solverFrame, event.notationToken);
      return {
        type: "regrip",
        timestamp: event.timestamp,
        notationToken: event.notationToken,
        sensorFrameToken: event.sensorFrameToken,
      };
    case "CUSTOM_TRIGGER":
      // CubeLab's legacy event union has no equivalent yet. The core session
      // still owns this derived event; a later UI migration will expose it.
      return null;
  }
};

/**
 * Adapts Regrip core's session to CubeLab's established manager contract.
 *
 * This keeps the UI and its replay/recording surfaces stable while the GAN and
 * GoCube live paths use one normalized session implementation. Core events are
 * the sole orientation, regrip, magnetic-detent, and drift-compensation authority.
 */
export const createRegripCoreManager = (
  dependencies: Partial<RegripCoreManagerDependencies> = {},
): SmartCubeManager => {
  const connectTransport = dependencies.connectTransport ?? ((options) => connectCubeLabTransport(options));
  const bluetoothAvailable = dependencies.isBluetoothAvailable ?? isWebBluetoothAvailable;
  let state = bluetoothAvailable() ? disconnectedState() : unavailableState();
  let session: SmartCubeSession | null = null;
  let transport: SmartCubeTransportConnection | null = null;
  let device: SmartCubeDevice | null = null;
  let lastOptions: SmartCubeConnectOptions | null = null;
  let unsubscribeState: (() => void) | null = null;
  let unsubscribeEvents: (() => void) | null = null;
  const stateListeners = new Set<(next: SmartCubeConnectionState) => void>();
  const eventListeners = new Set<(event: SmartCubeEvent) => void>();
  const commandListeners = new Set<(command: SmartCubeCommand) => void>();
  const solverFrame = VirtualCubeFrame.make();

  const publishState = (next: SmartCubeConnectionState): void => {
    state = next;
    stateListeners.forEach((listener) => listener(state));
  };
  const publishCommand = (command: SmartCubeCommand): void =>
    commandListeners.forEach((listener) => listener(command));
  const clearSession = (): void => {
    unsubscribeState?.();
    unsubscribeEvents?.();
    unsubscribeState = null;
    unsubscribeEvents = null;
    session = null;
    transport = null;
    device = null;
  };
  const publishSessionState = (next: SmartCubeSessionState): void => {
    if (next.status === "connecting") {
      publishState({phase: "connecting", message: "Connecting smart cube…", device: null, error: null});
    } else if (next.status === "connected" && device) {
      publishState({phase: "connected", message: `${device.name} connected`, device, error: null});
    } else if (next.status === "error") {
      const error = new Error(next.error ?? "Could not connect smart cube");
      publishState({phase: "error", message: error.message, device: null, error});
    } else if (next.status === "disconnected") {
      publishState(disconnectedState());
    }
  };
  const requireSession = (): SmartCubeSession => {
    if (!session || state.phase !== "connected") throw new Error("No smart cube is connected");
    return session;
  };
  const send = async (type: Exclude<SmartCubeCommand["type"], "FLASH_LED">): Promise<void> => {
    const active = requireSession();
    publishCommand({timestamp: Date.now(), type});
    await active.sendCommand({type});
  };

  const disconnect = async (): Promise<void> => {
    const active = session;
    if (!active) {
      if (state.phase !== "unavailable") publishState(disconnectedState());
      return;
    }
    publishState({...state, phase: "disconnecting", message: "Disconnecting…", error: null});
    await active.disconnect();
    clearSession();
    publishState(disconnectedState());
  };

  const connect = async (options: SmartCubeConnectOptions = {}): Promise<SmartCubeDevice> => {
    if (!bluetoothAvailable()) {
      const error = new Error("Web Bluetooth requires a supported browser and secure context");
      publishState({...unavailableState(), error});
      throw error;
    }
    if (session) await disconnect();
    VirtualCubeFrame.reset(solverFrame);
    lastOptions = {...options};
    publishState({phase: "connecting", message: "Select your smart cube…", device: null, error: null});
    let connected: SmartCubeTransportConnection | null = null;
    const core = createRegripCoreSession({
      connect: async () => {
        connected = await connectTransport(options);
        transport = connected;
        device = deviceFor(connected);
        return connected;
      },
      // CubeLab's renderer consumes solver-frame events from this facade, so
      // virtual regrips are enabled for every live core session by default.
      features: {
        ...dependencies.features,
        regrip: {enabled: true, ...dependencies.features?.regrip},
      },
    });
    session = core;
    unsubscribeState = core.subscribe(publishSessionState);
    unsubscribeEvents = core.subscribeEvents((event) => {
      const normalized = normalizeCoreEvent(event, transport?.protocol.id ?? "", solverFrame);
      if (normalized) eventListeners.forEach((listener) => listener(normalized));
    });
    try {
      await core.connect();
      if (!connected || !device) throw new Error("Smart cube transport did not connect");
      publishState({phase: "connected", message: `${device.name} connected`, device, error: null});
      return device;
    } catch (error) {
      clearSession();
      const normalized = error instanceof Error ? error : new Error(String(error));
      publishState({phase: "error", message: normalized.message, device: null, error: normalized});
      throw normalized;
    }
  };

  return {
    getState: () => state,
    connect,
    reconnect: () => lastOptions
      ? connect(lastOptions)
      : Promise.reject(new Error("No previous smart cube connection")),
    disconnect,
    refresh: async () => {
      const capabilities = requireSession().getState().connection?.capabilities;
      if (capabilities?.hardware) await send("REQUEST_HARDWARE");
      if (capabilities?.battery) await send("REQUEST_BATTERY");
      if (capabilities?.facelets) await send("REQUEST_FACELETS");
    },
    resetCubeState: async () => {
      const capabilities = requireSession().getState().connection?.capabilities;
      if (!capabilities?.reset) throw new Error("Connected cube does not support remote state reset");
      await send("REQUEST_RESET");
    },
    flashLed: async (colour, durationMs) => {
      const active = transport as (SmartCubeTransportConnection & {
        flashLed?: (colour: "amber" | "green", durationMs: number) => Promise<void>;
      }) | null;
      if (!active?.flashLed) {
        throw new Error("Connected cube does not expose verified LED feedback");
      }
      const normalizedDuration = Math.max(50, Math.min(5000, Math.round(durationMs)));
      publishCommand({timestamp: Date.now(), type: "FLASH_LED", colour, durationMs: normalizedDuration});
      await active.flashLed(colour, normalizedDuration);
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
  };
};
