import assert from "node:assert/strict";
import {test} from "vitest";
import {puzzles} from "cubing/puzzles";
import * as Centers from "../src/Solver/PictureCenters.res.mjs";
import * as Solver from "../src/Solver/TwoPhaseSolver.res.mjs";
import * as Executor from "../src/Move/MoveExecutor.res.mjs";
import * as Parser from "../src/Move/MoveParser.res.mjs";
import * as State from "../src/State/StateTypes.res.mjs";
const zeros = () => Array(6).fill(0);
const exact = () => Array(6).fill(4);
const parse = text => { const p = Parser.parse(3, text); assert.equal(p.TAG, "Ok"); return p._0; };
const stateFor = text => Executor.parseAndApply(3, text)._0;

test("all 18 center move deltas agree with independent cubing transformation data", async () => {
  const kp = await puzzles["3x3x3"].kpuzzle();
  const mapping = [0, 1, 2, 3, 4, 5]; // Both physical center orbits use U/L/F/R/B/D.
  for (const face of "ULFRBD") for (const suffix of ["", "2", "'"]) {
    const word = face + suffix;
    const result = Centers.apply(zeros(), parse(word));
    assert.equal(result.TAG, "Ok");
    const deltas = kp.algToTransformation(word).transformationData.CENTERS.orientationDelta;
    assert.deepEqual(result._0, mapping.map(index => deltas[index]));
    const inverse = suffix === "2" ? word : face + (suffix ? "" : "'");
    assert.deepEqual(Centers.apply(result._0, parse(inverse))._0, zeros());
  }
});

test("exactly 2048 physical center tuples agree with each fixed cubie permutation parity", () => {
  const even = [0, 1, 2, 3, 4, 5, 6, 7], odd = [1, 0, 2, 3, 4, 5, 6, 7];
  let counts = [0, 0];
  for (let coordinate = 0; coordinate < 4096; coordinate++) {
    const centers = Centers.decode(coordinate);
    assert.equal(Centers.encode(centers), coordinate);
    if (Centers.reachable(centers, even)) counts[0]++;
    if (Centers.reachable(centers, odd)) counts[1]++;
  }
  assert.deepEqual(counts, [2048, 2048]);
  assert.equal(Centers.reachable([2, 0, 0, 0, 0, 0], even), true);
  assert.equal(Centers.reachable([1, 0, 0, 0, 0, 0], even), false);
  assert.equal(Centers.reachable([1, 0, 0, 0, 0, 0], odd), true);
});

test("integrated bounded search solves short physical scrambles and exact center goals", () => {
  for (const word of ["", "R", "U F2", "R U F'", "D2 L2 B U"]) {
    const state = stateFor(word), inputCenters = Centers.apply(zeros(), parse(word))._0;
    const result = Solver.solvePictureAtDepth(state, inputCenters, exact(), word ? word.split(" ").length : 0, 200000);
    assert.equal(result.TAG, "Ok", `${word}: ${JSON.stringify(result)}`);
    assert.deepEqual(Executor.applyAlg(state, result._0.alg)._0, State.solved(3)._0);
    assert.deepEqual(Centers.apply(inputCenters, result._0.alg)._0, zeros());
    assert(result._0.moveCount <= (word ? word.split(" ").length : 0));
  }
});

test("color-solved early return cannot hide a physically reachable misoriented center", () => {
  const solved = State.solved(3)._0;
  const centers = [2, 0, 0, 0, 0, 0];
  const result = Solver.solvePictureAtDepth(solved, centers, exact(), 0, 100);
  assert.equal(result.TAG, "Error");
  assert.equal(result._0, "SearchFailed");
  const halfSymmetry = [2, 4, 4, 4, 4, 4];
  assert.equal(Solver.solvePictureAtDepth(solved, centers, halfSymmetry, 0, 100).TAG, "Ok");
  assert.equal(Solver.solvePictureAtDepth(solved, [1, 0, 0, 0, 0, 0], exact(), 0, 100).TAG, "Error");
});

test("node exhaustion is distinct from depth exhaustion and malformed input", () => {
  const result = Solver.solvePictureAtDepth(stateFor("R U F L"), Centers.apply(zeros(), parse("R U F L"))._0, exact(), 8, 1);
  assert.equal(result.TAG, "Error");
  assert.equal(result._0, "SearchBudgetExceeded");
  assert.match(Solver.describeError(result._0), /no conclusion/);
  for (const [orientations, symmetry] of [[[], exact()], [zeros(), [3,4,4,4,4,4]], [[4,0,0,0,0,0], exact()], [[0.5,0.5,0,0,0,0], exact()]]) {
    assert.equal(Solver.solvePictureAtDepth(State.solved(3)._0, orientations, symmetry, 4, 100).TAG, "Error");
  }
  assert.equal(Solver.solvePictureAtDepth(stateFor("x"), zeros(), exact(), 4, 100).TAG, "Error");
  assert.equal(Solver.solvePictureAtDepth(State.solved(3)._0, zeros(), exact(), 1.5, 100).TAG, "Error");
  assert.equal(Solver.solvePictureAtDepth(State.solved(3)._0, zeros(), exact(), 4, 1.5).TAG, "Error");
});

test("center-aware search distinguishes two physical pictures with identical color facelets", () => {
  // The square of this six-move word is a pure U-center half turn.
  // Its two halves therefore share colors but have different center twists.
  const a = "U R L U2 R' L'", b = "L R U2 L' R' U'";
  const colorState = stateFor(a);
  assert.deepEqual(colorState, stateFor(b));
  const ca = Centers.apply(zeros(), parse(a))._0;
  const cb = Centers.apply(zeros(), parse(b))._0;
  assert.notDeepEqual(ca, cb);
  const ordinary = Solver.solveAtDepth(colorState, 6);
  assert.equal(ordinary.TAG, "Ok");
  const actualCenters = Centers.apply(ca, ordinary._0.alg)._0.some(Boolean) ? ca : cb;
  assert(Centers.apply(actualCenters, ordinary._0.alg)._0.some(Boolean));
  const picture = Solver.solvePictureAtDepth(colorState, actualCenters, exact(), 6, 1000000);
  assert.equal(picture.TAG, "Ok", JSON.stringify(picture));
  assert.deepEqual(Executor.applyAlg(colorState, picture._0.alg)._0, State.solved(3)._0);
  assert.deepEqual(Centers.apply(actualCenters, picture._0.alg)._0, zeros());
});
