import {expect, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import {decodeFacelets, encodeFacelets} from "../src/Solver/ThreePhase4x4.res.mjs";

test("three-phase boundary round-trips CubeLab's canonical 96 facelets", () => {
  const state = MoveExecutor.parseAndApply(4, "Rw U 2F' Lw2");
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const encoded = encodeFacelets(state._0);
  expect(encoded.TAG).toBe("Ok");
  if (encoded.TAG !== "Ok") return;
  expect(encoded._0).toHaveLength(96);
  const decoded = decodeFacelets(encoded._0);
  expect(decoded.TAG).toBe("Ok");
  if (decoded.TAG === "Ok") expect(FaceletCodec.render(decoded._0)).toBe(FaceletCodec.render(state._0));
});
