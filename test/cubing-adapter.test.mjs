import assert from "node:assert/strict";
import {test} from "vitest";

import {puzzles} from "cubing/puzzles";

import * as CubingAdapter from "../src/State/CubingAdapter.ts";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as Orbit64Codec from "../src/State/Orbit64Codec.res.mjs";

const encoded = state => {
  const token = Orbit64Codec.encodeState(state);
  assert.equal(token.TAG, "Ok");
  return token._0;
};

test("adapts named 3x3x3 scrambles through Orbit64 facelets and KPattern", async () => {
  const kpuzzle = await puzzles["3x3x3"].kpuzzle();
  const examples = {
    Sune: "R U R' U R U2 R'",
    Checkerboard: "U2 D2 F2 B2 L2 R2",
    Superflip: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
  };
  for (const [name, algorithm] of Object.entries(examples)) {
    const state = MoveExecutor.parseAndApply(3, algorithm);
    assert.equal(state.TAG, "Ok", name);
    const pattern = await CubingAdapter.tokenToKPattern(encoded(state._0));
    assert.equal(pattern.TAG, "Ok", name);
    assert.deepEqual(pattern._0.patternData, kpuzzle.defaultPattern().applyAlg(algorithm).patternData, name);
    const token = await CubingAdapter.kPatternToToken(pattern._0);
    assert.deepEqual(token, {TAG: "Ok", _0: encoded(state._0)}, name);
  }
});

test("preserves all 24 odd-cube frame ranks at the cubing.js facelet boundary", async () => {
  const kpuzzle = await puzzles["3x3x3"].kpuzzle();
  const rotations = [
    ...Array.from({length: 16}, (_, index) => `${"x ".repeat(Math.floor(index / 4))}${"y ".repeat(index % 4)}`.trim()),
    ...[1, 3].flatMap(z => Array.from({length: 4}, (_, y) => `${"z ".repeat(z)}${"y ".repeat(y)}`.trim())),
  ];
  assert.equal(rotations.length, 24);
  for (const rotation of rotations) {
    const algorithm = `${rotation} R U F2`.trim();
    const state = MoveExecutor.parseAndApply(3, algorithm);
    assert.equal(state.TAG, "Ok", algorithm);
    const pattern = await CubingAdapter.tokenToKPattern(encoded(state._0));
    assert.equal(pattern.TAG, "Ok", algorithm);
    assert.deepEqual(pattern._0.patternData, kpuzzle.defaultPattern().applyAlg(algorithm).patternData, algorithm);
    const restored = await CubingAdapter.fromKPattern(pattern._0);
    assert.equal(restored.TAG, "Ok", algorithm);
    assert.equal(FaceletCodec.render(restored._0), FaceletCodec.render(state._0), algorithm);
  }
});

test("declines a non-3x3x3 Orbit64 state rather than guessing a KPattern mapping", async () => {
  const state = MoveExecutor.parseAndApply(4, "R U");
  assert.equal(state.TAG, "Ok");
  const pattern = await CubingAdapter.toKPattern(state._0);
  assert.deepEqual(pattern, {TAG: "Error", _0: "cubing.js KPattern interop currently supports 3x3x3 only"});
});
