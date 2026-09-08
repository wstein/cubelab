import {expect, test} from "vitest";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as Orbit64Codec from "../src/State/Orbit64Codec.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {findOneByThreeBar5x5, inspectReduction5x5, planNextCentre5x5, planNextWingPair5x5, reduce5x5} from "../src/Solver/Reduction5x5.res.mjs";

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

test("finds a centre improvement for the reported deep mixed-centre setup", () => {
  const scrambled = MoveExecutor.parseAndApply(5, "B' 2D' 2R 2R D2 2R' 2U' L 2U 2U2 L' 2U2 2R 2B' 2R' 2R2 D' 2R2");
  expect(scrambled.TAG).toBe("Ok");
  if (scrambled.TAG !== "Ok") return;
  const guide = planNextCentre5x5(scrambled._0);
  expect(guide).toMatchObject({TAG: "Ok", _0: {algorithm: "2R 2D 2B", before: 14, after: 29}});
});

test("finds a centre guide after the reported Orbit64 state and move history", () => {
  const initial = Orbit64Codec.decodeState("AQTY8UOpmHNJlT9FBk_ZM-dNfFIU3Q19NyWh05yV51Y");
  expect(initial.TAG).toBe("Ok");
  if (initial.TAG !== "Ok") return;
  const history = MoveParser.parseWithOptions(5, "Wide", "Modern", "B' 2D' 2R 2R D2 2R' 2U' L 2U 2U2 L' 2U2 2R 2B' 2R' 2R2 D' 2R2");
  expect(history.TAG).toBe("Ok");
  if (history.TAG !== "Ok") return;
  const state = MoveExecutor.applyAlg(initial._0, history._0);
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const guide = planNextCentre5x5(state._0);
  expect(guide).toMatchObject({TAG: "Ok", _0: {algorithm: "2L' F' 2L", before: 26, after: 28}});
  if (guide.TAG === "Ok") {
    const replay = MoveExecutor.applyAlg(state._0, guide._0.alg);
    expect(replay.TAG).toBe("Ok");
    expect(guide._0.after).toBeGreaterThan(guide._0.before);
  }
});

test("offers a labelled bar setup when exact centre placement cannot improve", () => {
  const initial = Orbit64Codec.decodeState("AQTY8UOpmHNJlT9FBk_ZM-dNfFIU3Q19NyWh05yV51Y");
  expect(initial.TAG).toBe("Ok");
  if (initial.TAG !== "Ok") return;
  const history = MoveParser.parseWithOptions(5, "Wide", "Modern", "B' 2D' 2R 2R D2 2R' 2U' L 2U 2U2 L' 2U2 2R 2B' 2R' 2R2 D' 2R2 2L' F' 2L 2R2 B 2R2 2R' B' 2R");
  expect(history.TAG).toBe("Ok");
  if (history.TAG !== "Ok") return;
  const state = MoveExecutor.applyAlg(initial._0, history._0);
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const guide = planNextCentre5x5(state._0);
  expect(guide).toMatchObject({TAG: "Ok", _0: {algorithm: "2R' U 2R", kind: "bar", before: 30, after: 30, barsBefore: 8, barsAfter: 9}});
});

test("searches an explicit replay-verified 1×3 bar commutator", () => {
  const initial = Orbit64Codec.decodeState("AQTY8UOpmHNJlT9FBk_ZM-dNfFIU3Q19NyWh05yV51Y");
  expect(initial.TAG).toBe("Ok");
  if (initial.TAG !== "Ok") return;
  const history = MoveParser.parseWithOptions(5, "Wide", "Modern", "B' 2D' 2R 2R D2 2R' 2U' L 2U 2U2 L' 2U2 2R 2B' 2R' 2R2 D' 2R2 2L' F' 2L 2R2 B 2R2 2R' B' 2R");
  expect(history.TAG).toBe("Ok");
  if (history.TAG !== "Ok") return;
  const state = MoveExecutor.applyAlg(initial._0, history._0);
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const guide = findOneByThreeBar5x5(state._0);
  expect(guide).toMatchObject({TAG: "Ok", _0: {kind: "bar"}});
  if (guide.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(state._0, guide._0.alg);
  expect(replay.TAG).toBe("Ok");
  expect(guide._0.barsAfter).toBeGreaterThan(guide._0.barsBefore);
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
