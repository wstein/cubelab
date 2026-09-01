export type SmartCubeBrand = "gan" | "giiker" | "gocube" | "moyu";

export type SmartCubeCapabilities = {
  orientation: boolean;
  battery: boolean;
  facelets: boolean;
  hardware: boolean;
  reset: boolean;
  /** Verified, transport-provided hardware light control. */
  led: boolean;
};

export type SmartCubeDevice = {
  name: string;
  macAddress: string | null;
  brand: SmartCubeBrand;
  brandName: string;
  protocolId: string;
  protocolName: string;
  capabilities: SmartCubeCapabilities;
};

type EventBase = {
  timestamp: number;
};

export type SmartCubeMoveEvent = EventBase & {
  type: "move";
  move: string;
  face: number;
  direction: number;
  localTimestamp: number | null;
  cubeTimestamp: number | null;
};

export type SmartCubeOrientationEvent = EventBase & {
  type: "orientation";
  quaternion: {x: number; y: number; z: number; w: number};
  /** Coordinate system used by the quaternion before viewport calibration. */
  coordinateFrame: "viewport" | "gocube-wire";
  angularVelocity?: {x: number; y: number; z: number};
};

export type SmartCubeBatteryEvent = EventBase & {
  type: "battery";
  level: number;
};

export type SmartCubeFaceletsEvent = EventBase & {
  type: "facelets";
  /** URFDLB order, nine stickers per face. */
  facelets: string;
};

export type SmartCubeHardwareEvent = EventBase & {
  type: "hardware";
  hardwareName?: string;
  hardwareVersion?: string;
  softwareVersion?: string;
  productDate?: string;
  orientationSupported?: boolean;
};

export type SmartCubeDisconnectedEvent = EventBase & {
  type: "disconnected";
};

export type SmartCubeEvent =
  | SmartCubeMoveEvent
  | SmartCubeOrientationEvent
  | SmartCubeBatteryEvent
  | SmartCubeFaceletsEvent
  | SmartCubeHardwareEvent
  | SmartCubeDisconnectedEvent;

export type SmartCubeConnectionPhase =
  | "unavailable"
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export type SmartCubeConnectionState = {
  phase: SmartCubeConnectionPhase;
  message: string;
  device: SmartCubeDevice | null;
  error: Error | null;
};

export type SmartCubeConnectOptions = {
  /** Restrict the chooser to a previously selected advertised name. */
  deviceName?: string;
  /** Show every BLE device and select the driver from its GATT services. */
  acceptAnyDevice?: boolean;
  /** Try bounded MAC candidates for encrypted GAN-compatible devices. */
  enableAddressSearch?: boolean;
  /** Supply a MAC when advertisements do not expose one. */
  macAddressProvider?: (
    device: BluetoothDevice,
    isFallbackCall?: boolean,
  ) => Promise<string | null>;
  signal?: AbortSignal;
};

export type SmartCubeManager = {
  getState: () => SmartCubeConnectionState;
  connect: (options?: SmartCubeConnectOptions) => Promise<SmartCubeDevice>;
  reconnect: () => Promise<SmartCubeDevice>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  resetCubeState: () => Promise<void>;
  flashLed: (colour: "amber" | "green", durationMs: number) => Promise<void>;
  subscribeState: (listener: (state: SmartCubeConnectionState) => void) => () => void;
  subscribeEvents: (listener: (event: SmartCubeEvent) => void) => () => void;
};
