import {expect, test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {looksLikeSseState, parseSseState, renderSseState} from "../../src/client/sse-state";

const stateAfter = (algorithm: string, size = 3) => {
  const parsed = MoveParser.parse(size, algorithm);
  expect(parsed.TAG).toBe("Ok");
  const applied = MoveExecutor.applyAlg(StateTypes.solved(size)._0, parsed._0);
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

test("imports corner-only SSE cycles as valid 2×2 states", () => {
  const input = "(ufl,ubr) (dlf,drb) (dfr,dbl)";
  const imported = parseSseState(input, 2);
  expect(imported.TAG).toBe("Ok");
  expect(FaceletCodec.render(imported._0.state)).toBe(FaceletCodec.render(stateAfter("R F' R U R' D2 L' U' B' U B2", 2)));
  const unsupported = parseSseState("(ur,uf)", 2);
  expect(unsupported.TAG).toBe("Error");
  expect(unsupported._0).toMatch(/2×2 SSE state may describe corners only/);
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

test("renders a round-trippable SSE state, including 2×2 and solved", () => {
  for (const [state, size] of [
    [StateTypes.solved(2)._0, 2],
    [stateAfter("R U F2 L' D B"), 3],
    [StateTypes.solved(3)._0, 3],
  ] as const) {
    const rendered = renderSseState(state);
    expect(rendered.TAG).toBe("Ok");
    const reparsed = parseSseState(rendered._0, size);
    expect(reparsed.TAG).toBe("Ok");
    expect(FaceletCodec.render(reparsed._0.state)).toBe(FaceletCodec.render(state));
  }
});

test("imports SSE's numbered 5×5 wings and centres", () => {
  const input = "(ur1,rf1,fu1) (rb1,fd1,ul1) (bd1,dl1,lb1) (ur2,rf2,fu2) (rb2,fd2,ul2) (bd2,dl2,lb2) (r5,++r7) (b5,++b7) (r1,++f3,++u3,++r3,f1,u1) (l1,b1,++d3,++l3,++b3,d1) (r2,++f4,++u4,++r4,f2,u2) (l2,b2,++d4,++l4,++b4,d2) (r6,++r8,f6,u6) (l6,b6,++b8,d6)";
  const imported = parseSseState(input, 5);
  if (imported.TAG === "Error") throw new Error(imported._0);
  expect(imported.TAG).toBe("Ok");
  if (imported.TAG === "Ok") {
    expect(imported._0.state.size).toBe(5);
    expect(imported._0.ignoredCentreOrientations).toContain("++r7");
    expect(FaceletCodec.render(imported._0.state)).toBe("UUUUUFFFFFUUUUUFFUFFUFUFURURURUURUURRRRRUUUUURRRRRFRFRFFRFRRFRFFFFRFRRFRFRFDBDBDBBDBDDDDBDBBDBDDBDBDLDLDLDDLDLLLLDLDDLDLLDLDLBBBBBLLLLLBBBBBLLBLLBLBLB");
  }
});
