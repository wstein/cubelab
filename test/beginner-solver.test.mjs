import assert from "node:assert/strict";
import {test} from "vitest";

import * as BeginnerSolver from "../src/Solver/BeginnerSolver.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";
import * as PieceReducer from "../src/State/PieceReducer.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const solved = StateTypes.solved(3)._0;
const solvedCompact = FaceletCodec.render(solved);

const apply = (state, alg) => {
  const result = MoveExecutor.applyAlg(state, alg);
  assert.equal(result.TAG, "Ok");
  return result._0;
};

const scramble = (input) => {
  const result = MoveExecutor.parseAndApply(3, input);
  assert.equal(result.TAG, "Ok", result._0);
  return result._0;
};

const reduce = (state) => {
  const result = PieceReducer.reduce(state);
  assert.equal(
    result.TAG,
    "Ok",
    result.TAG === "Error" ? PieceReducer.describeError(result._0) : "",
  );
  return result._0;
};

const cornerSolved = (pieces, index) => pieces.cp[index] === index && pieces.co[index] === 0;
const edgeSolved = (pieces, index) => pieces.ep[index] === index && pieces.eo[index] === 0;
const firstLayer = (pieces) =>
  [0, 1, 2, 3].every((index) => cornerSolved(pieces, index) && edgeSolved(pieces, index));
const firstTwoLayers = (pieces) =>
  firstLayer(pieces) && [8, 9, 10, 11].every((index) => edgeSolved(pieces, index));

const solve = (state) => {
  const result = BeginnerSolver.solve(state);
  assert.equal(
    result.TAG,
    "Ok",
    result.TAG === "Error" ? BeginnerSolver.describeError(result._0) : "",
  );
  return result._0;
};

test("emits seven truthful beginner phases and replay-verifies the final state", () => {
  const initial = scramble("R U2 F' L2 D B2 R' U F2 D' L B U2 R2 F D2 L' B' U R");
  const solution = solve(initial);
  assert.deepEqual(
    solution.phases.map((phase) => phase.title),
    [
      "White Cross",
      "First-Layer Corners",
      "Middle Layer",
      "Yellow Cross",
      "Orient Yellow Corners",
      "Position Yellow Corners",
      "Position Yellow Edges",
    ],
  );

  let state = initial;
  solution.phases.forEach((phase, index) => {
    state = apply(state, phase.alg);
    const upCentre = state.facelets[0][4];
    const downCentre = state.facelets[5][4];
    if (index < 6) {
      assert.equal(upCentre, "D", `Step ${index + 1} must keep yellow on top`);
      assert.equal(downCentre, "U", `Step ${index + 1} must keep white on the bottom`);
    } else {
      assert.equal(upCentre, "U", "The final step must restore the canonical frame");
      assert.equal(downCentre, "D", "The final step must restore the canonical frame");
    }
    const pieces = reduce(state);
    if (index === 0) assert.ok([0, 1, 2, 3].every((edge) => edgeSolved(pieces, edge)));
    if (index === 1) assert.ok(firstLayer(pieces));
    if (index >= 2) assert.ok(firstTwoLayers(pieces));
    if (index >= 3) assert.ok([4, 5, 6, 7].every((slot) => pieces.eo[slot] === 0));
    if (index >= 4) assert.ok([4, 5, 6, 7].every((slot) => pieces.co[slot] === 0));
    if (index >= 5) assert.ok([4, 5, 6, 7].every((corner) => cornerSolved(pieces, corner)));
  });
  assert.equal(FaceletCodec.render(state), solvedCompact);
  const serialized = MoveTransform.serialize(solution.alg);
  assert.equal((serialized.match(/STEP [1-7]:/g) ?? []).length, 7);
  assert.match(serialized, /\([^)]*\)/);
  assert.match(serialized, /\b[xyz](?:2|')?\b/);
  assert.match(serialized, /@0\.5s/);
  assert.match(serialized, /@1\.2s/);
  assert.equal((serialized.match(/@1\.2s/g) ?? []).length, 6);
  assert.ok(MoveTransform.serialize(solution.phases[0].alg).startsWith("(x2) @0.5s"));
  assert.doesNotMatch(MoveTransform.serialize(solution.phases[2].alg), /\bx2\b/);
  assert.ok(MoveTransform.serialize(solution.phases[6].alg).endsWith("(x2) @0.5s"));
  solution.phases.forEach((phase, index) => {
    phase.alg.forEach((unit, unitIndex) => {
      assert.notEqual(unit.desc.TAG, "Move", "teaching moves must belong to a grouped sequence");
      if (unit.desc.TAG === "Group") {
        assert.equal(phase.alg[unitIndex + 1]?.desc.TAG, "TimedPause");
        const endsPhase = index < solution.phases.length - 1 && unitIndex + 1 === phase.alg.length - 1;
        assert.equal(phase.alg[unitIndex + 1]?.desc._0, endsPhase ? 1.2 : 0.5);
      }
      if (unit.desc.TAG === "TimedPause") assert.notEqual(phase.alg[unitIndex + 1]?.desc.TAG, "TimedPause");
    });
    if (index < solution.phases.length - 1) {
      assert.equal(phase.alg.at(-1).desc.TAG, "TimedPause");
      assert.equal(phase.alg.at(-1).desc._0, 1.2);
    }
  });
  const expandedMoves = MoveExecutor.expand(solution.alg)._0;
  const physicalLayerMoves = expandedMoves.filter((step) => step.move.TAG !== "Rotation");
  assert.equal(physicalLayerMoves.length, solution.moveCount);
  assert.ok(expandedMoves.length > solution.moveCount, "whole-cube regrips must not count as moves");
});

test("reports zero moves for a solved cube despite tutorial metadata", () => {
  const solution = solve(solved);
  assert.equal(solution.moveCount, 0);
});

test("solves canonical state inputs independently of their source algorithm", () => {
  const fixtures = [
    "",
    "(R U R' U')3",
    "M2 E2 S2",
    "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
    "R U R' U' R' F R2 U' R' U' R U R' F'",
    "x R U2 F' y L2 D B2 z'",
  ];
  fixtures.forEach((fixture) => {
    const initial = scramble(fixture);
    const solution = solve(initial);
    assert.equal(FaceletCodec.render(apply(initial, solution.alg)), solvedCompact, fixture);
  });
});

test("solves a seeded sample of random-turn states within the bounded method", () => {
  let seed = 0x5eed1234;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const faces = ["U", "D", "R", "L", "F", "B"];
  const suffixes = ["", "'", "2"];
  for (let sample = 0; sample < 16; sample += 1) {
    const moves = [];
    let previousFace = -1;
    while (moves.length < 25) {
      const face = Math.floor(random() * faces.length);
      if (face === previousFace) continue;
      previousFace = face;
      moves.push(faces[face] + suffixes[Math.floor(random() * suffixes.length)]);
    }
    const initial = scramble(moves.join(" "));
    const solution = solve(initial);
    assert.equal(FaceletCodec.render(apply(initial, solution.alg)), solvedCompact);
  }
});

test("rejects unsupported sizes without mutating their state", () => {
  const state = StateTypes.solved(2)._0;
  const before = FaceletCodec.render(state);
  const result = BeginnerSolver.solve(state);
  assert.equal(result.TAG, "Error");
  assert.equal(result._0.TAG, "UnsupportedSize");
  assert.equal(FaceletCodec.render(state), before);
});

test("rejects an unreachable single-edge flip", () => {
  const state = {
    size: solved.size,
    facelets: solved.facelets.map((facelets) => [...facelets]),
  };
  [state.facelets[0][5], state.facelets[3][1]] = [state.facelets[3][1], state.facelets[0][5]];
  const result = BeginnerSolver.solve(state);
  assert.equal(result.TAG, "Error");
  assert.equal(result._0.TAG, "InvalidState");
  assert.match(BeginnerSolver.describeError(result._0), /edge flip.*UR/);
});
