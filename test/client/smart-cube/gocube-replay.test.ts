import {describe, expect, test} from "vitest";

import fixture from "../../fixtures/gocube-yxz.json";
import {
  orientationCorrectionForTarget,
  orientationDistanceRadians,
  renderedDeviceOrientation,
  stabilizedOrientationCorrection,
  type OrientationCoordinateFrame,
  type OrientationQuaternion,
} from "../../../src/client/cube-gl";
import {
  appendOrientationProbe,
  averageOrientationProbes,
  consumeOrientationProbeRing,
  createOrientationProbeRing,
  type OrientationProbeRing,
} from "../../../src/client/smart-cube/orientation-probe-ring";
import {
  createStableOrientationTracker,
  observeStableOrientation,
  type StableOrientationTracker,
} from "../../../src/client/smart-cube/orientation-tracker";

type FixtureEvent =
  | {t: number; type: "GYRO"; quaternion: OrientationQuaternion; coordinateFrame: OrientationCoordinateFrame}
  | {t: number; type: "MOVE"; move: string};

const events = fixture as FixtureEvent[];

const identity: OrientationQuaternion = {x: 0, y: 0, z: 0, w: 1};
const policy = {capacity: 3, rotationDropThresholdDegrees: 5, dropFollowingSamples: 2};
const correctionErrorDivisor = 5;
const maximumTargetErrorRadians = 50 * Math.PI / 180;

/** A minimal, DOM-free mirror of the viewport's device-orientation bookkeeping. */
type ViewportState = {
  base: OrientationQuaternion | null;
  correctionTarget: OrientationQuaternion | null;
  frame: OrientationCoordinateFrame;
};

const stabilize = (
  viewport: ViewportState,
  measured: OrientationQuaternion,
  target: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
): {applied: boolean; targetErrorRadians: number | null} => {
  if (viewport.frame !== frame || !viewport.base) return {applied: false, targetErrorRadians: null};
  const priorCorrection = viewport.correctionTarget ?? identity;
  const rendered = renderedDeviceOrientation(viewport.base, priorCorrection, measured, frame);
  const targetErrorRadians = orientationDistanceRadians(rendered, target);
  viewport.correctionTarget = stabilizedOrientationCorrection(
    priorCorrection,
    viewport.base,
    measured,
    target,
    frame,
    correctionErrorDivisor,
  );
  return {applied: true, targetErrorRadians};
};

const reconcile = (
  viewport: ViewportState,
  measured: OrientationQuaternion,
  target: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
) => {
  if (viewport.frame !== frame || !viewport.base) {
    viewport.base = measured;
    viewport.frame = frame;
  }
  viewport.correctionTarget = orientationCorrectionForTarget(viewport.base, measured, target, frame);
};

const currentRendered = (
  viewport: ViewportState,
  measured: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
): OrientationQuaternion | null => {
  if (viewport.frame !== frame || !viewport.base) return null;
  return renderedDeviceOrientation(viewport.base, viewport.correctionTarget, measured, frame);
};

describe("real GoCube capture: U2, 720° spin, R2, 720° spin, F2, 720° spin, rest", () => {
  test("stays internally consistent and converges by the end of the capture", () => {
    let ring: OrientationProbeRing = createOrientationProbeRing();
    let tracker: StableOrientationTracker | null = null;
    let target: OrientationQuaternion = identity;
    const viewport: ViewportState = {base: null, correctionTarget: null, frame: "viewport"};

    const corrections: Array<{move: string; targetErrorDegrees: number}> = [];
    const regrips: Array<{kind: "confirmed" | "unconfirmed"; tokens?: string; target: OrientationQuaternion}> = [];

    for (const event of events) {
      if (event.type === "GYRO") {
        const probe = appendOrientationProbe(
          ring,
          {quaternion: event.quaternion, coordinateFrame: event.coordinateFrame, timestamp: event.t},
          policy,
        );
        ring = probe.ring;
        if (tracker === null) {
          tracker = createStableOrientationTracker(event.quaternion, event.coordinateFrame, "world");
        } else {
          const observed = observeStableOrientation(tracker, event.quaternion, event.coordinateFrame);
          tracker = observed.tracker;
          if (observed.tokens.length > 0) {
            target = observed.tracker.orientation;
            reconcile(viewport, event.quaternion, target, event.coordinateFrame);
            regrips.push({kind: "confirmed", tokens: observed.tokens.join(" "), target});
          }
        }
        continue;
      }

      // MOVE
      const measured = averageOrientationProbes(ring.probes);
      const frame = ring.probes.at(-1)?.coordinateFrame;
      const ringReady = Boolean(measured && frame && ring.discardFollowing === 0);
      if (!ringReady || !measured || !frame) continue;
      const rotationDropped = ring.rotationDropped;
      ring = consumeOrientationProbeRing(ring);
      const result = stabilize(viewport, measured, target, frame);
      if (result.applied && result.targetErrorRadians !== null) {
        corrections.push({move: event.move, targetErrorDegrees: result.targetErrorRadians * 180 / Math.PI});
      }
      if (result.applied && rotationDropped && result.targetErrorRadians !== null && result.targetErrorRadians > maximumTargetErrorRadians) {
        const activeTracker = tracker ?? createStableOrientationTracker(measured, frame, "world");
        const resolved = observeStableOrientation(activeTracker, measured, frame, -1, 1);
        if (resolved.tokens.length > 0) {
          target = resolved.tracker.orientation;
          tracker = resolved.tracker;
          reconcile(viewport, measured, target, frame);
          regrips.push({kind: "unconfirmed", target});
        }
      }
    }

    // Invariant that must always hold regardless of this specific capture: the
    // discrete tracker and the stabilization target can never disagree, since
    // every place either one changes updates both from the same call.
    expect(tracker).not.toBeNull();
    expect(tracker!.orientation).toEqual(target);

    // The ring only starts producing corrections once probes accumulate cleanly
    // after the initial handling settles; this capture's first double-turn
    // happens too early in the stream for that, so only the second and third
    // double-turns (four face moves total) get a correction each.
    expect(corrections).toHaveLength(4);
    expect(corrections.map((correction) => correction.move)).toEqual(["F", "F", "L", "L"]);

    // Every regrip in this capture — three deliberate 720° single-axis spins —
    // was caught by the confirm path (settled samples within its alignment
    // gate); the coarse nearest-cardinal fallback never had to guess. If a
    // future change makes the fallback fire on this real, unambiguous data,
    // that's a regression worth looking at even though the outcome may still
    // be correct.
    expect(regrips.every((regrip) => regrip.kind === "confirmed")).toBe(true);
    expect(regrips.map((regrip) => regrip.tokens)).toEqual(["y y", "y'", "y'", "y"]);

    // The final orientation reading, well after the last 720° spin settles,
    // should be a small residual — the view actually converges by the end of
    // this real capture rather than being left wildly off.
    const lastGyro = [...events].reverse().find((event): event is Extract<FixtureEvent, {type: "GYRO"}> => event.type === "GYRO")!;
    const finalRendered = currentRendered(viewport, lastGyro.quaternion, lastGyro.coordinateFrame);
    expect(finalRendered).not.toBeNull();
    const finalErrorDegrees = orientationDistanceRadians(finalRendered!, target) * 180 / Math.PI;
    expect(finalErrorDegrees).toBeLessThan(20);
  });
});
