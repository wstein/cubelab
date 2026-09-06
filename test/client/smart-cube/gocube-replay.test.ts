import {describe, expect, test} from "vitest";

import fixture from "../../fixtures/gocube-yxz.json";
import {
  orientationCorrectionForTarget,
  orientationDistanceRadians,
  deviceOrientationDelta,
  multiplyQuaternions,
  type OrientationCoordinateFrame,
  type OrientationQuaternion,
} from "../../../src/client/cube-gl";
import {
  createStableOrientationTracker,
  observeThresholdOrientation,
  type StableOrientationTracker,
} from "../../../src/client/smart-cube/orientation-tracker";

type FixtureEvent =
  | {t: number; type: "GYRO"; quaternion: OrientationQuaternion; coordinateFrame: OrientationCoordinateFrame}
  | {t: number; type: "MOVE"; move: string};

const events = fixture as FixtureEvent[];
const identity: OrientationQuaternion = {x: 0, y: 0, z: 0, w: 1};
const REGRIP_THRESHOLD_DEGREES = 65;

/** A minimal, DOM-free mirror of reconcileDeviceOrientation's bookkeeping — the
 * only device-orientation write path left once the gyro view stops mirroring
 * live orientation and only reacts to confirmed regrips. */
type ViewportState = {
  base: OrientationQuaternion | null;
  correction: OrientationQuaternion | null;
  frame: OrientationCoordinateFrame;
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
  viewport.correction = orientationCorrectionForTarget(viewport.base, measured, target, frame);
};

const rendered = (
  viewport: ViewportState,
  measured: OrientationQuaternion,
  frame: OrientationCoordinateFrame,
): OrientationQuaternion | null => {
  if (viewport.frame !== frame || !viewport.base) return null;
  const raw = deviceOrientationDelta(viewport.base, measured, frame, "world");
  return multiplyQuaternions(viewport.correction ?? identity, raw);
};

describe("real GoCube capture: U2, 720° spin, R2, 720° spin, F2, 720° spin, rest", () => {
  test("detects every 90° step of each spin immediately, with no precision requirement", () => {
    let tracker: StableOrientationTracker | null = null;
    const viewport: ViewportState = {base: null, correction: null, frame: "viewport"};
    const regrips: Array<{tokens: string; target: OrientationQuaternion}> = [];
    let sampleCount = 0;
    let sampleCountAtLastRegrip = 0;

    for (const event of events) {
      if (event.type !== "GYRO") continue;
      sampleCount += 1;
      if (tracker === null) {
        tracker = createStableOrientationTracker(event.quaternion, event.coordinateFrame, "world");
        continue;
      }
      const before = viewport.correction;
      const observed = observeThresholdOrientation(tracker, event.quaternion, event.coordinateFrame, REGRIP_THRESHOLD_DEGREES, event.t);
      tracker = observed.tracker;
      if (observed.tokens.length === 0) {
        // No regrip on this sample: the view must be untouched, not nudged.
        expect(viewport.correction).toBe(before);
        continue;
      }
      reconcile(viewport, event.quaternion, observed.tracker.orientation, event.coordinateFrame);
      regrips.push({tokens: observed.tokens.join(" "), target: observed.tracker.orientation});
      sampleCountAtLastRegrip = sampleCount;

      // The whole point of reconciling instead of nudging: the display must
      // land exactly on the new target the instant the regrip confirms, not
      // approach it gradually over further samples.
      const justReconciled = rendered(viewport, event.quaternion, event.coordinateFrame)!;
      expect(orientationDistanceRadians(justReconciled, observed.tracker.orientation)).toBeCloseTo(0, 6);
    }

    // Unlike the old dwell-based confirm (which waited for each spin to fully
    // stop before emitting one token for the whole thing), the threshold
    // detector fires on every real ~90° of travel: 7 steps through the first
    // spin, 8 through the second, 8 through the third (23 total, close to the
    // physically ideal 3×720°/90°=24) — cleanly grouped by axis, with no
    // direction reversals or cross-axis noise despite never requiring the
    // hand to land precisely on any of them. The token order here (y', z', x)
    // reflects the 180° around Y basis flip and inverted sensor rotation direction
    // on gocube-wire (see deviceOrientationDelta).
    //
    // The tracker uses "world" deltaFrame. "local" was tried (reasoning that
    // x/y/z are body-frame cube notation, so a token should always mean
    // "rotate about the cube's own current axis") and reverted: live testing
    // showed it mislabelling every turn, not just ones after a prior regrip.
    // What this tracker needs instead is "world": the camera is fixed in the
    // room, so tracking how the cube has reoriented relative to that fixed
    // viewpoint — not relative to the cube's own constantly-moving body
    // frame — is what determines how to re-render its true appearance.
    //
    // This token count is fewer than an earlier version of this test
    // expected (29): rebasing to the raw triggering sample means the very
    // first confirm in a continuous spin is genuinely allowed to land as
    // early as the threshold (65°), but every subsequent one within the same
    // unbroken motion must make up the shortfall — pendingCarryoverDegrees on
    // the tracker folds each confirm's undershoot into the next threshold
    // check, so the *cumulative* rotation between confirms averages back out
    // to a real 90°, not 65°. Without that, this fired every ~65° indefinitely
    // instead of catching up to the true 90°-spaced grid (verified directly: a
    // clean synthetic 360° sweep fired 5 times, not the correct 4).
    const tokens = regrips.flatMap((regrip) => regrip.tokens.split(" "));
    expect(tokens).toEqual([
      ...Array(7).fill("y'"),
      ...Array(8).fill("z'"),
      ...Array(8).fill("x"),
    ]);

    // The capture ends several seconds into "rest" after the last spin. This
    // is where threshold-crossing trades away something the old dwell-based
    // confirm guaranteed: firing the instant cumulative rotation crosses
    // REGRIP_THRESHOLD_DEGREES means the locked sample can still be mid-motion
    // if the hand keeps settling afterward, so a real (if bounded) residual
    // can remain until the *next* regrip corrects it. That's the deliberate
    // trade for never missing a regrip that lands imprecisely: bounded
    // settle-in error, rather than an unbounded chance of no detection at all.
    expect(sampleCount - sampleCountAtLastRegrip).toBeGreaterThan(50);
    const lastGyro = [...events].reverse().find((event): event is Extract<FixtureEvent, {type: "GYRO"}> => event.type === "GYRO")!;
    const finalRendered = rendered(viewport, lastGyro.quaternion, lastGyro.coordinateFrame)!;
    const finalTarget = regrips.at(-1)!.target;
    const restErrorDegrees = orientationDistanceRadians(finalRendered, finalTarget) * 180 / Math.PI;
    expect(restErrorDegrees).toBeLessThan(REGRIP_THRESHOLD_DEGREES);
  });
});
