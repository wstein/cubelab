import {describe, expect, test} from "bun:test";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import {evaluateAlgorithm, formatStep, isSingleStepExtension, MAX_PLAYBACK_STEPS} from "../../src/client/playback";

describe("algorithm playback timeline", () => {
  test("expands composite algorithms into labeled canonical states", () => {
    const result = evaluateAlgorithm(3, "Wide", "Modern", "[R, U]");
    expect(result.TAG).toBe("Ok");
    if (result.TAG !== "Ok") return;
    expect(result._0.labels).toEqual(["R", "U", "R'", "U'"]);
    expect(result._0.states).toHaveLength(5);
    expect(FaceletCodec.render(result._0.finalState)).toBe(
      FaceletCodec.render(result._0.states?.at(-1)),
    );
  });

  test("formats ranges, slices, rotations, and normalized turns", () => {
    expect(formatStep({move: {TAG: "FaceTurn", _0: "R", _1: {from_: 1, to_: 3}}, turns: 1})).toBe("3Rw");
    expect(formatStep({move: {TAG: "FaceTurn", _0: "F", _1: {from_: 2, to_: 3}}, turns: 2})).toBe("2-3Fw2");
    expect(formatStep({move: {TAG: "SliceTurn", _0: "M"}, turns: -1})).toBe("M'");
    expect(formatStep({move: {TAG: "Rotation", _0: "X"}, turns: 6})).toBe("x2");
  });

  test("detects only a single appended expanded move", () => {
    const one = evaluateAlgorithm(3, "Wide", "Modern", "R");
    const two = evaluateAlgorithm(3, "Wide", "Modern", "R U");
    const changed = evaluateAlgorithm(3, "Wide", "Modern", "R F");
    expect(one.TAG).toBe("Ok");
    expect(two.TAG).toBe("Ok");
    expect(changed.TAG).toBe("Ok");
    if (one.TAG === "Ok" && two.TAG === "Ok" && changed.TAG === "Ok") {
      expect(isSingleStepExtension(one._0, two._0)).toBe(true);
      expect(isSingleStepExtension(two._0, changed._0)).toBe(false);
    }
  });

  test("keeps final conversion but omits oversized playback state caches", () => {
    const result = evaluateAlgorithm(3, "Wide", "Modern", `(R)${MAX_PLAYBACK_STEPS + 1}`);
    expect(result.TAG).toBe("Ok");
    if (result.TAG === "Ok") {
      expect(result._0.steps).toHaveLength(MAX_PLAYBACK_STEPS + 1);
      expect(result._0.states).toBeNull();
    }
  });
});
