import {describe, expect, test} from "bun:test";

import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import type {CubeState, MoveStep} from "../../src/client/cube-gl";
import {
  cubies,
  focusForPiece,
  phaseMilestonePositions,
  selectPhasePiece,
  selectTutorialPiece,
} from "../../src/client/tutorial-focus";

const solved = StateTypes.solved(3)._0 as CubeState;
const step = (face: "U" | "L" | "F" | "R" | "B" | "D", turns = 1): MoveStep => ({
  move: {TAG: "FaceTurn", _0: face, _1: {from_: 1, to_: 1}},
  turns,
});

describe("Beginner Academy cubie focus", () => {
  test("maps every edge and corner identity to one centre-relative target", () => {
    const pieces = cubies(solved);
    expect(pieces.filter(({stickers}) => stickers.length === 2)).toHaveLength(12);
    expect(pieces.filter(({stickers}) => stickers.length === 3)).toHaveLength(8);
    expect(new Set(pieces.map(({piece}) => piece)).size).toBe(20);
    expect(pieces.every(({piece, target}) => piece === target)).toBe(true);
  });

  test("selects a phase-relevant piece changed by a teaching sequence", () => {
    const scrambled = MoveExecutor.applyStep(solved, step("R")) as CubeState;
    const restored = MoveExecutor.applyStep(scrambled, step("R", -1)) as CubeState;
    const piece = selectTutorialPiece(scrambled, restored, 2);
    expect(piece).not.toBeNull();
    expect(piece).toContain("U");
    expect(focusForPiece(scrambled, piece!)).toMatchObject({piece});
  });

  test("keeps destinations aligned to centres after a whole-cube regrip", () => {
    const rotated = MoveExecutor.applyStep(solved, {
      move: {TAG: "Rotation", _0: "X"},
      turns: 2,
    }) as CubeState;
    const focus = focusForPiece(rotated, "FU");
    expect(focus).not.toBeNull();
    expect(focus?.source).toEqual(focus?.target);
    expect(focus?.target).toEqual([0, -1, -1]);
  });

  test("does not infer tutorial focus outside supported 3x3 phases", () => {
    expect(selectTutorialPiece(solved, solved, 0)).toBeNull();
    expect(selectTutorialPiece(solved, solved, 8)).toBeNull();
  });

  test("provides a stable phase-level piece when no sequence delta identifies one", () => {
    const scrambled = MoveExecutor.applyStep(solved, step("R")) as CubeState;
    expect(selectPhasePiece(scrambled, 2)).toContain("U");
    expect(selectPhasePiece(solved, 2)).toBe("BLU");
  });

  test("enumerates the verified cubies highlighted at each milestone", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((phase) =>
      phaseMilestonePositions(solved, phase).length
    )).toEqual([4, 8, 12, 4, 8, 4, 20]);
    expect([8, 9, 10, 11, 12, 13, 14].map((phase) =>
      phaseMilestonePositions(solved, phase).length
    )).toEqual([4, 7, 12, 12, 4, 4, 4]);
  });
});
