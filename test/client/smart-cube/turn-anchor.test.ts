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
    let anchor = createTurnAnchor(identity, "viewport", 1_000);
    for (const now of [1_010, 1_020]) {
      const observed = observeTurnAnchor(anchor!, x(6), "viewport", now);
      anchor = observed.anchor;
      expect(observed.stable).toBe(false);
    }
    const settled = observeTurnAnchor(anchor!, x(6), "viewport", 1_030);
    expect(settled.stable).toBe(true);
    expect(settled.anchor).toBeNull();
  });

  test("rejects a regrip or a stale move window rather than correcting through it", () => {
    const anchor = createTurnAnchor(identity, "viewport", 1_000);
    expect(observeTurnAnchor(anchor, x(12), "viewport", 1_020)).toEqual({anchor: null, stable: false});
    expect(observeTurnAnchor(anchor, identity, "viewport", 1_800)).toEqual({anchor: null, stable: false});
  });
});
