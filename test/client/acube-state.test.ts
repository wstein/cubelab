import {expect, test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as PieceReducer from "../../src/State/PieceReducer.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {looksLikeAcubeState, parseAcubeState} from "../../src/client/acube-state";
import {countAcubeCompletions, isFixedAcubeConstraint, materializeAcubeConstraint, parseAcubeConstraint, renderAcubeState} from "../../src/client/acube-engine";

const stateAfter = (algorithm: string) => {
  const parsed = MoveParser.parse(3, algorithm);
  expect(parsed.TAG).toBe("Ok");
  const applied = MoveExecutor.applyAlg(StateTypes.solved(3)._0, parsed._0);
  expect(applied.TAG).toBe("Ok");
  return applied._0;
};

test("imports ACube's documented positional state order", () => {
  const solved = "UF UR UB UL DF DR DB DL FR FL BR BL UFR URB UBL ULF DRF DFL DLB DBR";
  const imported = parseAcubeState(solved);
  if (imported.TAG === "Error") throw new Error(imported._0);
  expect(imported.TAG).toBe("Ok");
  expect(FaceletCodec.render(imported._0.state)).toBe(FaceletCodec.render(StateTypes.solved(3)._0));

  const scrambled = stateAfter("R U F2 L' D B");
  const rendered = renderAcubeState(scrambled);
  expect(rendered.TAG).toBe("Ok");
  if (rendered.TAG === "Error") throw new Error(rendered._0);
  const roundTrip = parseAcubeState(rendered._0);
  expect(roundTrip.TAG).toBe("Ok");
  expect(FaceletCodec.render(roundTrip._0.state)).toBe(FaceletCodec.render(scrambled));
});

test("imports ACube's published Cube in a Cube and Anaconda positional states", () => {
  const cubeInCube = "UF UR FL FD BR BU DB DL FR RD LU BL UFR FUL FLD FDR BUR BRD DLB BLU";
  const anaconda = "FR FU UB UL DF DR BL BD RU FL BR LD FRU FUL FLD FDR BUR BRD BDL BLU";
  const cube = parseAcubeState(cubeInCube);
  const snake = parseAcubeState(anaconda);
  expect(cube.TAG).toBe("Ok");
  expect(snake.TAG).toBe("Ok");
  expect(renderAcubeState(stateAfter("F L F U' R U F2 L2 U' L' B D' B' L2 U"))).toEqual({TAG: "Ok", _0: cubeInCube});
  expect(renderAcubeState(stateAfter("L U B' U' R L' B R' F B' D R D' F'"))).toEqual({TAG: "Ok", _0: anaconda});
  if (cube.TAG === "Ok") {
    expect(FaceletCodec.render(cube._0.state)).toBe(FaceletCodec.render(stateAfter("F L F U' R U F2 L2 U' L' B D' B' L2 U")));
  }
  if (snake.TAG === "Ok") {
    expect(FaceletCodec.render(snake._0.state)).toBe(FaceletCodec.render(stateAfter("L U B' U' R L' B R' F B' D R D' F'")));
  }
});

test("imports ACube cycles and standalone orientation terms", () => {
  const tPerm = parseAcubeState("(UL UR) (UFR URB)");
  expect(tPerm.TAG).toBe("Ok");
  expect(FaceletCodec.render(tPerm._0.state)).toBe(
    FaceletCodec.render(stateAfter("R U R' U' R' F R2 U' R' U' R U R' F'")),
  );

  const oriented = parseAcubeState("UFR- URB+ UL- UF-");
  expect(oriented.TAG).toBe("Ok");
  expect(PieceReducer.reduce(oriented._0.state)._0.co).toEqual([2, 0, 0, 1, 0, 0, 0, 0]);
  expect(PieceReducer.reduce(oriented._0.state)._0.eo).toEqual([0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test("does not confuse ACube state forms with normal grouped algorithms and refuses partial constraints", () => {
  expect(looksLikeAcubeState("(R U)2")).toBe(false);
  expect(looksLikeAcubeState("R U R' @0.5s")).toBe(false);
  expect(looksLikeAcubeState("[R, U]")).toBe(false);
  expect(looksLikeAcubeState("[M: U2]")).toBe(false);
  expect(looksLikeAcubeState("// What about this?\nR U R'")).toBe(false);
  expect(looksLikeAcubeState(`// CFOP 1: Cross
(x2) @0.5s (R2 F2 L2 D2 F') @1.2s

// CFOP 2: F2L Pairs
(B L2 B' L2) @0.5s (R' U2 B' R' B R) @0.5s (U' L U L') @0.5s (R U R') @1.2s

// CFOP 3: One-Look OLL
(R2 D R' U2 R D' R' U2 R') @1.2s

// CFOP 4: One-Look PLL
(R' U R' U' R D' R' D R' U D' R2 U' R2 D R2) @0.5s (U) @0.5s (x2) @0.5s`)).toBe(false);
  expect(looksLikeAcubeState("(UL UR) (UFR URB)")).toBe(true);
  expect(looksLikeAcubeState("(ul ur) (ufr urb)")).toBe(false);
  expect(looksLikeAcubeState("(ul ur) (ufr urb)", true)).toBe(true);
  expect(parseAcubeState("(UL UR) [DF DL DR DB]")).toEqual({
    TAG: "Error",
    _0: expect.stringMatching(/not fixed.*generator/i),
  });
  expect(parseAcubeState("UF? UB?")).toEqual({TAG: "Error", _0: expect.stringMatching(/not fixed.*generator/i)});
});

test("compiles ACube wildcards and materializes reproducible legal completions", () => {
  const parsed = parseAcubeConstraint("(UL UR) (UFR URB) [DF DL DR DB] UF? UB?");
  expect(parsed.TAG).toBe("Ok");
  expect(isFixedAcubeConstraint(parsed._0)).toBe(false);
  const first = materializeAcubeConstraint(parsed._0, "drill-42");
  const repeated = materializeAcubeConstraint(parsed._0, "drill-42");
  expect(first.TAG).toBe("Ok");
  expect(repeated.TAG).toBe("Ok");
  expect(FaceletCodec.render(first._0)).toBe(FaceletCodec.render(repeated._0));
  const unfolded = renderAcubeState(first._0);
  expect(unfolded.TAG).toBe("Ok");
  expect(parseAcubeState(unfolded._0).TAG).toBe("Ok");
  const pieces = PieceReducer.reduce(first._0)._0;
  expect(pieces.ep[2]).toBe(0);
  expect(pieces.ep[0]).toBe(2);
  expect(pieces.cp[0]).toBe(3);
  expect(pieces.cp[3]).toBe(0);
});

test("counts ACube completion families before sampling representatives", () => {
  const fourEdges = parseAcubeConstraint("[DF DL DR DB]");
  expect(fourEdges.TAG).toBe("Ok");
  expect(countAcubeCompletions(fourEdges._0)).toBe(12n);
  const topPieces = parseAcubeConstraint("[U*]");
  expect(topPieces.TAG).toBe("Ok");
  expect(countAcubeCompletions(topPieces._0)).toBe(288n);
  const parityMismatch = parseAcubeConstraint("(UL UR)");
  expect(parityMismatch.TAG).toBe("Ok");
  expect(countAcubeCompletions(parityMismatch._0)).toBe(0n);
});
