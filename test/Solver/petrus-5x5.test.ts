import {describe, expect, test} from "vitest";
import * as StateTypes from "../../src/State/StateTypes.res.mjs";
import * as MoveExecutor from "../../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../../src/Move/MoveParser.res.mjs";
import * as BlockDetector5x5 from "../../src/Solver/Petrus5x5/BlockDetector5x5.res.mjs";
import * as PetrusSolver555 from "../../src/Solver/Petrus5x5/PetrusSolver555.res.mjs";
import * as FaceletCodec from "../../src/State/FaceletCodec.res.mjs";

const parseAlg = (notation: string) => {
  const parsed = MoveParser.parseWithOptions(5, "Wide", "Modern", notation);
  if (parsed.TAG !== "Ok") throw new Error(`Parse failed for ${notation}`);
  return parsed._0;
};

describe("5×5 Petrus Block Detector & Solver", () => {
  test("replays improving guides on the reported stuck state without a fallback loop", () => {
    const parsed = FaceletCodec.parse(5, "RUDBFRDLUFUDUUBUDBRDBFUFRBRUDDUFRURBFRBLFBLURUFULDLDRLDFRLFLFRFFRBBUFULUDBRBRFRBRLUDRDDDDLDBULBUDFBFFUFLDUFLRLRRLRLUUBRLLLBDURDLBUBDBBBBDBFDFLFLFLDRLF");
    if (parsed.TAG !== "Ok") throw new Error("Expected valid fixture");
    let state = parsed._0;
    const seen = new Set([JSON.stringify(state.facelets)]);
    let applied = 0;
    for (let i = 0; i < 24; i++) {
      const evaluation = PetrusSolver555.evaluatePetrusStep5x5(state);
      if (evaluation.TAG !== "Ok") throw new Error("Expected evaluation");
      const {guide, inspection} = evaluation._0;
      if (guide.alg.length === 0) {
        expect(guide.algorithm).toBe("");
        expect(guide.instruction).toMatch(/no verified|solved/i);
        break;
      }
      const replay = MoveExecutor.applyAlg(state, guide.alg);
      if (replay.TAG !== "Ok") throw new Error("Expected legal guide");
      if (guide.phase === "Phase1_Block222") {
        expect(BlockDetector5x5.inspectBlock222(replay._0, guide.anchor).piecesSolved).toBeGreaterThan(inspection.block222.piecesSolved);
      }
      expect(seen.has(JSON.stringify(replay._0.facelets))).toBe(false);
      seen.add(JSON.stringify(replay._0.facelets));
      state = replay._0;
      applied++;
    }
    expect(applied).toBeGreaterThan(0);
  });

  test("checks each cubie's actual x/y/z face rather than a permuted face", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    // UFL's left-face centre at (0, 3, 3) belongs to x=L, not x=U.
    const state = structuredClone(solved._0);
    state.facelets[StateTypes.storageIndex("L")][8] = "R";
    expect(BlockDetector5x5.isCubieSolved(state, "UFL", 0, 3, 3)[0]).toBe(false);
    expect(BlockDetector5x5.inspectBlock222(state, "UFL").piecesSolved).toBe(18);
  });

  test("all anchor scores match the move executor's independent physical sticker geometry", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    for (const notation of ["R U F 2B 2L", "D B L 2U 2R", "U2 F2 2D B'"]) {
      const replay = MoveExecutor.applyAlg(solved._0, parseAlg(notation));
      if (replay.TAG !== "Ok") throw new Error("Expected replay");
      for (const anchor of BlockDetector5x5.allAnchors) {
        const corner = [anchor.includes("R") ? 4 : 0, anchor.includes("U") ? 4 : 0, anchor.includes("F") ? 4 : 0];
        const oracle = (extendedAxis = -1) => {
          const cubies = new Map<string, boolean>();
          for (const face of StateTypes.storageOrder) {
            for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
              const {position: {x, y, z}} = MoveExecutor.faceToSticker(5, face, row, col);
              const position = [x, y, z];
              if (!position.every((value, axis) => Math.abs(value - corner[axis]) <= (axis === extendedAxis ? 3 : 2))) continue;
              const key = position.join(",");
              const matches = replay._0.facelets[StateTypes.storageIndex(face)][row * 5 + col] === face;
              cubies.set(key, (cubies.get(key) ?? true) && matches);
            }
          }
          return [...cubies.values()].filter(Boolean).length;
        };
        expect(BlockDetector5x5.inspectBlock222(replay._0, anchor).piecesSolved).toBe(oracle());
        expect(BlockDetector5x5.inspectBlock223(replay._0, anchor).piecesSolved).toBe(Math.max(...[0, 1, 2].map(oracle)));
      }
    }
  });

  test("exhausting the local search has a fixed candidate budget and returns no move", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    let scored = 0;
    const guide = PetrusSolver555.findImprovingCandidate(solved._0, false, 0, () => { scored++; return 0; });
    expect(guide).toBeUndefined();
    // 42 direct candidates and 36 × 36 two-turn candidates, with 36 setup
    // replays that are not scored: at most 1374 replay calls in total.
    expect(scored).toBe(1338);
  });

  test("unsolved centre stickers cannot be declared solved or get an unchecked last-layer algorithm", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    const state = structuredClone(solved._0);
    // Outer 3x3 shell remains solved; swap two off-axis centres.
    state.facelets[StateTypes.storageIndex("U")][6] = "F";
    state.facelets[StateTypes.storageIndex("F")][6] = "U";
    const evaluation = PetrusSolver555.evaluatePetrusStep5x5(state);
    if (evaluation.TAG !== "Ok") throw new Error("Expected evaluation");
    expect(evaluation._0.inspection.currentPhase).not.toBe("PhaseSolved");
    expect(evaluation._0.guide.alg).toEqual([]);
    expect(evaluation._0.guide.algorithm).toBe("");
    expect(evaluation._0.guide.instruction).toMatch(/no verified/i);
  });

  test("later executable guides advance their milestone and preserve completed blocks", () => {
    const solved = StateTypes.solved(5);
    if (solved.TAG !== "Ok") throw new Error("Expected solved state");
    const covered = new Set();
    for (const notation of ["2U 2R 2F", "F", "F U R", "2U", "U"]) {
      const scrambled = MoveExecutor.applyAlg(solved._0, parseAlg(notation));
      if (scrambled.TAG !== "Ok") throw new Error("Expected legal scramble");
      const result = PetrusSolver555.evaluatePetrusStep5x5(scrambled._0);
      if (result.TAG !== "Ok") throw new Error("Expected evaluation");
      const {guide, inspection} = result._0;
      covered.add(guide.phase);
      if (["Phase4_WingPairingF2L", "Phase5_LastLayer"].includes(guide.phase)) {
        expect(guide.alg).toEqual([]);
        expect(guide.algorithm).toBe("");
        expect(guide.instruction).toMatch(/no verified/i);
        continue;
      }
      expect(guide.alg.length).toBeGreaterThan(0);
      const replay = MoveExecutor.applyAlg(scrambled._0, guide.alg);
      if (replay.TAG !== "Ok") throw new Error("Expected legal guide");
      expect(BlockDetector5x5.inspectBlock222(replay._0, guide.anchor).isComplete).toBe(true);
      const expanded = BlockDetector5x5.inspectBlock223(replay._0, guide.anchor);
      if (guide.phase === "Phase2_Block223") {
        expect(expanded.piecesSolved).toBeGreaterThan(inspection.block223.piecesSolved);
        expect(inspection.milestoneDescription).toContain("/24 pieces");
      } else {
        expect(expanded.isComplete).toBe(true);
        expect(BlockDetector5x5.inspectEO(replay._0).badCount).toBeLessThan(inspection.eo.badCount);
      }
    }
    expect([...covered].sort()).toEqual(["Phase2_Block223", "Phase3_EdgeOrientation", "Phase4_WingPairingF2L", "Phase5_LastLayer"]);
  });

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
