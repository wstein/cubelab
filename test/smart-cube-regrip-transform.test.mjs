import assert from "node:assert/strict";
import {test} from "vitest";

import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";

const parse = (input) => {
  const result = MoveParser.parse(3, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

test("Workbench filters recorded regrips while remapping later turns", () => {
  const filtered = MoveTransform.serialize(MoveTransform.filterRegrips(parse("x U y R z F")));
  assert.doesNotMatch(filtered, /\b[xyz]\b/);
  assert.equal(filtered, "F U R");
});
