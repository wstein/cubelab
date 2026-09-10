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

export type SmartCubeTimingMetrics = {
  chooserMs?: number;
  gattConnectMs?: number;
  serviceResolveMs?: number;
  notificationsMs?: number;
  streamReadyMs?: number;
  firstPacketMs?: number;
};

export type SmartCubeDevice = {
  name: string;
  macAddress: string | null;
  brand: SmartCubeBrand;
  brandName: string;
  protocolId: string;
  protocolName: string;
  capabilities: SmartCubeCapabilities;
  timing?: SmartCubeTimingMetrics;
};

type EventBase = {
  timestamp: number;
};

export type SmartCubeMoveEvent = EventBase & {
  type: "move";
  move: string;
  /** Solver-frame move supplied by Regrip core after virtual regrips. */
  solverMove?: string;
  source?: "regrip-core";
  face: number;
  direction: number;
  localTimestamp: number | null;
  cubeTimestamp: number | null;
};

export type SmartCubeOrientationEvent = EventBase & {
  type: "orientation";
  quaternion: {x: number; y: number; z: number; w: number};
  /** Coordinate system used by the quaternion before viewport calibration. */
  coordinateFrame: OrientationCoordinateFrame;
  angularVelocity?: {x: number; y: number; z: number};
  /** This packet was calibrated and gated by Regrip core. */
  source?: "regrip-core";
  /** Original normalized transport pose, retained for diagnostics only. */
  rawQuaternion?: {x: number; y: number; z: number; w: number};
};

/** A virtual whole-cube x/y/z turn confirmed by Regrip core's gyro pipeline. */
export type SmartCubeRegripEvent = EventBase & {
  type: "regrip";
  /**
   * Clockwise solver-frame x/y/z notation. This changes the view/solver
   * frame; it is deliberately not a logical cube-state move.
   */
  notationToken: string;
  /** Corresponding calibrated sensor-frame x/y/z token. */
  sensorFrameToken: string;
  /** Regrip core has already applied this frame change to later packets. */
  source?: "regrip-core";
};

export type SmartCubeBatteryEvent = EventBase & {
  type: "battery";
  level: number;
};

export type SmartCubeFaceletsEvent = EventBase & {
  type: "facelets";
  /** URFDLB order, nine stickers per face. */
  facelets: string;
  /** Body-frame packet retained when `facelets` has been solver-reframed. */
  rawFacelets?: string;
  source?: "regrip-core";
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
  | SmartCubeRegripEvent
  | SmartCubeDisconnectedEvent;

/** A command CubeLab has handed to the connected cube transport. */
export type SmartCubeCommand = {
  timestamp: number;
  type: "REQUEST_HARDWARE" | "REQUEST_BATTERY" | "REQUEST_FACELETS" | "REQUEST_RESET" | "FLASH_LED";
  colour?: "amber" | "green";
  durationMs?: number;
};

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
  subscribeCommands: (listener: (command: SmartCubeCommand) => void) => () => void;
};
