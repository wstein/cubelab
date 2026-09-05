import assert from "node:assert/strict";
import {test} from "vitest";

import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as MoveTransform from "../src/Move/MoveTransform.res.mjs";

const parse = (size, input) => {
  const result = MoveParser.parse(size, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

test("Workbench filters recorded regrips while remapping later turns on every size", () => {
  for (const size of [2, 3, 4, 5]) {
    const filtered = MoveTransform.serialize(MoveTransform.filterRegrips(parse(size, "x U y R z F")));
    assert.doesNotMatch(filtered, /\b[xyz]\b/);
    assert.equal(filtered, "F U R");
  }
});
