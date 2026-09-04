import {expect, test} from "vitest";

import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as PieceReducer from "../../src/State/PieceReducer.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import {looksLikeAcubeState, parseAcubeState} from "../../src/client/acube-state";
import {countAcubeCompletions, isFixedAcubeConstraint, materializeAcubeConstraint, parseAcubeConstraint, renderAcubeState} from "../../src/client/acube-engine";

const cornerLabels = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"];
const edgeLabels = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"];
const acubeEdgePositions = ["UF", "UL", "UB", "UR", "DF", "DR", "DB", "DL", "FR", "FL", "BR", "BL"];
const acubeCornerPositions = ["URB", "URF", "UBL", "ULF", "DRF", "DFL", "DLB", "DBR"];

const slotFor = (labels: string[], label: string): number =>
  labels.findIndex((candidate) => [...candidate].sort().join("") === [...label].sort().join(""));

const rotate = (label: string, amount: number): string => label.slice(amount) + label.slice(0, amount);

const stateAfter = (algorithm: string) => {
  const parsed = MoveParser.parse(3, algorithm);
  expect(parsed.TAG).toBe("Ok");
  const applied = MoveExecutor.applyAlg(StateTypes.solved(3)._0, parsed._0);
  expect(applied.TAG).toBe("Ok");
  return applied._0;
};

const acubePositional = (state: unknown): string => {
  const pieces = PieceReducer.reduce(state)._0;
  const edges = acubeEdgePositions.map((position) => {
    const slot = slotFor(edgeLabels, position);
    return rotate(edgeLabels[pieces.ep[slot]], pieces.eo[slot]);
  });
  const corners = acubeCornerPositions.map((position) => {
    const slot = slotFor(cornerLabels, position);
    return rotate(cornerLabels[pieces.cp[slot]], pieces.co[slot]);
  });
  return [...edges, ...corners].join(" ");
};

test("imports ACube's documented positional state order", () => {
  const solved = "UF UL UB UR DF DR DB DL FR FL BR BL URB UFR UBL ULF DRF DFL DLB DBR";
  const imported = parseAcubeState(solved);
  expect(imported.TAG).toBe("Ok");
  expect(FaceletCodec.render(imported._0.state)).toBe(FaceletCodec.render(StateTypes.solved(3)._0));

  const scrambled = stateAfter("R U F2 L' D B");
  const roundTrip = parseAcubeState(acubePositional(scrambled));
  expect(roundTrip.TAG).toBe("Ok");
  expect(FaceletCodec.render(roundTrip._0.state)).toBe(FaceletCodec.render(scrambled));
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
});
