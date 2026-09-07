import {expect, test} from "vitest";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {inspectReduction5x5, planNextCentre5x5} from "../src/Solver/Reduction5x5.ts";

test("inspects fixed-core 5×5 centre and wing milestones", () => {
  const solved = StateTypes.solved(5);
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  const inspection = inspectReduction5x5(solved._0);
  expect(inspection).toMatchObject({TAG: "Ok", _0: {xCentresComplete: 6, plusCentresComplete: 6, centreFacesComplete: 6, wingPairsMatched: 24, stage: "handoff"}});
});

test("returns a replay-verified inner-slice centre improvement", () => {
  const scrambled = MoveExecutor.parseAndApply(5, "2R");
  expect(scrambled.TAG).toBe("Ok");
  if (scrambled.TAG !== "Ok") return;
  const guide = planNextCentre5x5(scrambled._0);
  expect(guide.TAG).toBe("Ok");
  if (guide.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(scrambled._0, guide._0.alg);
  expect(replay.TAG).toBe("Ok");
  if (replay.TAG === "Ok") expect(guide._0.after).toBeGreaterThan(guide._0.before);
});
