import assert from "node:assert/strict";
import { test } from "vitest";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";

const parse = (size, input) => {
  const result = MoveParser.parse(size, input);
  assert.equal(result.TAG, "Ok", result._0?.message);
  return result._0;
};

const assertMatchesApostropheNotation = (size, source) => {
  const minusAlg = parse(size, source);
  const apostropheAlg = parse(size, source.replace(/-(?=\s|$)/g, "'"));
  assert.deepEqual(
    minusAlg.map((unit) => unit.desc),
    apostropheAlg.map((unit) => unit.desc),
  );

  const minusState = MoveExecutor.applyAlg(
    StateTypes.solved(size)._0,
    minusAlg,
  );
  const apostropheState = MoveExecutor.applyAlg(
    StateTypes.solved(size)._0,
    apostropheAlg,
  );
  assert.equal(minusState.TAG, "Ok");
  assert.equal(apostropheState.TAG, "Ok");
  assert.equal(
    FaceletCodec.render(minusState._0),
    FaceletCodec.render(apostropheState._0),
  );
};

test("accepts trailing minus as an inverse alias across move families", () => {
  assertMatchesApostropheNotation(4, "R- U2- Rw- 2L- 2-3Fw2- x- (F U)-");
});

test("accepts a line-separated 3x3 algorithm using minus inverses", () => {
  assertMatchesApostropheNotation(
    3,
    `D
U2
D2
B-
L2
U-
L
D-
R-
B
L-
B2
F-
B-
R-
B2
U
B2
L-
R-
F
U-
F2
U2
D-
L-
R`,
  );
});

test("accepts a line-separated 4x4 algorithm using wide and inner minus inverses", () => {
  assertMatchesApostropheNotation(
    4,
    `Rw2
D2
Lw-
Dw-
F-
U-
L-
U
2F
D2
2L2
U
D2
F2
Rw2
F
Uw-
Fw
2L-
F
2D-
2U2
2L-
R
2L
R2
B-
Uw-
Rw
D2
B-
R-
B-
U2
Dw
B2
Dw-
2R2
2F
2D-
F2
U
D2
R-
U2
L-
D
2L-
2D2
U2
2R-
B-
Uw
2D
L
Rw-
Lw2
R
2D-
Uw
R2
D
2R`,
  );
});
