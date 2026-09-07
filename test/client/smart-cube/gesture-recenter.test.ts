import {describe, expect, test} from "vitest";

import {
  createGestureRecenterDetector,
  type GestureRecenterTriggerEvent,
} from "../../../src/client/smart-cube/gesture-recenter";

describe("gesture recenter detector", () => {
  test("detects rapid R -> R' cycle within 250ms", () => {
    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: 1,
      maxIntervalMs: 280,
      onRecenter: (e) => triggers.push(e),
    });

    detector.observeOrientation({x: 0, y: 0, z: 0, w: 1}, "gocube-wire", 1000);

    // R at t=1100
    const move1 = detector.observeMove({
      face: 1,
      direction: 0,
      move: "R",
      localTimestamp: 1100,
    });
    expect(move1).toBe(false);
    expect(triggers.length).toBe(0);

    // R' at t=1280 (interval 180ms)
    const move2 = detector.observeMove({
      face: 1,
      direction: 1,
      move: "R'",
      localTimestamp: 1280,
    });
    expect(move2).toBe(true);
    expect(triggers.length).toBe(1);
    expect(triggers[0]!.face).toBe(1);
    expect(triggers[0]!.move1).toBe("R");
    expect(triggers[0]!.move2).toBe("R'");
    expect(triggers[0]!.intervalMs).toBe(180);
    expect(triggers[0]!.restingOrientation?.quaternion).toEqual({x: 0, y: 0, z: 0, w: 1});
  });

  test("detects rapid R' -> R reverse flick cycle", () => {
    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: 1,
      maxIntervalMs: 250,
      onRecenter: (e) => triggers.push(e),
    });

    detector.observeOrientation({x: 0.1, y: 0.2, z: 0.3, w: 0.9}, "gocube-wire", 2000);

    detector.observeMove({face: 1, direction: 1, move: "R'", localTimestamp: 2100});
    const triggered = detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 2220});

    expect(triggered).toBe(true);
    expect(triggers.length).toBe(1);
    expect(triggers[0]!.move1).toBe("R'");
    expect(triggers[0]!.move2).toBe("R");
    expect(triggers[0]!.intervalMs).toBe(120);
    expect(triggers[0]!.restingOrientation?.quaternion).toEqual({x: 0.1, y: 0.2, z: 0.3, w: 0.9});
  });

  test("rejects slow face moves exceeding maxIntervalMs", () => {
    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: 1,
      maxIntervalMs: 250,
      onRecenter: (e) => triggers.push(e),
    });

    detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 1000});
    // Interval 350ms > 250ms
    const triggered = detector.observeMove({face: 1, direction: 1, move: "R'", localTimestamp: 1350});

    expect(triggered).toBe(false);
    expect(triggers.length).toBe(0);
  });

  test("rejects moves on different faces", () => {
    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: 1,
      maxIntervalMs: 250,
      onRecenter: (e) => triggers.push(e),
    });

    detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 1000});
    // Face 2 (F) instead of Face 1 (R)
    const triggered = detector.observeMove({face: 2, direction: 1, move: "F'", localTimestamp: 1150});

    expect(triggered).toBe(false);
    expect(triggers.length).toBe(0);
  });

  test("rejects moves in the same direction (e.g. R then R)", () => {
    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: 1,
      maxIntervalMs: 250,
      onRecenter: (e) => triggers.push(e),
    });

    detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 1000});
    const triggered = detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 1150});

    expect(triggered).toBe(false);
    expect(triggers.length).toBe(0);
  });

  test("enforces cooldown to prevent rapid repeated triggering", () => {
    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: 1,
      maxIntervalMs: 250,
      cooldownMs: 800,
      onRecenter: (e) => triggers.push(e),
    });

    // Flick 1 at t=1000 -> 1150
    detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 1000});
    expect(detector.observeMove({face: 1, direction: 1, move: "R'", localTimestamp: 1150})).toBe(true);
    expect(triggers.length).toBe(1);

    // Flick 2 at t=1300 -> 1450 (only 300ms after last trigger, within 800ms cooldown)
    detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 1300});
    expect(detector.observeMove({face: 1, direction: 1, move: "R'", localTimestamp: 1450})).toBe(false);
    expect(triggers.length).toBe(1);

    // Flick 3 at t=2100 -> 2250 (950ms after last trigger, past 800ms cooldown)
    detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 2100});
    expect(detector.observeMove({face: 1, direction: 1, move: "R'", localTimestamp: 2250})).toBe(true);
    expect(triggers.length).toBe(2);
  });

  test("preserves resting orientation from before the flick started", () => {
    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: 1,
      maxIntervalMs: 280,
      onRecenter: (e) => triggers.push(e),
    });

    // Resting pose before flick
    detector.observeOrientation({x: 0.5, y: 0.5, z: 0.5, w: 0.5}, "gocube-wire", 1000);

    // Flick starts
    detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 1050});

    // During flick, hand wobbles and gyro changes
    detector.observeOrientation({x: 0.9, y: 0.1, z: 0.1, w: 0.1}, "gocube-wire", 1120);

    // Flick completes
    detector.observeMove({face: 1, direction: 1, move: "R'", localTimestamp: 1200});

    expect(triggers.length).toBe(1);
    // Must be the pre-flick resting orientation, not the wobbled orientation!
    expect(triggers[0]!.restingOrientation?.quaternion).toEqual({x: 0.5, y: 0.5, z: 0.5, w: 0.5});
  });

  test("supports 'any' face when configured", () => {
    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: "any",
      maxIntervalMs: 250,
      onRecenter: (e) => triggers.push(e),
    });

    // U -> U' (Face 0)
    detector.observeMove({face: 0, direction: 0, move: "U", localTimestamp: 1000});
    expect(detector.observeMove({face: 0, direction: 1, move: "U'", localTimestamp: 1180})).toBe(true);
    expect(triggers.length).toBe(1);
    expect(triggers[0]!.face).toBe(0);
  });

  test("can be disabled during timed solves or inspections", () => {
    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: 1,
      enabled: false,
      onRecenter: (e) => triggers.push(e),
    });

    detector.observeMove({face: 1, direction: 0, move: "R", localTimestamp: 1000});
    expect(detector.observeMove({face: 1, direction: 1, move: "R'", localTimestamp: 1150})).toBe(false);
    expect(triggers.length).toBe(0);
  });

  test("replays real diagnostic trace flick cycles accurately", () => {
    const userTraceMoves = [
      // Pair 1 (180ms)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788754443},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788754623},
      // Pair 2 (242ms, +871ms after pair 1)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788755494},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788755736},
      // Pair 3 (178ms, +720ms after pair 2)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788756456},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788756634},
      // Pair 4 (153ms, +658ms after pair 3)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788757292},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788757445},
      // Pair 5 (236ms, +3061ms pause)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788760506},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788760742},
      // Pair 6 (205ms, +726ms)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788761468},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788761673},
      // Pair 7 (299ms - slightly over 280ms threshold)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788762573},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788762872},
      // Pair 8 (176ms)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788763656},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788763832},
      // Pair 9 (117ms)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788764406},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788764523},
      // Pair 10 (153ms)
      {face: 1, direction: 0, move: "R", localTimestamp: 1788788765543},
      {face: 1, direction: 1, move: "R'", localTimestamp: 1788788765696},
    ];

    const triggers: GestureRecenterTriggerEvent[] = [];
    const detector = createGestureRecenterDetector({
      targetFace: 1,
      maxIntervalMs: 280,
      cooldownMs: 500, // accommodate natural testing cadence
      onRecenter: (e) => triggers.push(e),
    });

    for (const move of userTraceMoves) {
      detector.observeMove(move);
    }

    // Every pair with interval <= 280ms triggered cleanly!
    // Pair 7 was 299ms, so 9 out of 10 pairs triggered.
    expect(triggers.length).toBe(9);
    expect(triggers.every((t) => t.face === 1 && t.move1 === "R" && t.move2 === "R'")).toBe(true);
  });
});
