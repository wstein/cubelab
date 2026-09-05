import {expect, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import {decodeFacelets, encodeFacelets, extractCentres} from "../src/Solver/ThreePhase4x4.res.mjs";

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

test("three-phase centre coordinate uses the upstream U/D/F/B/R/L slot order", () => {
  const solved = FaceletCodec.parse(4, "U".repeat(16) + "R".repeat(16) + "F".repeat(16) + "D".repeat(16) + "L".repeat(16) + "B".repeat(16));
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  expect(extractCentres(solved._0)).toEqual("UUUUDDDDFFFFBBBBRRRRLLLL");
});
