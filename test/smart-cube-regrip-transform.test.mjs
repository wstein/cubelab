import assert from "node:assert/strict";
import {test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";

const parse = (input) => {
  const result = MoveParser.parse(3, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

const stateAfter = (input) => {
  const result = MoveExecutor.parseAndApply(3, input);
  assert.equal(result.TAG, "Ok", result._0);
  return FaceletCodec.render(result._0);
};

test("Workbench expands recorded gyro regrips to exact wide-turn pairs", () => {
  const expanded = MoveTransform.serialize(MoveTransform.regripsToWide(parse("x y z")));
  assert.equal(expanded, "Rw L' Uw D' Fw B'");
  assert.equal(stateAfter(expanded), stateAfter("x y z"));
});

test("Workbench filters recorded regrips while remapping later turns", () => {
  const filtered = MoveTransform.serialize(MoveTransform.filterRegrips(parse("x U y R z F")));
  assert.doesNotMatch(filtered, /\b[xyz]\b/);
  assert.equal(filtered, "F U R");
});
