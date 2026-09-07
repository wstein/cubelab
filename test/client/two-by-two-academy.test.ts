import {describe, expect, test} from "vitest";

import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {twoByTwoPhaseStatus} from "../../src/client/two-by-two-academy";

const apply = (algorithm: string) => {
  const solved = StateTypes.solved(2);
  const parsed = MoveParser.parse(2, algorithm);
  if (solved.TAG !== "Ok" || parsed.TAG !== "Ok") throw new Error("Test setup failed.");
  const result = MoveExecutor.applyAlg(solved._0, parsed._0);
  if (result.TAG !== "Ok") throw new Error("Test setup could not apply the algorithm.");
  return result._0;
};

describe("2×2 Beginner Academy phase contract", () => {
  test("keeps the first layer and corner orientation distinct from final permutation", () => {
    expect(twoByTwoPhaseStatus(apply(""))).toEqual({firstLayer: true, orientLastLayer: true, permuteLastLayer: true});
    expect(twoByTwoPhaseStatus(apply("U"))).toEqual({firstLayer: true, orientLastLayer: true, permuteLastLayer: false});
    expect(twoByTwoPhaseStatus(apply("R"))).toEqual({firstLayer: false, orientLastLayer: false, permuteLastLayer: false});
  });
});
