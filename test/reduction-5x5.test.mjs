import {expect, test} from "vitest";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {inspectReduction5x5, planNextCentre5x5, planNextWingPair5x5, reduce5x5} from "../src/Solver/Reduction5x5.res.mjs";

test("inspects fixed-core 5×5 centre and wing milestones", () => {
  const solved = StateTypes.solved(5);
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  const inspection = inspectReduction5x5(solved._0);
  expect(inspection).toMatchObject({TAG: "Ok", _0: {xCentresComplete: 6, plusCentresComplete: 6, centreFacesComplete: 6, wingPairsMatched: 24, stage: "handoff"}});
});

test("projects a fully reduced 5×5 only after physical 3×3 validation", () => {
  const solved = StateTypes.solved(5);
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  const reduced = reduce5x5(solved._0);
  expect(reduced.TAG).toBe("Ok");
  if (reduced.TAG === "Ok") expect(reduced._0.state.size).toBe(3);
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

test("uses bounded setup turns when no one-turn centre hint exists", () => {
  const scrambled = MoveExecutor.parseAndApply(5, "2R 2F' 2D");
  expect(scrambled.TAG).toBe("Ok");
  if (scrambled.TAG !== "Ok") return;
  const guide = planNextCentre5x5(scrambled._0);
  expect(guide).toMatchObject({TAG: "Ok", _0: {before: 18, after: 48}});
  if (guide.TAG === "Ok") expect(guide._0.algorithm).toBe("2D' 2F 2R'");
});

test("returns a centre-preserving slice-cycle wing improvement", () => {
  const scrambled = MoveExecutor.parseAndApply(5, "2R U R' U' 2R'");
  expect(scrambled.TAG).toBe("Ok");
  if (scrambled.TAG !== "Ok") return;
  const guide = planNextWingPair5x5(scrambled._0);
  expect(guide.TAG).toBe("Ok");
  if (guide.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(scrambled._0, guide._0.alg);
  expect(replay.TAG).toBe("Ok");
  if (replay.TAG === "Ok") {
    expect(guide._0.after).toBeGreaterThan(guide._0.before);
    expect(inspectReduction5x5(replay._0)).toMatchObject({TAG: "Ok", _0: {centreFacesComplete: 6}});
  }
});
