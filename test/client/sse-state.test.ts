import {expect, test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {looksLikeSseState, parseSseState} from "../../src/client/sse-state";

const stateAfter = (algorithm: string) => {
  const parsed = MoveParser.parse(3, algorithm);
  expect(parsed.TAG).toBe("Ok");
  const applied = MoveExecutor.applyAlg(StateTypes.solved(3)._0, parsed._0);
  expect(applied.TAG).toBe("Ok");
  return applied._0;
};

test("imports the SSE cycles documented as an R turn", () => {
  const imported = parseSseState("(urf,bru,drb,frd) (ur,br,dr,fr) (+r)");
  expect(imported.TAG).toBe("Ok");
  expect(FaceletCodec.render(imported._0.state)).toBe(FaceletCodec.render(stateAfter("R")));
  expect(imported._0.ignoredCentreOrientations).toEqual(["+r"]);
});

test("imports oriented, disjoint corner and edge cycles and enforces solvability", () => {
  const imported = parseSseState("(+ulb,urf) (-ufl) (ul,ur)");
  expect(imported.TAG).toBe("Ok");
  expect(imported._0.state.size).toBe(3);

  const impossible = parseSseState("(ulb,urf)");
  expect(impossible.TAG).toBe("Error");
  expect(impossible._0).toMatch(/permutation parity|Impossible state/i);
});

test("accepts marked-centre rotations as explicitly inert metadata", () => {
  const imported = parseSseState("(++r) (-u)");
  expect(imported.TAG).toBe("Ok");
  expect(imported._0.ignoredCentreOrientations).toEqual(["++r", "-u"]);
  expect(FaceletCodec.render(imported._0.state)).toBe(FaceletCodec.render(StateTypes.solved(3)._0));
});

test("recognizes SSE state candidates and rejects malformed cycles", () => {
  expect(looksLikeSseState("(ulb,urf) (ur,ul)")).toBe(true);
  expect(looksLikeSseState("R U R' U'")).toBe(false);
  const malformed = parseSseState("(ulb,urf) trailing");
  expect(malformed.TAG).toBe("Error");
  expect(malformed._0).toMatch(/Unexpected SSE state input/);
});
