import assert from "node:assert/strict";
import {test} from "vitest";

import * as ColorCodec from "../src/State/ColorCodec.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as NetCodec from "../src/State/NetCodec.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const solved = (size) => {
  const result = StateTypes.solved(size);
  assert.equal(result.TAG, "Ok");
  return result._0;
};

for (const size of [2, 3, 4, 5]) {
  test(`facelet and net codecs round-trip a solved ${size}x${size}`, () => {
    const state = solved(size);
    const compact = FaceletCodec.render(state);
    const parsedCompact = FaceletCodec.parse(size, compact);
    assert.equal(parsedCompact.TAG, "Ok");
    assert.equal(FaceletCodec.render(parsedCompact._0), compact);

    const net = NetCodec.render(state);
    const parsedNet = NetCodec.parse(size, net);
    assert.equal(parsedNet.TAG, "Ok");
    assert.equal(FaceletCodec.render(parsedNet._0), compact);
  });
}

const schemes = [
  ["Western", "WRGYOB"],
  ["Japanese", "WRBYOG"],
  [{TAG: "Custom", _0: "ABCDEF"}, "ADCFBE"],
];

for (const [scheme, mapping] of schemes) {
  test(`${typeof scheme === "string" ? scheme : "Custom"} compact colours round-trip`, () => {
    const state = solved(3);
    const rendered = ColorCodec.renderCompact(scheme, state);
    assert.equal(rendered.TAG, "Ok");
    assert.equal(rendered._0, [...mapping].map((value) => value.repeat(9)).join(""));
    const parsed = ColorCodec.parseCompact(scheme, 3, rendered._0);
    assert.equal(parsed.TAG, "Ok");
    assert.equal(FaceletCodec.render(parsed._0), FaceletCodec.render(state));
  });

  test(`${typeof scheme === "string" ? scheme : "Custom"} colour net round-trips`, () => {
    const state = solved(3);
    const rendered = ColorCodec.renderNet(scheme, state);
    assert.equal(rendered.TAG, "Ok");
    const parsed = ColorCodec.parseNet(scheme, 3, rendered._0);
    assert.equal(parsed.TAG, "Ok");
    assert.equal(FaceletCodec.render(parsed._0), FaceletCodec.render(state));
  });
}

test("custom schemes must be six distinct uppercase ASCII letters", () => {
  for (const invalid of ["ABCDE", "ABCDEE", "ABCDE1", "abcDEF"]) {
    const result = ColorCodec.validateScheme({TAG: "Custom", _0: invalid});
    assert.equal(result.TAG, "Error");
  }
});

test("colour parsing rejects symbols outside the selected scheme", () => {
  const result = ColorCodec.parseCompact("Western", 2, "X".repeat(24));
  assert.equal(result.TAG, "Error");
  assert.equal(result._0.TAG, "InvalidColour");
});

test("net parsing rejects non-canonical geometry", () => {
  const net = NetCodec.render(solved(3));
  const result = NetCodec.parse(3, net.replace(/^ {6}/, "     "));
  assert.equal(result.TAG, "Error");
  assert.equal(result._0.TAG, "InvalidNet");
});
