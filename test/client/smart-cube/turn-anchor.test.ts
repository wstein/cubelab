import {describe, expect, test} from "vitest";

import {
  createTurnAnchor,
  observeTurnAnchor,
} from "../../../src/client/smart-cube/turn-anchor";

const identity = {x: 0, y: 0, z: 0, w: 1};
const x = (degrees: number) => ({
  x: Math.sin(degrees * Math.PI / 360), y: 0, z: 0, w: Math.cos(degrees * Math.PI / 360),
});

describe("smart-cube turn anchors", () => {
  test("uses several near-still samples after a face turn before stabilizing", () => {
    let anchor = createTurnAnchor(identity, identity, "viewport", 1_000);
    for (const now of [1_010, 1_020]) {
      const observed = observeTurnAnchor(anchor!, x(6), "viewport", now);
      anchor = observed.anchor;
      expect(observed.stable).toBe(false);
    }
    const settled = observeTurnAnchor(anchor!, x(9), "viewport", 1_030);
    expect(settled.stable).toBe(true);
    expect(settled.anchor).toBeNull();
    expect(settled.target).toEqual(identity);
    expect(settled.settledOrientation?.x).toBeCloseTo(x(7).x, 2);
  });

  test("rejects a regrip or a stale move window rather than correcting through it", () => {
    const anchor = createTurnAnchor(identity, identity, "viewport", 1_000);
    expect(observeTurnAnchor(anchor, x(16), "viewport", 1_020)).toMatchObject({stable: false, reason: "pending"});
    expect(observeTurnAnchor(anchor, x(25), "viewport", 1_020)).toMatchObject({anchor: null, target: null, stable: false, reason: "moved"});
    expect(observeTurnAnchor(anchor, identity, "viewport", 1_800)).toMatchObject({anchor: null, target: null, stable: false, reason: "expired"});
  });

  test("expires at the 200 ms post-turn boundary", () => {
    const anchor = createTurnAnchor(identity, identity, "viewport", 1_000, 200);
    expect(observeTurnAnchor(anchor, identity, "viewport", 1_200)).toMatchObject({stable: false, reason: "pending"});
    expect(observeTurnAnchor(anchor, identity, "viewport", 1_201)).toMatchObject({anchor: null, reason: "expired"});
  });

  test("uses ten degrees as a hard motion veto for a post-turn window", () => {
    const anchor = createTurnAnchor(identity, identity, "viewport", 1_000, 200);
    expect(observeTurnAnchor(anchor, x(10), "viewport", 1_030, 10 * Math.PI / 180)).toMatchObject({reason: "pending"});
    expect(observeTurnAnchor(anchor, x(10.1), "viewport", 1_030, 10 * Math.PI / 180)).toMatchObject({anchor: null, reason: "moved"});
  });
});
