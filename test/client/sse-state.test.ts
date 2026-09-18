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
  expect(looksLikeSseState(
    "D2 (F2 R2)3 D2 L2 (u2 F2)2 f2 u2 f2 L2 r2 u2 (f2 u2 r2)3 u2 r2",
  )).toBe(false);
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

test("imports 5×5 SSE corners, middges, and fixed centres", () => {
  const input = "(ur1,dl1) (rf1,lb1) (dr1,ul1) (bu1,fd1) (rb1,lf1) (bd1,fu1) (ur2,dl2) (rf2,lb2) (dr2,ul2) (bu2,fd2) (rb2,lf2) (bd2,fu2) (r,-f,++u) (l,+b,++d) (r1,+f2,++u3,++r3,-f4,u1) (f1,+u2,+r2,++f3,-u4,-r4) (l1,-b4,++d3,++l3,+b2,d1) (b1,-d4,-l4,++b3,+d2,+l2) (r5,b5,++u7,-l8,-f8,+d6) (u5,+l6,+f6,-d8,++r7,++b7) (f5,d5,+r6,-b8,-u8,++l7) (l5,++f7,++d7,-r8,+b6,+u6)";
  const imported = parseSseState(input, 5);
  expect(imported.TAG).toBe("Ok");
  if (imported.TAG === "Ok") expect(imported._0.state.size).toBe(5);
});

for (const size of [4, 5] as const) {
  test(`native ${size}×${size} scramble fixture matches executed moves`, () => {
    const fixture = "(+urf) (-ufl,ulb,ubr,bdr,dfr) (ur1,br1,dr1,fr1,uf1,ul1,ub1) (ur2,br2,dr2,fr2,uf2,ul2,ub2)"
      + (size === 5 ? " (ur,br,dr,fr,uf,ul,ub)" : "");
    const expected = stateAfter("R U", size);
    expect(parseSseState(fixture, size)).toEqual({TAG: "Ok", _0: {state: expected, ignoredCentreOrientations: []}});
    expect(renderSseState(expected)).toEqual({TAG: "Ok", _0: fixture});
  });

  test(`native ${size}×${size} SSE preserves stickers through seeded scramble prefixes`, () => {
    let seed = 421;
    let state = StateTypes.solved(size)._0;
    const moves = ["R", "U'", "F2", "Lw", "2B'", "Dw2", "x", "y'", ...(size === 5 ? ["3R", "3F'"] : [])];
    for (let step = 0; step < 80; step += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      state = MoveExecutor.applyAlg(state, MoveParser.parse(size, moves[seed % moves.length])._0)._0;
      const rendered = renderSseState(state);
      if (rendered.TAG === "Error") throw new Error(rendered._0);
      const parsed = parseSseState(rendered._0, size);
      if (parsed.TAG === "Error") throw new Error(parsed._0);
      expect(parsed._0.state).toEqual(state);
    }
  });

  test(`native ${size}×${size} SSE exports solved, scramble, centre-only and wing-only states`, () => {
    const fixtures = [
      StateTypes.solved(size)._0,
      stateAfter("R U F2 L' D B Rw U2 Fw' x", size),
      ...["(r1,u2,f3)", "(ur1,rf1,fu1)", "(+urf) (-ufl)", "(+ur1) (+uf2)",
        ...(size === 5 ? ["(r5,u6,f7) (r,u,f)", "(+ur) (+uf)"] : []),
      ].map((input) => {
        const parsed = parseSseState(input, size);
        if (parsed.TAG === "Error") throw new Error(parsed._0);
        return parsed._0.state;
      }),
    ];
    for (const state of fixtures) {
      const rendered = renderSseState(state);
      if (rendered.TAG === "Error") throw new Error(rendered._0);
      expect(rendered._0).toMatch(/^(\([+\-ulfrbd0-9,]+\)\s*)+$/);
      const parsed = parseSseState(rendered._0, size);
      if (parsed.TAG === "Error") throw new Error(`${rendered._0}: ${parsed._0}`);
      expect(parsed._0.state).toEqual(state);
      expect(renderSseState(parsed._0.state)).toEqual(rendered);
    }
  });

  test(`large ${size}×${size} prefixes agree with small-cube corner orientations`, () => {
    const large = parseSseState("(+urf) (-ufl)", size);
    const small = parseSseState("(+urf) (-ufl)", 2);
    if (large.TAG === "Error" || small.TAG === "Error") throw new Error("Import failed");
    const corners = [0, size - 1, size * (size - 1), size * size - 1];
    expect(large._0.state.facelets.map((face) => corners.map((index) => face[index])))
      .toEqual(small._0.state.facelets);
    expect(parseSseState("(ur1) (ru2)", size).TAG).toBe("Error");
  });
}

test("4×4 numbered parts use CubeTwister's RevengeCube sticker positions", () => {
  const parsed = parseSseState("(ur1,rf1) (r1,u1)", 4);
  if (parsed.TAG === "Error") throw new Error(parsed._0);
  const expected = StateTypes.solved(4)._0;
  expected.facelets[3][2] = "F";
  expected.facelets[2][11] = "R";
  expected.facelets[3][8] = "U";
  expected.facelets[0][7] = "R";
  expected.facelets[3][10] = "U";
  expected.facelets[0][5] = "R";
  expect(parsed._0.state).toEqual(expected);
});
