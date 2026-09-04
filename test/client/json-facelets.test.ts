import {expect, test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {parseKociembaJsonFacelets, renderKociembaJsonFacelets} from "../../src/client/json-facelets";

const stateAfter = (algorithm: string, size = 3) => {
  const parsed = MoveParser.parse(size, algorithm);
  expect(parsed.TAG).toBe("Ok");
  const applied = MoveExecutor.applyAlg(StateTypes.solved(size)._0, parsed._0);
  expect(applied.TAG).toBe("Ok");
  return applied._0;
};

test("round-trips the 3×3 Kociemba facelet JSON wrapper and rejects another schema", () => {
  const state = stateAfter("R U F2 L' D B", 3);
  const rendered = renderKociembaJsonFacelets(state);
  expect(rendered.TAG).toBe("Ok");
  if (rendered.TAG !== "Ok") return;
  const parsed = parseKociembaJsonFacelets(rendered._0, 3);
  expect(parsed.TAG).toBe("Ok");
  if (parsed.TAG === "Ok") expect(FaceletCodec.render(parsed._0)).toBe(FaceletCodec.render(state));
  expect(parseKociembaJsonFacelets('{"U":[]}', 3)).toEqual({
    TAG: "Error",
    _0: "Kociemba JSON must contain exactly one string property: facelets.",
  });
  expect(parseKociembaJsonFacelets(rendered._0, 2)).toEqual({
    TAG: "Error",
    _0: "Kociemba JSON facelets are available for 3×3×3 only.",
  });
});
