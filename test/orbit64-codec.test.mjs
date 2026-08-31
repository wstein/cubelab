import assert from "node:assert/strict";
import test from "node:test";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as Orbit64Codec from "../src/State/Orbit64Codec.res.mjs";
import * as PieceReducer from "../src/State/PieceReducer.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const solvedPieces = {
  size: 3,
  cp: [0, 1, 2, 3, 4, 5, 6, 7],
  co: Array(8).fill(0),
  ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  eo: Array(12).fill(0),
};

const packIndependent = (cpRank, coRank, epRank, eoRank) => {
  let value = BigInt(cpRank);
  value = value * 2187n + BigInt(coRank);
  value = value * 479001600n + BigInt(epRank);
  value = value * 2048n + BigInt(eoRank);
  const bytes = Buffer.alloc(9);
  for (let index = 8; index >= 0; index -= 1) {
    bytes[index] = Number(value % 256n);
    value /= 256n;
  }
  return bytes.toString("base64url");
};

const apply = (algorithm) => {
  const result = MoveExecutor.parseAndApply(3, algorithm);
  assert.equal(result.TAG, "Ok", result._0);
  return result._0;
};

test("normative solved and superflip vectors are stable", () => {
  assert.equal(Orbit64Codec.encode(solvedPieces)._0, "AAAAAAAAAAAA");

  const superflip = {...solvedPieces, eo: Array(12).fill(1)};
  assert.equal(Orbit64Codec.encode(superflip)._0, "AAAAAAAAAAf_");
  assert.deepEqual(Orbit64Codec.decode("AAAAAAAAAAf_")._0, superflip);
});

test("the U golden vector matches an independent mixed-radix pack", () => {
  const pieces = PieceReducer.reduce(apply("U"))._0;
  const token = Orbit64Codec.encode(pieces);
  assert.equal(token.TAG, "Ok");
  assert.equal(token._0, "AcIufRZj-AAA");
  assert.equal(token._0, packIndependent(15120, 0, 119750400, 0));
});

test("legal states round-trip through a 12-character URL-safe token", () => {
  for (const algorithm of ["R U F'", "M E' S2", "x R U y' M2", "[R, U] F2 D'"]) {
    const state = apply(algorithm);
    const encoded = Orbit64Codec.encodeState(state);
    assert.equal(encoded.TAG, "Ok");
    assert.match(encoded._0, /^[A-Za-z0-9_-]{12}$/);
    const decoded = Orbit64Codec.decodeState(encoded._0);
    assert.equal(decoded.TAG, "Ok");
    assert.deepEqual(PieceReducer.reduce(decoded._0)._0, PieceReducer.reduce(state)._0);
  }
});

test("decoding rejects malformed length, alphabet, header, and parity", () => {
  assert.equal(Orbit64Codec.decode("short")._0.TAG, "InvalidTokenLength");
  assert.equal(Orbit64Codec.decode("AAAAAAAAAAA=")._0.TAG, "InvalidTokenCharacter");

  const unsupportedHeader = Buffer.from([0x80, 0, 0, 0, 0, 0, 0, 0, 0]).toString("base64url");
  assert.equal(Orbit64Codec.decode(unsupportedHeader)._0.TAG, "InvalidHeader");

  const oddEdgePermutation = packIndependent(0, 0, 39916800, 0);
  const parityResult = Orbit64Codec.decode(oddEdgePermutation);
  assert.equal(parityResult._0.TAG, "InvalidCoordinates");
  assert.equal(parityResult._0._0, "ParityMismatch");
});

test("encoding rejects non-3x3 and unreachable coordinate states", () => {
  const twoByTwo = {
    size: 2,
    cp: solvedPieces.cp,
    co: solvedPieces.co,
    ep: [],
    eo: [],
  };
  assert.equal(Orbit64Codec.encode(twoByTwo)._0.TAG, "UnsupportedSize");

  const invalid = {...solvedPieces, co: [1, 0, 0, 0, 0, 0, 0, 0]};
  assert.equal(Orbit64Codec.encode(invalid)._0.TAG, "InvalidCoordinates");
});

test("state wrappers reproduce the solved compact facelets", () => {
  const decoded = Orbit64Codec.decodeState("AAAAAAAAAAAA");
  assert.equal(decoded.TAG, "Ok");
  assert.equal(
    FaceletCodec.render(decoded._0),
    FaceletCodec.render(StateTypes.solved(3)._0),
  );
});
