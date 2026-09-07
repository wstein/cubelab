import {describe, expect, test} from "vitest";

import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {
  twoByTwoPhaseStatus,
  planTwoByTwoPblFinish,
  planTwoByTwoOll,
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
    expect(twoByTwoPhaseStatus(apply("U"))).toEqual({firstLayer: true, orientLastLayer: true, permuteLastLayer: false});
    expect(twoByTwoPhaseStatus(apply("R"))).toEqual({firstLayer: false, orientLastLayer: false, permuteLastLayer: false});
  });

  test("accepts only routes whose three boundaries satisfy their named goals", () => {
    expect(verifyTwoByTwoBeginnerRoute(apply("U"), [parse(""), parse(""), parse("U'")]).ok).toBe(true);
    expect(verifyTwoByTwoBeginnerRoute(apply("R"), [parse(""), parse(""), parse("R'")])).toMatchObject({
      ok: false,
      phase: 1,
    });
  });

  test("uses the exact solver only for PBL after first layer and OLL are satisfied", async () => {
    const pblState = apply("U");
    const result = await planTwoByTwoPblFinish(pblState, async () => ({alg: parse("U'"), moveCount: 1}));
    expect(result).toMatchObject({ok: true, moveCount: 1});
    if (result.ok) expect(verifyTwoByTwoBeginnerRoute(pblState, result.phaseAlgorithms).ok).toBe(true);

    const premature = await planTwoByTwoPblFinish(apply("R"), async () => ({alg: parse("R'"), moveCount: 1}));
    expect(premature).toMatchObject({ok: false, message: expect.stringMatching(/first layer and OLL/i)});
  });

  test("finds an OLL route that restores the first layer", () => {
    const ollCase = apply("R U2 R' U' R U' R'");
    expect(twoByTwoPhaseStatus(ollCase)).toMatchObject({firstLayer: true, orientLastLayer: false});
    const plan = planTwoByTwoOll(ollCase);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const after = MoveExecutor.applyAlg(ollCase, plan.algorithm);
    expect(after.TAG).toBe("Ok");
    if (after.TAG === "Ok") expect(twoByTwoPhaseStatus(after._0)).toMatchObject({firstLayer: true, orientLastLayer: true});
  });
});
