import assert from "node:assert/strict";
import {test} from "vitest";

import * as StateParity from "../src/State/StateParity.res.mjs";

const solved = {
  size: 3,
  cp: [0, 1, 2, 3, 4, 5, 6, 7],
  co: Array(8).fill(0),
  ep: Array.from({length: 12}, (_, index) => index),
  eo: Array(12).fill(0),
};

test("StateParity identifies each 3x3 reachability invariant with physical slots", () => {
  const twisted = StateParity.validate({...solved, co: [1, 0, 0, 0, 0, 0, 0, 0]});
  assert.equal(twisted._0.TAG, "CornerTwist");
  assert.match(StateParity.describe(twisted._0), /UFR/);

  const flipped = StateParity.validate({...solved, eo: [1, ...Array(11).fill(0)]});
  assert.equal(flipped._0.TAG, "EdgeFlip");
  assert.match(StateParity.describe(flipped._0), /UR/);

  const swapped = StateParity.validate({...solved, ep: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]});
  assert.equal(swapped._0, "PermutationParityMismatch");
  assert.match(StateParity.describe(swapped._0), /swapped/);
});
