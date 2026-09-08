import {expect, test} from "vitest";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as Orbit64Codec from "../src/State/Orbit64Codec.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {findL2CRelation5x5, findOneByThreeBar5x5, inspectReduction5x5, planOLLParityRepair5x5, planPLLParityRepair5x5, planNextCentre5x5, planNextWingPair5x5, reduce5x5, solveXCentreCycle5x5} from "../src/Solver/Reduction5x5.res.mjs";

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

test("refuses a 5×5 parity repair when the reduced state has no parity case", () => {
  const solved = StateTypes.solved(5);
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  expect(planOLLParityRepair5x5(solved._0)).toMatchObject({TAG: "Error", _0: {message: "No 5×5 OLL parity repair is needed."}});
  expect(planPLLParityRepair5x5(solved._0)).toMatchObject({TAG: "Error", _0: {message: "No 5×5 PLL parity repair is needed."}});
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
  const state = FaceletCodec.parse(5, "LFUFLBUUULFUUUFBUUUBBBRLRDDLDFRRRRFFRRRUURDRLUFBDDDRDUFUFFFUBFFFRBFFFLDLBUFLDUFRRDDDLUDDLDRDDDRBBBFLBUDURLLRLRLLLLLDBLLDUDLBFURFUUDLBBBRBBBDFBBBFBRRLR");
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const guide = findOneByThreeBar5x5(state._0);
  expect(guide).toMatchObject({TAG: "Ok", _0: {kind: "bar", before: 43, after: 43, barsBefore: 26, barsAfter: 27}});
  if (guide.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(state._0, guide._0.alg);
  expect(replay.TAG).toBe("Ok");
  expect(guide._0.barsAfter).toBeGreaterThan(guide._0.barsBefore);
});

test("uses a buffered centre 3-cycle when only a whole centre face can advance", () => {
  const state = FaceletCodec.parse(5, "LFUFLBUUULFUUUFBUUUBBBRLRDDLDFRRRRFFRRRUURDRLUFBDDDRDUFUFFFUBFFFRBFFFLDLBUFLDUFRRDDDLUDDLDRDDDRBBBFLBUDURLLRLRLLLLLDBLLDUDLBFURFUUDLBBBRBBBDFBBBFBRRLR");
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const guide = planNextCentre5x5(state._0);
  expect(guide).toMatchObject({TAG: "Ok", _0: {algorithm: "2R U 2B U' 2R' U 2B' U'", kind: "xCycle", before: 43, after: 43}});
  if (guide.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(state._0, guide._0.alg);
  expect(replay.TAG).toBe("Ok");
  if (replay.TAG === "Ok") expect(inspectReduction5x5(replay._0)).toMatchObject({TAG: "Ok", _0: {centreFacesComplete: 3}});
});

test("solves the reported last-two-centres relation with a restored wing buffer", () => {
  const state = FaceletCodec.parse(5, "UDLBBBUUULFUUUFBUUUBBBRLRDDLDLRRRRBFRRRUURRRFUFBDLDRDUFUFFFUBFFFRFFFFLDLBUFLDUFRRDDDLUDDBDRDDDRDLUBFBUDURULLLRBLLLLFLLLDLDLBFULDFRDBBBFFBBDRRBBBRULRFB");
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const guide = findL2CRelation5x5(state._0);
  expect(guide).toMatchObject({TAG: "Ok", _0: {algorithm: "2R' B U2 M U2 M' B' 2R", kind: "l2c", before: 46, after: 48}});
  if (guide.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(state._0, guide._0.alg);
  expect(replay).toMatchObject({TAG: "Ok"});
  if (replay.TAG === "Ok") expect(inspectReduction5x5(replay._0)).toMatchObject({TAG: "Ok", _0: {centreFacesComplete: 6, xCentresComplete: 6, plusCentresComplete: 6}});
  expect(planNextCentre5x5(state._0)).toMatchObject({TAG: "Ok", _0: {algorithm: "2R' B U2 M U2 M' B' 2R", kind: "l2c", before: 46, after: 48}});
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

test("finds an 8-move X-centre commutator for the reported endgame state", () => {
  const state = Orbit64Codec.decodeState("Aeqx8Vluxg8M8JeJaRG-X2TAv76y6Xw7skl252dK-s4");
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const cycle = solveXCentreCycle5x5(state._0);
  expect(cycle).toMatchObject({TAG: "Ok", _0: {algorithm: "2U' L 2D' L' 2U L 2D L'", kind: "xCycle", before: 38, after: 41}});
  const plan = planNextCentre5x5(state._0);
  expect(plan).toMatchObject({TAG: "Ok", _0: {algorithm: "2U' L 2D' L' 2U L 2D L'", kind: "xCycle", before: 38, after: 41}});
});
