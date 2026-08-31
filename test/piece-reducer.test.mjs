import assert from "node:assert/strict";
import test from "node:test";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as PieceReducer from "../src/State/PieceReducer.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const solvedPieces = (size) => ({
  size,
  cp: [0, 1, 2, 3, 4, 5, 6, 7],
  co: Array(8).fill(0),
  ep: size === 3 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [],
  eo: size === 3 ? Array(12).fill(0) : [],
});

const apply = (size, algorithm) => {
  const result = MoveExecutor.parseAndApply(size, algorithm);
  assert.equal(result.TAG, "Ok", result._0);
  return result._0;
};

const reduce = (state) => {
  const result = PieceReducer.reduce(state);
  assert.equal(result.TAG, "Ok", result.TAG === "Error" ? PieceReducer.describeError(result._0) : "");
  return result._0;
};

test("solved 2x2 and 3x3 states reduce to identity coordinates", () => {
  for (const size of [2, 3]) {
    assert.deepEqual(reduce(StateTypes.solved(size)._0), solvedPieces(size));
  }
});

test("legal 2x2 algorithms strictly round-trip through fixed-frame corner coordinates", () => {
  for (const algorithm of ["R U F'", "x y' z2", "(R U R' U')3"]) {
    const state = apply(2, algorithm);
    const reconstructed = PieceReducer.reconstruct(reduce(state));
    assert.equal(reconstructed.TAG, "Ok");
    assert.equal(FaceletCodec.render(reconstructed._0), FaceletCodec.render(state));
  }
});

test("legal 3x3 algorithms round-trip through centre-normalized coordinates", () => {
  for (const algorithm of ["R U F'", "M E' S2", "x R U y' M2"]) {
    const pieces = reduce(apply(3, algorithm));
    const reconstructed = PieceReducer.reconstruct(pieces);
    assert.equal(reconstructed.TAG, "Ok");
    assert.deepEqual(reduce(reconstructed._0), pieces);
  }
});

test("whole-cube rotations normalize to identity coordinates", () => {
  for (const algorithm of ["x", "y", "z", "x y2 z'"]) {
    assert.deepEqual(reduce(apply(3, algorithm)), solvedPieces(3));
  }
});

test("the named superflip fixture has only flipped edges", () => {
  const pieces = reduce(
    apply(3, "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2"),
  );
  assert.deepEqual(pieces.cp, solvedPieces(3).cp);
  assert.deepEqual(pieces.co, solvedPieces(3).co);
  assert.deepEqual(pieces.ep, solvedPieces(3).ep);
  assert.deepEqual(pieces.eo, Array(12).fill(1));
});

test("validation rejects invalid permutations, orientation sums, parity, and 2x2 edges", () => {
  const duplicateCorner = {...solvedPieces(3), cp: [0, 0, 2, 3, 4, 5, 6, 7]};
  assert.equal(PieceReducer.validate(duplicateCorner)._0.TAG, "InvalidPermutation");

  const twistedCorner = {...solvedPieces(3), co: [1, 0, 0, 0, 0, 0, 0, 0]};
  assert.equal(PieceReducer.validate(twistedCorner)._0.TAG, "InvalidOrientation");

  const parityMismatch = {...solvedPieces(3), ep: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]};
  assert.equal(PieceReducer.validate(parityMismatch)._0, "ParityMismatch");

  const edgesOn2 = {...solvedPieces(2), ep: [0], eo: [0]};
  assert.equal(PieceReducer.validate(edgesOn2)._0.TAG, "InvalidPiece");
});

test("reduction rejects impossible centre and piece arrangements", () => {
  const invalidCentres = structuredClone(StateTypes.solved(3)._0);
  invalidCentres.facelets[0][4] = "L";
  assert.equal(PieceReducer.reduce(invalidCentres)._0.TAG, "InvalidCenters");

  const duplicateCorner = structuredClone(StateTypes.solved(2)._0);
  duplicateCorner.facelets[0][3] = "D";
  assert.equal(PieceReducer.reduce(duplicateCorner)._0.TAG, "InvalidPiece");
});

test("copy-ready cubie syntax strictly round-trips 2x2 and 3x3 states", () => {
  for (const [size, algorithm] of [[2, "R U F'"], [3, "[R, U] F2 D'"]]) {
    const state = apply(size, algorithm);
    const pieces = reduce(state);
    const rendered = PieceReducer.render(pieces);
    assert.equal(rendered.TAG, "Ok");
    const parsed = PieceReducer.parse(size, rendered._0);
    assert.equal(parsed.TAG, "Ok");
    assert.deepEqual(parsed._0, pieces);
    assert.deepEqual(reduce(PieceReducer.parseState(size, rendered._0)._0), pieces);
  }
});

test("cubie syntax rejects wrong fields and unreachable coordinates", () => {
  assert.equal(PieceReducer.parse(3, "cp: 0; co: 0")._0.TAG, "InvalidSyntax");
  assert.equal(
    PieceReducer.parse(
      2,
      "co: 0 0 0 0 0 0 0 0; cp: 0 1 2 3 4 5 6 7",
    )._0.TAG,
    "InvalidSyntax",
  );
  assert.equal(
    PieceReducer.parse(
      2,
      "cp: 0 1 2 3 4 5 6 7; co: 1 0 0 0 0 0 0 0",
    )._0.TAG,
    "InvalidOrientation",
  );
});
