import {describe, expect, test} from "bun:test";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {buildTimeline, evaluateAlgorithm, formatStep, isSingleStepExtension, MAX_PLAYBACK_STEPS} from "../../src/client/playback";

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

  test("retains expanded pauses as state-neutral playback steps", () => {
    const result = evaluateAlgorithm(3, "Wide", "Modern", "(R . U)2 /* inspect */");
    expect(result.TAG).toBe("Ok");
    if (result.TAG !== "Ok") return;
    expect(result._0.labels).toEqual(["R", "Pause", "U", "R", "Pause", "U"]);
    expect(result._0.steps.filter((entry) => entry.step === undefined)).toHaveLength(2);
    expect(result._0.states).toHaveLength(7);
    expect(result._0.states?.[1]).toBe(result._0.states?.[2]);
  });

  test("retains timestamp duration and labels it in the tape timeline", () => {
    const result = evaluateAlgorithm(3, "Wide", "Modern", "R @1.3s U");
    expect(result.TAG).toBe("Ok");
    if (result.TAG !== "Ok") return;
    expect(result._0.labels).toEqual(["R", "@1.3s", "U"]);
    expect(result._0.steps[1].durationMs).toBe(1300);
    expect(result._0.states?.[1]).toBe(result._0.states?.[2]);
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

  test("builds a solution timeline from an arbitrary recognized state", () => {
    const initial = evaluateAlgorithm(3, "Wide", "Modern", "R U");
    const solution = evaluateAlgorithm(3, "Wide", "Modern", "U' R'");
    expect(initial.TAG).toBe("Ok");
    expect(solution.TAG).toBe("Ok");
    if (initial.TAG !== "Ok" || solution.TAG !== "Ok") return;
    const timeline = buildTimeline(initial._0.finalState, solution._0.alg);
    expect(timeline.TAG).toBe("Ok");
    if (timeline.TAG === "Ok") {
      expect(FaceletCodec.render(timeline._0.finalState)).toBe(FaceletCodec.render(StateTypes.solved(3)._0));
      expect(timeline._0.labels).toEqual(["U'", "R'"]);
    }
  });
});
