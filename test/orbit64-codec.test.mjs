import assert from "node:assert/strict";
import {test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as Orbit64Codec from "../src/State/Orbit64Codec.ts";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const vectors = [
  [2, "EJ6Rr", "LFLD BLRD BLBU RFRR UUDU DFFB"],
  [3, "AAAAAAAAB-go", "UUUUURUUU RURBRLRDR FFFLFRFFF DDDLDRDDD LLLFLFLDL BBBBBRBBB"],
  [4, "BJSsuyGPOiU06kIz-eqibqTP1th", "DLLDLLDLBFLFLRBR DRDLFBRLUURUUDDU FUUFLDFDRBUFURRL LBDFFFDFFFBRFBFR RDDDBLUUBURBRULB BFBBUDRURBLLBRDU"],
  [5, "AQsjv5K4-XPjKJZMNvMLvYKqohuv1x7JGUoNROgDJ2w", "DBRFRFUBLDDBUFFURBDDFUUDL BLDBFULULLLRRUURRDFDRLLFD LFLRURFURRFFFFBUBLUFRLUBU BDBRFDFRUULRDFDULLDDRBRFL LDBFUUFDUFRLLURBRDDBBRFRD DLDUFBBBBLFRBDUBDLBLBLBRU"],
];

test("decodes Flix Orbit64's published vectors for every supported size", () => {
  for (const [size, token, spaced] of vectors) {
    const decoded = Orbit64Codec.decodeState(token);
    assert.equal(decoded.TAG, "Ok", decoded.TAG === "Error" ? decoded._0.message : "");
    assert.equal(decoded._0.size, size);
    assert.equal(FaceletCodec.render(decoded._0), spaced.replaceAll(" ", ""));
    assert.deepEqual(Orbit64Codec.encodeState(decoded._0), {TAG: "Ok", _0: token});
  }
});

test("solved states use the published size-specific fixed widths", () => {
  for (const [size, width] of Object.entries(Orbit64Codec.widths)) {
    const solved = StateTypes.solved(Number(size));
    assert.equal(solved.TAG, "Ok");
    const encoded = Orbit64Codec.encodeState(solved._0);
    assert.equal(encoded.TAG, "Ok");
    assert.equal(encoded._0, "A".repeat(width));
  }
});

test("rejects non-state classes and unknown widths", () => {
  assert.equal(Orbit64Codec.decodeState("Q".repeat(12))._0.TAG, "InvalidHeader");
  assert.equal(Orbit64Codec.decodeState("AAAAAA")._0.TAG, "InvalidTokenLength");
  assert.equal(Orbit64Codec.decodeState("AAAAAAAAAAA=")._0.TAG, "InvalidTokenCharacter");

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
      const token = Orbit64Codec.encodeState(state._0);
      assert.equal(token.TAG, "Ok");
      const decoded = Orbit64Codec.decodeState(token._0);
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
  assert.equal(Orbit64Codec.decodeState(Orbit64Codec.encodeState(canonical._0)._0).TAG, "Ok");
});
