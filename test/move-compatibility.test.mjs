import assert from "node:assert/strict";
import test from "node:test";

import * as MoveCompatibility from "../src/Move/MoveCompatibility.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";

const evaluate = (input, {size = 3, lowercaseMode = "Wide", notationDialect = "Modern"} = {}) => {
  const parsed = MoveParser.parseWithOptions(size, lowercaseMode, notationDialect, input);
  assert.equal(parsed.TAG, "Ok", parsed._0?.message);
  return MoveCompatibility.evaluate(input, lowercaseMode, notationDialect, parsed._0);
};

test("plain Article 12 source is portable across every selected profile", () => {
  const result = evaluate("R U' F2 Rw x");
  for (const profile of Object.values(result)) {
    assert.equal(profile.compatible, true, profile.reasons.join(" "));
    assert.deepEqual(profile.reasons, []);
  }
});

test("structured LGN remains portable except to Article 12 and Ruwix", () => {
  const result = evaluate("[R, U]");
  assert.equal(result.wca.compatible, false);
  assert.match(result.wca.reasons.join(" "), /Commutators/);
  assert.equal(result.signLgn.compatible, true);
  assert.equal(result.cubingJs.compatible, true);
  assert.equal(result.speedsolving.compatible, true);
  assert.equal(result.ruwix.compatible, false);
});

test("source extensions explain which portable grammars they exceed", () => {
  const result = evaluate("(R U)*6 # copied");
  for (const profile of Object.values(result)) {
    assert.equal(profile.compatible, false);
    assert.ok(profile.reasons.length > 0);
  }
  assert.match(result.signLgn.reasons.join(" "), /numeric repetition suffix|Hash comments/);
  assert.match(result.cubingJs.reasons.join(" "), /numeric repetition suffix|hash comments/);
});

test("compact x multipliers receive the same source-portability warning", () => {
  const result = evaluate("(R U)x 6");
  assert.equal(result.signLgn.compatible, false);
  assert.match(result.signLgn.reasons.join(" "), /numeric repetition suffix/);
});

test("Ruwix outer-block subscripts identify their site-specific source profile", () => {
  const result = evaluate("F₂'", {size: 5});
  assert.equal(result.ruwix.compatible, true);
  assert.equal(result.wca.compatible, false);
  assert.equal(result.signLgn.compatible, false);
  assert.equal(result.cubingJs.compatible, false);
  assert.equal(result.speedsolving.compatible, false);
});

test("legacy lowercase semantics conflict with every modern lowercase profile", () => {
  const result = evaluate("r", {size: 4, lowercaseMode: "InnerSlice"});
  assert.equal(result.wca.compatible, false);
  assert.equal(result.signLgn.compatible, false);
  assert.equal(result.cubingJs.compatible, false);
  assert.equal(result.ruwix.compatible, false);
});

test("cubing.js alone accepts a whitespace-delimited internal pause", () => {
  const result = evaluate("R . U");
  assert.equal(result.cubingJs.compatible, true);
  assert.equal(result.wca.compatible, false);
  assert.equal(result.signLgn.compatible, false);
  assert.equal(result.speedsolving.compatible, false);
  assert.equal(result.ruwix.compatible, false);
});

test("cubing.js timestamp syntax remains visible as a timed pause node", () => {
  const result = evaluate("R @1.3s U");
  assert.equal(result.cubingJs.compatible, true);
  assert.equal(result.wca.compatible, false);
  assert.equal(result.signLgn.compatible, false);
});

test("block comments remain explicit Cube Rosetta editor nodes", () => {
  const result = evaluate("R /* inspect */ U");
  for (const profile of Object.values(result)) {
    assert.equal(profile.compatible, false);
  }
  assert.match(result.cubingJs.reasons.join(" "), /does not accept block comments/);
});

test("sentence punctuation is distinct from cubing.js pause syntax", () => {
  const result = evaluate("R U.");
  assert.equal(result.cubingJs.compatible, false);
  assert.match(result.cubingJs.reasons.join(" "), /requires whitespace around a pause/);
});
