import assert from "node:assert/strict";
import {test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as Orbit64Codec from "../src/State/Orbit64Codec.res.mjs";
import * as Orbit64State from "../src/State/Orbit64State.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {normative3x3Tokens, publishedStateVectors, solved3x3FrameTokens} from "./fixtures/orbit64-rosetta-vectors.mjs";

test("decodes the published vectors that are also V2 framed tokens", () => {
  for (const [size, token, spaced] of publishedStateVectors) {
    if (token.length === 43) {
      const retired = Orbit64State.decodeState(token);
      assert.equal(retired.TAG, "Error");
      assert.equal(retired._0.message, "Orbit64 V1 is no longer supported");
      const parsed = FaceletCodec.parse(size, spaced);
      assert.equal(parsed.TAG, "Ok");
      const encoded = Orbit64State.encodeState(parsed._0);
      assert.equal(encoded.TAG, "Ok");
      assert.equal(encoded._0.length, 42);
      assert.notEqual(encoded._0, token);
      continue;
    }
    const decoded = Orbit64State.decodeState(token);
    assert.equal(decoded.TAG, "Ok", decoded.TAG === "Error" ? decoded._0.message : "");
    assert.equal(decoded._0.size, size);
    assert.equal(FaceletCodec.render(decoded._0), spaced.replaceAll(" ", ""));
    assert.deepEqual(Orbit64State.encodeState(decoded._0), {TAG: "Ok", _0: token});
  }
});

test("solved states use the published size-specific fixed widths", () => {
  for (const [size, width] of Object.entries(Orbit64State.widths)) {
    const solved = StateTypes.solved(Number(size));
    assert.equal(solved.TAG, "Ok");
    const encoded = Orbit64State.encodeState(solved._0);
    assert.equal(encoded.TAG, "Ok");
    assert.equal(encoded._0.length, width);
    if (Number(size) === 5) assert.notEqual(encoded._0, "A".repeat(width));
    else assert.equal(encoded._0, "A".repeat(width));
  }
});

test("keeps Flix's normative 3x3 compatibility vectors", () => {
  for (const token of normative3x3Tokens) {
    const decoded = Orbit64State.decodeState(token);
    assert.equal(decoded.TAG, "Ok");
    assert.deepEqual(Orbit64State.encodeState(decoded._0), {TAG: "Ok", _0: token});
  }
  const x = MoveExecutor.parseAndApply(3, "x");
  assert.equal(x.TAG, "Ok");
  assert.deepEqual(Orbit64State.encodeState(x._0), {TAG: "Ok", _0: "AAAAAAAAAAAE"});
});

test("encodes every published odd-cube frame rank independently", () => {
  const rotations = [
    ...Array.from({length: 16}, (_, index) => `${"x ".repeat(Math.floor(index / 4))}${"y ".repeat(index % 4)}`.trim()),
    ...[1, 3].flatMap(z => Array.from({length: 4}, (_, y) => `${"z ".repeat(z)}${"y ".repeat(y)}`.trim())),
  ];
  assert.equal(rotations.length, 24);
  const solved = StateTypes.solved(3);
  assert.equal(solved.TAG, "Ok");
  for (const [rank, token] of solved3x3FrameTokens.entries()) {
    const state = rotations[rank] === ""
      ? solved
      : MoveExecutor.parseAndApply(3, rotations[rank]);
    assert.equal(state.TAG, "Ok");
    assert.deepEqual(Orbit64State.encodeState(state._0), {TAG: "Ok", _0: token});
  }
});

test("rejects a retired V1 token and unknown widths", () => {
  assert.equal(Orbit64State.decodeState("Q".repeat(12)).TAG, "Error");
  assert.match(Orbit64State.decodeState("Q".repeat(12))._0.message, /known V2/);
  assert.equal(Orbit64State.decodeState("AAAAAA").TAG, "Error");
  assert.match(Orbit64State.decodeState("AAAAAAAAAAA=")._0.message, /Base64URL/);
  assert.equal(Orbit64State.decodeState("A".repeat(43))._0.message, "Orbit64 V1 is no longer supported");
});

test("returns defined errors for malformed state callers", () => {
  assert.equal(Orbit64State.encodeState(null)._0.TAG, "InvalidState");
  assert.equal(Orbit64State.encodeState({size: 3, facelets: []})._0.TAG, "InvalidState");
  assert.equal(Orbit64State.encodeState({
    size: 3,
    facelets: Array.from({length: 6}, () => Array(8).fill("U")),
  })._0.TAG, "InvalidState");
  assert.equal(Orbit64Codec.canonicaliseState({size: 5, facelets: []})._0.TAG, "InvalidState");
});

test("preserves all odd-cube whole-cube centre frames", () => {
  const rotations = [
    ...Array.from({length: 16}, (_, index) => `${"x ".repeat(Math.floor(index / 4))}${"y ".repeat(index % 4)}`.trim()),
    ...[1, 3].flatMap(z => Array.from({length: 4}, (_, y) => `${"z ".repeat(z)}${"y ".repeat(y)}`.trim())),
  ];
  for (const size of [3, 5]) {
    for (const rotation of rotations) {
      const state = MoveExecutor.parseAndApply(size, `${rotation} R U`);
      assert.equal(state.TAG, "Ok");
      const token = Orbit64State.encodeState(state._0);
      assert.equal(token.TAG, "Ok");
      const decoded = Orbit64State.decodeState(token._0);
      assert.equal(decoded.TAG, "Ok");
      assert.equal(FaceletCodec.render(decoded._0), FaceletCodec.render(state._0));
    }
  }
});

test("canonicalises a rotated 5x5 fixed-centre frame without changing its cubies", () => {
  const rotated = MoveExecutor.parseAndApply(5, "x y R U");
  assert.equal(rotated.TAG, "Ok");
  const canonical = Orbit64Codec.canonicaliseState(rotated._0);
  assert.equal(canonical.TAG, "Ok");
  const facelets = FaceletCodec.render(canonical._0);
  assert.equal([12, 37, 62, 87, 112, 137].map(index => facelets[index]).join(""), "URFDLB");
  assert.equal(Orbit64State.decodeState(Orbit64State.encodeState(canonical._0)._0).TAG, "Ok");
});
