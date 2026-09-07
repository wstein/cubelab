import {describe, expect, test} from "vitest";

import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import {
  twoByTwoPhaseStatus,
  isMonochromeSolved2x2,
  planTwoByTwoPblFinish,
  planTwoByTwoOll,
  planTwoByTwoFirstLayer,
  planTwoByTwoBeginnerRoute,
  planTwoByTwoPetrusRoute,
  twoByTwoPetrusFrameLabel,
  twoByTwoPetrusPhaseStatus,
  verifyTwoByTwoPetrusRoute,
  verifyTwoByTwoBeginnerRoute,
} from "../../src/client/two-by-two-academy";

const apply = (algorithm: string) => {
  const solved = StateTypes.solved(2);
  const parsed = MoveParser.parse(2, algorithm);
  if (solved.TAG !== "Ok" || parsed.TAG !== "Ok") throw new Error("Test setup failed.");
  const result = MoveExecutor.applyAlg(solved._0, parsed._0);
  if (result.TAG !== "Ok") throw new Error("Test setup could not apply the algorithm.");
  return result._0;
};

const parse = (algorithm: string) => {
  const parsed = MoveParser.parse(2, algorithm);
  if (parsed.TAG !== "Ok") throw new Error("Test algorithm could not be parsed.");
  return parsed._0;
};

describe("2×2 Beginner Academy phase contract", () => {
  test("keeps the first layer and corner orientation distinct from final permutation", () => {
    expect(twoByTwoPhaseStatus(apply(""))).toEqual({firstLayer: true, orientLastLayer: true, permuteLastLayer: true});
    expect(twoByTwoPhaseStatus(apply("D"))).toEqual({firstLayer: true, orientLastLayer: true, permuteLastLayer: false});
    expect(twoByTwoPhaseStatus(apply("R"))).toEqual({firstLayer: false, orientLastLayer: false, permuteLastLayer: false});
  });

  test("accepts only routes whose three boundaries satisfy their named goals", () => {
    expect(verifyTwoByTwoBeginnerRoute(apply("D"), [parse(""), parse(""), parse("D'")]).ok).toBe(true);
    expect(verifyTwoByTwoBeginnerRoute(apply("R"), [parse(""), parse(""), parse("R'")])).toMatchObject({
      ok: false,
      phase: 1,
    });
  });

  test("uses the exact solver only for PBL after first layer and OLL are satisfied", async () => {
    const pblState = apply("D");
    const result = await planTwoByTwoPblFinish(pblState, async () => ({alg: parse("D'"), moveCount: 1}));
    expect(result).toMatchObject({ok: true, moveCount: 1});
    if (result.ok) expect(verifyTwoByTwoBeginnerRoute(pblState, result.phaseAlgorithms).ok).toBe(true);

    const premature = await planTwoByTwoPblFinish(apply("R"), async () => ({alg: parse("R'"), moveCount: 1}));
    expect(premature).toMatchObject({ok: false, message: expect.stringMatching(/first layer and OLL/i)});
  });

  test("finds an OLL route that restores the first layer", () => {
    const ollCase = apply("R D2 R' D' R D' R'");
    expect(twoByTwoPhaseStatus(ollCase)).toMatchObject({firstLayer: true, orientLastLayer: false});
    const plan = planTwoByTwoOll(ollCase);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const after = MoveExecutor.applyAlg(ollCase, plan.algorithm);
    expect(after.TAG).toBe("Ok");
    if (after.TAG === "Ok") expect(twoByTwoPhaseStatus(after._0)).toMatchObject({firstLayer: true, orientLastLayer: true});
  });

  test("finds a first-layer route before OLL and PBL planning", () => {
    ["R", "R D", "F R D"].forEach((scramble) => {
      const scrambled = apply(scramble);
      const plan = planTwoByTwoFirstLayer(scrambled);
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      const after = MoveExecutor.applyAlg(scrambled, plan.algorithm);
      expect(after.TAG).toBe("Ok");
      if (after.TAG === "Ok") expect(twoByTwoPhaseStatus(after._0).firstLayer).toBe(true);
    });
  });

  test("finds the white first layer for the reported 24-facelet setup", () => {
    const parsed = FaceletCodec.parse(2, "DURRDBLFUFRDFFRUBBDULLLB");
    expect(parsed.TAG).toBe("Ok");
    if (parsed.TAG !== "Ok") return;
    const plan = planTwoByTwoFirstLayer(parsed._0);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const after = MoveExecutor.applyAlg(parsed._0, plan.algorithm);
    expect(after.TAG).toBe("Ok");
    if (after.TAG === "Ok") expect(twoByTwoPhaseStatus(after._0).firstLayer).toBe(true);
  });

  test("composes first layer, OLL, and PBL into one verified route", async () => {
    const result = await planTwoByTwoBeginnerRoute(apply("D"), async () => ({alg: parse("D'"), moveCount: 1}));
    expect(result).toMatchObject({ok: true, moveCount: 1});
    if (result.ok) expect(verifyTwoByTwoBeginnerRoute(apply("D"), result.phaseAlgorithms).ok).toBe(true);
  });
});

describe("2×2 Petrus-inspired Academy phase contract", () => {
  test("locks one adaptive frame and keeps first square distinct from the back pair", () => {
    expect(twoByTwoPetrusFrameLabel(0)).toBe("ULB");
    expect(twoByTwoPetrusFrameLabel(4)).toBe("ULB");
    const solved = apply("");
    const status = twoByTwoPetrusPhaseStatus(solved, 0);
    expect(status).toEqual({firstSquare: true, backPair: true, finish: true});

    const firstSquareOnly = apply("D");
    expect(twoByTwoPetrusPhaseStatus(firstSquareOnly, 0)).toMatchObject({firstSquare: true, backPair: false, finish: false});
  });

  test("only accepts replayed phase boundaries in the selected frame", () => {
    expect(verifyTwoByTwoPetrusRoute(apply("D"), 0, [parse(""), parse("D'"), parse("")]).ok).toBe(true);
    expect(verifyTwoByTwoPetrusRoute(apply("R"), 3, [parse(""), parse(""), parse("R'")])).toMatchObject({
      ok: false,
      phase: 1,
    });
  });

  test("plans a locked-frame route and proves all three Petrus-inspired boundaries", async () => {
    const initial = apply("D");
    const result = await planTwoByTwoPetrusRoute(initial, async (state) => ({
      alg: isMonochromeSolved2x2(state) ? parse("") : parse("D'"),
      moveCount: isMonochromeSolved2x2(state) ? 0 : 1,
    }));
    expect(result).toMatchObject({ok: true, moveCount: 1});
    if (result.ok) {
      expect(verifyTwoByTwoPetrusRoute(initial, result.frame, result.phaseAlgorithms).ok).toBe(true);
    }
  });

  test("reaches both block boundaries before asking the exact finisher to solve a first-square case", async () => {
    const result = await planTwoByTwoPetrusRoute(apply("R F"), async () => ({alg: parse(""), moveCount: 0}));
    expect(result).toMatchObject({ok: false, message: expect.stringMatching(/Phase 3/i)});
  });
});
