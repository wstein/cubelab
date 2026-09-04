import {expect, test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {
  looksLikeSingmasterCycleState,
  parseSingmasterCycleState,
  renderSingmasterCycleState,
} from "../../src/client/singmaster-cycle-state";

const stateAfter = (algorithm: string, size: 2 | 3 = 3) => {
  const parsed = MoveParser.parse(size, algorithm);
  expect(parsed.TAG).toBe("Ok");
  const applied = MoveExecutor.applyAlg(StateTypes.solved(size)._0, parsed._0);
  expect(applied.TAG).toBe("Ok");
  return applied._0;
};

test("renders a solved cube as the empty string, matching every other Setup format", () => {
  expect(renderSingmasterCycleState(StateTypes.solved(3)._0)).toEqual({TAG: "Ok", _0: ""});
  expect(renderSingmasterCycleState(StateTypes.solved(2)._0)).toEqual({TAG: "Ok", _0: ""});
});

test("marks each piece's own orientation, since a cycle's twists need not be uniform", () => {
  // A single R turn is a real, physically grounded case where a cycle's
  // twists are NOT all the same direction — Singmaster's own compact
  // single-subscript-per-cycle form could not represent this correctly.
  const rendered = renderSingmasterCycleState(stateAfter("R"));
  expect(rendered).toEqual({TAG: "Ok", _0: "(URF-,UBR+,DRB-,DFR+) (UR,BR,DR,FR)"});
});

test("round-trips scrambled 3×3 and 2×2 states through render and parse", () => {
  for (const [alg, size] of [
    ["R U F2 L' D B", 3],
    ["R U R' U' R' F R2 U' R' U' R U R' F'", 3],
    ["R U F2 L'", 2],
  ] as const) {
    const state = stateAfter(alg, size);
    const rendered = renderSingmasterCycleState(state);
    expect(rendered.TAG).toBe("Ok");
    if (rendered.TAG !== "Ok") continue;
    expect(looksLikeSingmasterCycleState(rendered._0)).toBe(true);
    const parsed = parseSingmasterCycleState(rendered._0, size);
    expect(parsed.TAG).toBe("Ok");
    if (parsed.TAG !== "Ok") continue;
    expect(FaceletCodec.render(parsed._0)).toBe(FaceletCodec.render(state));
  }
});

test("accepts a valid two-corner monotwist and rejects a single impossible one", () => {
  const monotwist = parseSingmasterCycleState("(URF+)(UFL-)", 3);
  expect(monotwist.TAG).toBe("Ok");
  if (monotwist.TAG === "Ok") {
    expect(renderSingmasterCycleState(monotwist._0)).toEqual({TAG: "Ok", _0: "(URF+) (UFL-)"});
  }

  const impossible = parseSingmasterCycleState("(URF+)", 3);
  expect(impossible.TAG).toBe("Error");
});

test("rejects an edge '-' suffix, a 2×2 edge cycle, and a repeated position", () => {
  expect(parseSingmasterCycleState("(UR-)", 3).TAG).toBe("Error");
  expect(parseSingmasterCycleState("(UR,UF)", 2).TAG).toBe("Error");
  expect(parseSingmasterCycleState("(URF,URF)", 3).TAG).toBe("Error");
});

test("does not mistake SSE's lowercase cycles or a parenthesised algorithm for Singmaster notation", () => {
  expect(looksLikeSingmasterCycleState("(+urf,ubr,ulb)")).toBe(false);
  expect(looksLikeSingmasterCycleState("(R U R' U')")).toBe(false);
  expect(looksLikeSingmasterCycleState("(URF,UBR)")).toBe(true);
});
