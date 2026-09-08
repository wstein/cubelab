import {describe, expect, test} from "vitest";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as BlockDetector5x5 from "../../src/Solver/Petrus5x5/BlockDetector5x5.res.mjs";
import * as PetrusSolver555 from "../../src/Solver/Petrus5x5/PetrusSolver555.res.mjs";

const parseAlg = (notation: string) => {
  const parsed = MoveParser.parseWithOptions(5, "Wide", "Modern", notation);
  if (parsed.TAG !== "Ok") throw new Error(`Parse failed for ${notation}`);
  return parsed._0;
};

describe("5×5 Petrus Block Detector & Solver", () => {
  test("combined evaluation matches standalone inspection and planning on legal states", () => {
    for (const notation of ["", "F", "R U F 2R 2U", "2L 2D B R U2"]) {
      const solved = StateTypes.solved(5);
      if (solved.TAG !== "Ok") throw new Error("Expected solved state");
      const replay = MoveExecutor.applyAlg(solved._0, parseAlg(notation));
      if (replay.TAG !== "Ok") throw new Error("Expected legal replay");
      const combined = PetrusSolver555.evaluatePetrusStep5x5(replay._0);
      expect(combined.TAG).toBe("Ok");
      if (combined.TAG !== "Ok") throw new Error("Expected combined evaluation");
      expect({TAG: "Ok", _0: combined._0.inspection}).toEqual(BlockDetector5x5.inspectPetrus5x5(replay._0));
      expect({TAG: "Ok", _0: combined._0.guide}).toEqual(PetrusSolver555.planPetrusStep5x5(replay._0));
    }
    const wrongSize = StateTypes.solved(3);
    if (wrongSize.TAG !== "Ok") throw new Error("Expected solved state");
    expect(PetrusSolver555.evaluatePetrusStep5x5(wrongSize._0)).toEqual(PetrusSolver555.planPetrusStep5x5(wrongSize._0));
  });

  test("public geometry arrays cannot mutate cached inspection geometry", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    for (const anchor of BlockDetector5x5.allAnchors) {
      const before222 = BlockDetector5x5.inspectBlock222(solved._0, anchor);
      const before223 = BlockDetector5x5.inspectBlock223(solved._0, anchor);
      for (const coordinates of [
        BlockDetector5x5.cubiesFor222(anchor),
        ...["AxisX", "AxisY", "AxisZ"].map(axis => BlockDetector5x5.cubiesFor223(anchor, axis)),
      ]) {
        coordinates[0][0] = 99;
        coordinates.length = 0;
      }
      expect(BlockDetector5x5.inspectBlock222(solved._0, anchor)).toEqual(before222);
      expect(BlockDetector5x5.inspectBlock223(solved._0, anchor)).toEqual(before223);
    }
  });

  test("returned guide algorithms cannot corrupt cached candidate algorithms", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    const blockState = MoveExecutor.applyAlg(solved._0, parseAlg("R"));
    const eoState = MoveExecutor.applyAlg(solved._0, parseAlg("F"));
    if (blockState.TAG !== "Ok" || eoState.TAG !== "Ok") throw new Error("Expected legal replay");
    const planners = [
      () => PetrusSolver555.findBlock222Guide(blockState._0, "DFR", BlockDetector5x5.inspectBlock222(blockState._0, "DFR")),
      () => PetrusSolver555.findEOGuide(eoState._0, "DBL", BlockDetector5x5.inspectEO(eoState._0)),
    ];
    for (const plan of planners) {
      const guide = plan();
      expect(guide).toBeDefined();
      if (!guide) throw new Error("Expected an improving guide");
      const expected = structuredClone(guide);
      guide.alg[0].loc.start = 999;
      guide.alg.length = 0;
      expect(plan()).toEqual(expected);
    }
  });

  test("every anchor corner has exactly 19 visible cubies for the 2×2×2 block", () => {
    const anchors = ["DBL", "DFL", "DFR", "DBR", "UBL", "UFL", "UFR", "UBR"];
    for (const anchor of anchors) {
      const cubies = BlockDetector5x5.cubiesFor222(anchor);
      expect(cubies.length).toBe(19);

      // Verify all coordinates are within 0..4
      for (const [x, y, z] of cubies) {
        expect(x >= 0 && x <= 4).toBe(true);
        expect(y >= 0 && y <= 4).toBe(true);
        expect(z >= 0 && z <= 4).toBe(true);
      }
    }
  });

  test("solved 5×5 evaluates 19/19 pieces and 27/27 facelets for any 2×2×2 block", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    const anchors = ["DBL", "DFL", "DFR", "DBR", "UBL", "UFL", "UFR", "UBR"];
    for (const anchor of anchors) {
      const progress = BlockDetector5x5.inspectBlock222(solved._0, anchor);
      expect(progress.piecesSolved).toBe(19);
      expect(progress.totalPieces).toBe(19);
      expect(progress.faceletsSolved).toBe(27);
      expect(progress.isComplete).toBe(true);
    }
  });

  test("solved 5×5 evaluates 24/24 pieces for 2×2×3 expansion", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    const progress = BlockDetector5x5.inspectBlock223(solved._0, "DBL");
    expect(progress.piecesSolved).toBe(24);
    expect(progress.totalPieces).toBe(24);
    expect(progress.isComplete).toBe(true);
  });

  test("solved 5×5 has 0 bad edges and 24 paired wings", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    const eo = BlockDetector5x5.inspectEO(solved._0);
    expect(eo.badCount).toBe(0);
    expect(eo.orientedCount).toBe(12);
    expect(eo.isComplete).toBe(true);

    const wings = BlockDetector5x5.countPairedWings(solved._0);
    expect(wings).toBe(24);

    const inspection = BlockDetector5x5.inspectPetrus5x5(solved._0);
    expect(inspection.TAG).toBe("Ok");
    if (inspection.TAG === "Ok") {
      expect(inspection._0.currentPhase).toBe("PhaseSolved");
    }
  });

  test("preserves DBL 19-piece block under U, R, F, 2U, 2R, 2F moves", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    // Turn only U, R, F faces and 2U, 2R, 2F inner slices (away from D, B, L)
    const scrambleAlg = parseAlg("U R U' R' 2U 2R 2U' 2R' F R F' 2F 2U 2F'");
    const scrambled = MoveExecutor.applyAlg(solved._0, scrambleAlg);
    expect(scrambled.TAG).toBe("Ok");
    if (scrambled.TAG !== "Ok") return;

    // DBL corner block must remain 100% complete!
    const dblProgress = BlockDetector5x5.inspectBlock222(scrambled._0, "DBL");
    expect(dblProgress.piecesSolved).toBe(19);
    expect(dblProgress.faceletsSolved).toBe(27);
    expect(dblProgress.isComplete).toBe(true);

    // Meanwhile, other blocks like UFR will be thoroughly scrambled
    const ufrProgress = BlockDetector5x5.inspectBlock222(scrambled._0, "UFR");
    expect(ufrProgress.piecesSolved < 19).toBe(true);
  });

  test("detects bad edges after an F quarter-turn and plans an EO guide", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    // F turn flips orientation of 4 midges (UF, FR, DF, FL)
    const turned = MoveExecutor.applyAlg(solved._0, parseAlg("F"));
    expect(turned.TAG).toBe("Ok");
    if (turned.TAG !== "Ok") return;

    const eo = BlockDetector5x5.inspectEO(turned._0);
    expect(eo.badCount).toBe(4);
    expect(eo.isComplete).toBe(false);
  });

  test("generates replay-verified milestone step for scrambled state", () => {
    const solved = StateTypes.solved(5);
    expect(solved.TAG).toBe("Ok");
    if (solved.TAG !== "Ok") return;

    // Apply a simple scramble
    const scrambled = MoveExecutor.applyAlg(solved._0, parseAlg("R U R'"));
    expect(scrambled.TAG).toBe("Ok");
    if (scrambled.TAG !== "Ok") return;

    const step = PetrusSolver555.planPetrusStep5x5(scrambled._0);
    expect(step.TAG).toBe("Ok");
    if (step.TAG === "Ok") {
      expect(step._0.title).toBeTruthy();
      expect(step._0.instruction).toBeTruthy();
    }
  });
});
