import {expect, test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {parseLargeCubeState, renderLargeCubeState} from "../../src/client/large-cube-state";
import {parseSingmasterCycleState, renderSingmasterCycleState} from "../../src/client/singmaster-cycle-state";
import {parseSseState, renderSseState} from "../../src/client/sse-state";

const stateAfter = (size: 4 | 5, algorithm: string) => {
  const parsed = MoveParser.parse(size, algorithm);
  expect(parsed.TAG).toBe("Ok");
  const applied = MoveExecutor.applyAlg(StateTypes.solved(size)._0, parsed._0);
  expect(applied.TAG).toBe("Ok");
  return applied._0;
};

test("losslessly round-trips the Cube Rosetta large-cube cards", () => {
  for (const size of [4, 5] as const) {
    const state = stateAfter(size, "Rw U 2F' Lw2");
    for (const format of ["coordinates", "sse", "singmaster"] as const) {
      const rendered = renderLargeCubeState(state, format);
      expect(rendered.TAG).toBe("Ok");
      if (rendered.TAG === "Error") continue;
      expect(rendered._0).toContain(`Cube Rosetta`);
      expect(rendered._0).toContain("cp");
      expect(rendered._0).toContain("state:");
      const parsed = parseLargeCubeState(rendered._0, size);
      expect(parsed.TAG).toBe("Ok");
      if (parsed.TAG === "Ok") expect(FaceletCodec.render(parsed._0)).toBe(FaceletCodec.render(state));
    }
  }
});

test("SSE and Singmaster extension cards remain directly pasteable", () => {
  const state = stateAfter(5, "Rw U 2F'");
  const sse = renderSseState(state);
  const singmaster = renderSingmasterCycleState(state);
  expect(sse.TAG).toBe("Ok");
  expect(singmaster.TAG).toBe("Ok");
  if (sse.TAG === "Ok") {
    const parsed = parseSseState(sse._0, 5);
    expect(parsed.TAG).toBe("Ok");
    if (parsed.TAG === "Ok") expect(FaceletCodec.render(parsed._0.state)).toBe(FaceletCodec.render(state));
  }
  if (singmaster.TAG === "Ok") {
    const parsed = parseSingmasterCycleState(singmaster._0, 5);
    expect(parsed.TAG).toBe("Ok");
    if (parsed.TAG === "Ok") expect(FaceletCodec.render(parsed._0)).toBe(FaceletCodec.render(state));
  }
});
