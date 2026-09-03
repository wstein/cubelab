import assert from "node:assert/strict";
import {test} from "vitest";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import * as TwoPhaseSolver from "../src/Solver/TwoPhaseSolver.res.mjs";

const apply = (algorithm) => {
  const result = MoveExecutor.parseAndApply(3, algorithm);
  assert.equal(result.TAG, "Ok", result._0);
  return result._0;
};

test("two-phase membership identifies the G1 subgroup", () => {
  const solved = StateTypes.solved(3)._0;
  assert.equal(TwoPhaseSolver.isPhase1Solved(solved), true);
  assert.equal(TwoPhaseSolver.isPhase1Solved(apply("U R2 F2 D'")), true);
  assert.equal(TwoPhaseSolver.isPhase1Solved(apply("R")), false);
  assert.equal(TwoPhaseSolver.isPhase1Solved(apply("F")), false);
});

test("two-phase solver returns the empty optimal solution for solved input", () => {
  const result = TwoPhaseSolver.solve(StateTypes.solved(3)._0);
  assert.equal(result.TAG, "Ok");
  assert.deepEqual(result._0.alg, []);
  assert.equal(result._0.moveCount, 0);
});

test("two-phase solver replay-verifies a one-turn solution", () => {
  const scrambled = apply("R");
  const result = TwoPhaseSolver.solve(scrambled);
  assert.equal(result.TAG, "Ok");
  assert.ok(result._0.moveCount > 0);
  assert.ok(result._0.moveCount <= 24);
  const replay = MoveExecutor.applyAlg(scrambled, result._0.alg);
  assert.equal(replay.TAG, "Ok");
  assert.deepEqual(replay._0, StateTypes.solved(3)._0);
});

test("two-phase solver describes invalid inputs instead of masking them", () => {
  const result = TwoPhaseSolver.solve(StateTypes.solved(2)._0);
  assert.equal(result.TAG, "Error");
  assert.match(TwoPhaseSolver.describeError(result._0), /only 3×3 cubes/);
});

test("two-phase IDA* solves beyond the former shallow search limit", () => {
  const scrambled = apply("R U F L D B R");
  const result = TwoPhaseSolver.solve(scrambled);
  assert.equal(result.TAG, "Ok");
  assert.ok(result._0.moveCount > 0);
  assert.ok(result._0.moveCount <= 24);
  const replay = MoveExecutor.applyAlg(scrambled, result._0.alg);
  assert.equal(replay.TAG, "Ok");
  assert.deepEqual(replay._0, StateTypes.solved(3)._0);
});

test("two-phase coordinates encode canonical solved and G1 states", () => {
  const solved = StateTypes.solved(3)._0;
  const solvedPhaseOne = TwoPhaseSolver.phase1Coordinates(solved);
  assert.equal(solvedPhaseOne.TAG, "Ok");
  assert.deepEqual(solvedPhaseOne._0, {twist: 0, flip: 0, slice: 0});
  const solvedPhaseTwo = TwoPhaseSolver.phase2Coordinates(solved);
  assert.equal(solvedPhaseTwo.TAG, "Ok");
  assert.deepEqual(solvedPhaseTwo._0, {
    corners: 0,
    edges: 0,
    slice: 0,
  });

  const phaseOne = TwoPhaseSolver.phase1Coordinates(apply("F"))._0;
  assert.notEqual(phaseOne.twist, 0);
  assert.notEqual(phaseOne.flip, 0);
  assert.ok(phaseOne.slice >= 0 && phaseOne.slice < 495);

  const g1 = apply("U R2 F2 D'");
  assert.equal(TwoPhaseSolver.isPhase1Solved(g1), true);
  const phaseTwo = TwoPhaseSolver.phase2Coordinates(g1)._0;
  assert.ok(phaseTwo.corners >= 0 && phaseTwo.corners < 40_320);
  assert.ok(phaseTwo.edges >= 0 && phaseTwo.edges < 40_320);
  assert.ok(phaseTwo.slice >= 0 && phaseTwo.slice < 24);
});

test("packed pruning tables store two four-bit distances per Uint8Array byte", () => {
  const table = TwoPhaseSolver.createPruningTable(5);
  assert.ok(table instanceof Uint8Array);
  assert.equal(table.length, 3);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 0), 15);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 4), 15);

  TwoPhaseSolver.setPruningDistance(table, 0, 3);
  TwoPhaseSolver.setPruningDistance(table, 1, 12);
  TwoPhaseSolver.setPruningDistance(table, 4, 7);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 0), 3);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 1), 12);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 4), 7);
});

test("two-phase move domains preserve the G1 subgroup in phase two", () => {
  assert.deepEqual(TwoPhaseSolver.phase1MoveIndices(), Array.from({length: 18}, (_, index) => index));
  assert.deepEqual(TwoPhaseSolver.phase2MoveIndices(), [0, 1, 2, 3, 4, 5, 7, 10, 13, 16]);
  const tokens = ["U", "U2", "U'", "D", "D2", "D'", "R", "R2", "R'", "L", "L2", "L'", "F", "F2", "F'", "B", "B2", "B'"];
  for (const index of TwoPhaseSolver.phase2MoveIndices()) {
    assert.equal(TwoPhaseSolver.isPhase1Solved(apply(tokens[index])), true, tokens[index]);
  }
});

test("phase-one coordinates round-trip through a canonical cubie state", () => {
  const source = {twist: 1_264, flip: 1_337, slice: 271};
  const state = TwoPhaseSolver.phase1State(source);
  assert.equal(state.TAG, "Ok");
  const roundTrip = TwoPhaseSolver.phase1Coordinates(state._0);
  assert.equal(roundTrip.TAG, "Ok");
  assert.deepEqual(roundTrip._0, source);
});

test("phase-one transitions match the facelet executor", () => {
  const source = {twist: 1_264, flip: 1_337, slice: 271};
  const state = TwoPhaseSolver.phase1State(source)._0;
  const f2 = MoveParser.parseWithOptions(3, "Wide", "Modern", "F2")._0;
  const expected = TwoPhaseSolver.phase1Coordinates(MoveExecutor.applyAlg(state, f2)._0)._0;
  const actual = TwoPhaseSolver.phase1Transition(source, 13);
  assert.equal(actual.TAG, "Ok");
  assert.notDeepEqual(TwoPhaseSolver.phase1Coordinates(state)._0, expected);
  assert.deepEqual(actual._0, expected);
});

test("phase-one transition rows retain every move in canonical order", () => {
  const source = {twist: 1_264, flip: 1_337, slice: 271};
  const row = TwoPhaseSolver.phase1TransitionRow(source);
  assert.equal(row.TAG, "Ok");
  assert.equal(row._0.length, 18);
  assert.deepEqual(row._0[13], TwoPhaseSolver.phase1Transition(source, 13)._0);
});

test("the twist move table agrees with direct coordinate transitions", () => {
  const table = TwoPhaseSolver.buildTwistMoveTable();
  assert.equal(table.length, 2_187);
  assert.equal(table[0].length, 18);
  const direct = TwoPhaseSolver.phase1Transition({twist: 1_264, flip: 0, slice: 0}, 13);
  assert.equal(table[1_264][13], direct._0.twist);
});

test("flip and slice move tables agree with direct coordinate transitions", () => {
  const flipTable = TwoPhaseSolver.buildFlipMoveTable();
  const sliceTable = TwoPhaseSolver.buildSliceMoveTable();
  assert.equal(flipTable.length, 2_048);
  assert.equal(sliceTable.length, 495);
  const source = {twist: 0, flip: 1_337, slice: 271};
  const direct = TwoPhaseSolver.phase1Transition(source, 13)._0;
  assert.equal(flipTable[source.flip][13], direct.flip);
  assert.equal(sliceTable[source.slice][13], direct.slice);
});

test("phase-one twist pruning has zero distance at the solved coordinate", () => {
  const table = TwoPhaseSolver.buildSliceTwistPruningTable();
  assert.ok(table instanceof Uint8Array);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 0), 0);
});

test("phase-one flip pruning has zero distance at the solved coordinate", () => {
  const table = TwoPhaseSolver.buildSliceFlipPruningTable();
  assert.ok(table instanceof Uint8Array);
  assert.equal(TwoPhaseSolver.pruningDistance(table, 0), 0);
});

test("phase-two pruning tables have solved distance and are cached", () => {
  const corners = TwoPhaseSolver.buildCornerSlicePruningTable();
  const edges = TwoPhaseSolver.buildEdgeSlicePruningTable();
  assert.ok(corners instanceof Uint8Array);
  assert.ok(edges instanceof Uint8Array);
  assert.equal(corners.length, Math.ceil(40_320 * 24 / 2));
  assert.equal(edges.length, Math.ceil(40_320 * 24 / 2));
  assert.equal(TwoPhaseSolver.pruningDistance(corners, 0), 0);
  assert.equal(TwoPhaseSolver.pruningDistance(edges, 0), 0);
  assert.strictEqual(TwoPhaseSolver.buildCornerSlicePruningTable(), corners);
  assert.strictEqual(TwoPhaseSolver.buildEdgeSlicePruningTable(), edges);
});

test("phase-two coordinates round-trip through a parity-valid G1 state", () => {
  const source = {corners: 1_234, edges: 2_469, slice: 17};
  const state = TwoPhaseSolver.phase2State(source);
  assert.equal(state.TAG, "Ok");
  const roundTrip = TwoPhaseSolver.phase2Coordinates(state._0);
  assert.equal(roundTrip.TAG, "Ok");
  assert.deepEqual(roundTrip._0, source);
});

test("phase-two transitions use only G1-preserving moves", () => {
  const source = {corners: 1_234, edges: 2_469, slice: 17};
  const next = TwoPhaseSolver.phase2Transition(source, 13);
  assert.equal(next.TAG, "Ok");
  const state = TwoPhaseSolver.phase2State(next._0);
  assert.equal(state.TAG, "Ok");
  assert.equal(TwoPhaseSolver.isPhase1Solved(state._0), true);
});

test("phase-two permutation tables agree with direct coordinate transitions", () => {
  const cornerTable = TwoPhaseSolver.buildCornerMoveTable();
  const edgeTable = TwoPhaseSolver.buildEdgeMoveTable();
  const sliceTable = TwoPhaseSolver.buildSlicePermutationMoveTable();
  const source = {corners: 1_234, edges: 2_469, slice: 17};
  const direct = TwoPhaseSolver.phase2Transition(source, 13);
  const column = TwoPhaseSolver.phase2MoveIndices().indexOf(13);
  assert.ok(cornerTable instanceof Uint16Array);
  assert.equal(cornerTable.length, 40_320 * 10);
  assert.equal(edgeTable.length, 40_320 * 10);
  assert.equal(sliceTable.length, 24 * 10);
  assert.equal(cornerTable[TwoPhaseSolver.phase2MoveTableIndex(source.corners, column)], direct._0.corners);
  assert.equal(edgeTable[TwoPhaseSolver.phase2MoveTableIndex(source.edges, column)], direct._0.edges);
  assert.equal(sliceTable[TwoPhaseSolver.phase2MoveTableIndex(source.slice, column)], direct._0.slice);
});
