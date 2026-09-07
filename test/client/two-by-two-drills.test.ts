import {describe, expect, test} from "vitest";

import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {twoByTwoDrillCases, twoByTwoPetrusDrillCases} from "../../src/client/two-by-two-drills";
import {selectTwoByTwoPetrusFrame, twoByTwoPhaseStatus, twoByTwoPetrusPhaseStatus} from "../../src/client/two-by-two-academy";

const apply = (algorithm: string) => {
  const solved = StateTypes.solved(2);
  const parsed = MoveParser.parse(2, algorithm);
  if (solved.TAG !== "Ok" || parsed.TAG !== "Ok") throw new Error("Test setup failed.");
  const result = MoveExecutor.applyAlg(solved._0, parsed._0);
  if (result.TAG !== "Ok") throw new Error("Could not create drill state.");
  return result._0;
};

describe("2×2 Academy drills", () => {
  test("provide replayable cases for every Beginner/Ortega phase", () => {
    expect(twoByTwoDrillCases.map(({family}) => family)).toEqual(["FirstLayer", "OLL", "PBL"]);
    const [firstLayer, oll, pbl] = twoByTwoDrillCases;
    expect(twoByTwoPhaseStatus(apply(firstLayer.scramble)).firstLayer).toBe(false);
    expect(twoByTwoPhaseStatus(apply(oll.scramble))).toMatchObject({firstLayer: true, orientLastLayer: false});
    expect(twoByTwoPhaseStatus(apply(pbl.scramble))).toMatchObject({firstLayer: true, orientLastLayer: true, permuteLastLayer: false});
  });
});

describe("2×2 Petrus-inspired Academy drills", () => {
  test("provide replayable cases for first square, back pair, and finish", () => {
    expect(twoByTwoPetrusDrillCases.map(({family}) => family)).toEqual(["FirstSquare", "BackPair", "Finish"]);
    const [firstSquare, backPair, finish] = twoByTwoPetrusDrillCases;
    const firstSquareState = apply(firstSquare.scramble);
    const backPairState = apply(backPair.scramble);
    const finishState = apply(finish.scramble);
    expect(twoByTwoPetrusPhaseStatus(firstSquareState, selectTwoByTwoPetrusFrame(firstSquareState)).firstSquare).toBe(false);
    expect(twoByTwoPetrusPhaseStatus(backPairState, selectTwoByTwoPetrusFrame(backPairState)))
      .toMatchObject({firstSquare: true, backPair: false});
    expect(twoByTwoPetrusPhaseStatus(finishState, selectTwoByTwoPetrusFrame(finishState)))
      .toMatchObject({firstSquare: true, backPair: true, finish: false});
  });
});
