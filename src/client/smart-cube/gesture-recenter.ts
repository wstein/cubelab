import type {OrientationCoordinateFrame, OrientationQuaternion} from "../cube-gl";
import type {SmartCubeMoveEvent} from "./types";

export type GestureRecenterOptions = {
  /** Maximum interval in ms between initial flick and its reversal (default: 280ms). */
  maxIntervalMs?: number;
  /** Cooldown in ms after a trigger before another can fire (default: 800ms). */
  cooldownMs?: number;
  /** Face index to watch: 0=U, 1=R, 2=F, 3=D, 4=L, 5=B, or "any" (default: 1 for R). */
  targetFace?: number | "any";
  /** Whether gesture detection is currently enabled (default: true). */
  enabled?: boolean;
  /** Audio feedback instance or callback to play when a gesture is detected. */
  audioFeedback?: {play: (cue: "realigned") => void} | null;
  /** Callback fired when a valid rapid flick gesture is recognized. */
  onRecenter?: (event: GestureRecenterTriggerEvent) => void;
};

export type GestureRecenterTriggerEvent = {
  face: number;
  move1: string;
  move2: string;
  intervalMs: number;
  timestamp: number;
  restingOrientation: {
    quaternion: OrientationQuaternion;
    coordinateFrame: OrientationCoordinateFrame;
  } | null;
};

type StoredOrientation = {
  quaternion: OrientationQuaternion;
  coordinateFrame: OrientationCoordinateFrame;
  timestamp: number;
};

type PendingMove = {
  face: number;
  direction: number;
  move: string;
  timestamp: number;
  preOrientation: StoredOrientation | null;
};

export class GestureRecenterDetector {
  private maxIntervalMs: number;
  private cooldownMs: number;
  private targetFace: number | "any";
  public enabled: boolean;
  private audioFeedback?: {play: (cue: "realigned") => void} | null;
  private onRecenter?: (event: GestureRecenterTriggerEvent) => void;

  private lastOrientation: StoredOrientation | null = null;
  private pendingMove: PendingMove | null = null;
  private lastTriggerTimestamp = -Infinity;

  constructor(options: GestureRecenterOptions = {}) {
    this.maxIntervalMs = options.maxIntervalMs ?? 280;
    this.cooldownMs = options.cooldownMs ?? 800;
    this.targetFace = options.targetFace ?? 1; // Face 1 = R
    this.enabled = options.enabled ?? true;
    this.audioFeedback = options.audioFeedback;
    this.onRecenter = options.onRecenter;
  }

  /**
   * Records a gyro orientation sample.
   * Keeps track of the most recent orientation so that when a flick starts,
   * the undisturbed resting orientation immediately prior to the flick is preserved.
   */
  public observeOrientation(
    quaternion: OrientationQuaternion,
    coordinateFrame: OrientationCoordinateFrame,
    timestamp = Date.now(),
  ): void {
    this.lastOrientation = {quaternion, coordinateFrame, timestamp};
  }

  /**
   * Observes a smart cube move event.
   * If this move completes a rapid cycle on the target face within `maxIntervalMs`
   * (e.g. R -> R'), triggers the `onRecenter` callback and returns true.
   */
  public observeMove(
    moveEvent: Pick<SmartCubeMoveEvent, "face" | "direction" | "move"> & {
      timestamp?: number;
      localTimestamp?: number | null;
    },
  ): boolean {
    if (!this.enabled) {
      this.pendingMove = null;
      return false;
    }

    const now = moveEvent.localTimestamp ?? moveEvent.timestamp ?? Date.now();

    // Check cooldown lockout
    if (now - this.lastTriggerTimestamp < this.cooldownMs) {
      this.pendingMove = null;
      return false;
    }

    const faceMatches = this.targetFace === "any" || moveEvent.face === this.targetFace;

    // If we have a pending first move, check if this move completes the reversal
    if (this.pendingMove !== null) {
      const prev = this.pendingMove;
      const interval = now - prev.timestamp;

      if (
        interval > 0 &&
        interval <= this.maxIntervalMs &&
        prev.face === moveEvent.face &&
        prev.direction !== moveEvent.direction &&
        (this.targetFace === "any" || moveEvent.face === this.targetFace)
      ) {
        // Valid rapid flick-and-return cycle detected!
        this.lastTriggerTimestamp = now;
        this.pendingMove = null;

        const restingOrientation = prev.preOrientation
          ? {
              quaternion: prev.preOrientation.quaternion,
              coordinateFrame: prev.preOrientation.coordinateFrame,
            }
          : this.lastOrientation
            ? {
                quaternion: this.lastOrientation.quaternion,
                coordinateFrame: this.lastOrientation.coordinateFrame,
              }
            : null;

        const triggerEvent: GestureRecenterTriggerEvent = {
          face: moveEvent.face,
          move1: prev.move,
          move2: moveEvent.move,
          intervalMs: interval,
          timestamp: now,
          restingOrientation,
        };

        this.audioFeedback?.play("realigned");
        this.onRecenter?.(triggerEvent);
        return true;
      }

      // If it did not match, clear previous pending move
      this.pendingMove = null;
    }

    // Check if this move can begin a new rapid cycle
    if (faceMatches) {
      this.pendingMove = {
        face: moveEvent.face,
        direction: moveEvent.direction,
        move: moveEvent.move,
        timestamp: now,
        preOrientation: this.lastOrientation,
      };
    }

    return false;
  }

  /**
   * Resets internal pending move and cooldown state.
   */
  public reset(): void {
    this.pendingMove = null;
    this.lastTriggerTimestamp = -Infinity;
  }
}

export const createGestureRecenterDetector = (options?: GestureRecenterOptions): GestureRecenterDetector =>
  new GestureRecenterDetector(options);
