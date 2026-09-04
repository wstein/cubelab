import {expect, test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {parseJsonFacelets, renderJsonFacelets} from "../../src/client/json-facelets";
import {
  looksLikeSingmasterPieceList,
  parseSingmasterPieceList,
  renderSingmasterPieceList,
} from "../../src/client/singmaster-piece-list";

const stateAfter = (algorithm: string, size = 3) => {
  const parsed = MoveParser.parse(size, algorithm);
  expect(parsed.TAG).toBe("Ok");
  const applied = MoveExecutor.applyAlg(StateTypes.solved(size)._0, parsed._0);
  expect(applied.TAG).toBe("Ok");
  return applied._0;
};

test("renders the documented fixed Singmaster corner and edge order", () => {
  const rendered = renderSingmasterPieceList(StateTypes.solved(3)._0);
  expect(rendered).toEqual({
    TAG: "Ok",
    _0: [
      "Corner 1: URF", "Corner 2: UFL", "Corner 3: ULB", "Corner 4: UBR",
      "Corner 5: DFR", "Corner 6: DLF", "Corner 7: DBL", "Corner 8: DRB",
      "Edge 1: DR", "Edge 2: UB", "Edge 3: DL", "Edge 4: UF",
      "Edge 5: UR", "Edge 6: DB", "Edge 7: UL", "Edge 8: DF",
      "Edge 9: FL", "Edge 10: FR", "Edge 11: BR", "Edge 12: BL",
    ].join("\n"),
  });
});

test("round-trips numbered Singmaster lists for 2×2 and 3×3 states", () => {
  for (const [state, size] of [
    [stateAfter("R U F2 L'", 2), 2],
    [stateAfter("R U F2 L' D B", 3), 3],
  ] as const) {
    const rendered = renderSingmasterPieceList(state);
    expect(rendered.TAG).toBe("Ok");
    const parsed = parseSingmasterPieceList(rendered._0, size);
    expect(parsed.TAG).toBe("Ok");
    expect(FaceletCodec.render(parsed._0)).toBe(FaceletCodec.render(state));
  }
});

test("requires every numbered position exactly once and rejects impossible lists", () => {
  const solved = renderSingmasterPieceList(StateTypes.solved(2)._0);
  expect(solved.TAG).toBe("Ok");
  expect(looksLikeSingmasterPieceList(solved._0)).toBe(true);
  expect(looksLikeSingmasterPieceList("R U R' U'")).toBe(false);
  expect(parseSingmasterPieceList(solved._0.replace("Corner 8", "Corner 7"), 2)).toEqual({
    TAG: "Error",
    _0: "Corner positions must be numbered 1 through 8 exactly once.",
  });
  expect(parseSingmasterPieceList(solved._0.replace("Corner 1: URF", "Corner 1: UFR"), 2).TAG).toBe("Error");
});

test("round-trips strict JSON facelets and rejects shapes outside CubeLab's export", () => {
  const state = stateAfter("R U F2 L' D B", 3);
  const parsed = parseJsonFacelets(renderJsonFacelets(state), 3);
  expect(parsed.TAG).toBe("Ok");
  expect(FaceletCodec.render(parsed._0)).toBe(FaceletCodec.render(state));
  expect(parseJsonFacelets('{"U":[]}', 3)).toEqual({
    TAG: "Error",
    _0: "JSON facelets must contain exactly U, R, F, D, L, and B.",
  });
});
