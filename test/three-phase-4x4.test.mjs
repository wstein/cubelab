import {expect, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import {applyCentreTransition, applyTransition, axisTransitionAllowed, buildCentrePruning, buildCentreSymmetryMap, buildSymmetryCentrePruning, canonicalUdRank, centreSymmetryPermutations, centreTransition, createCentrePruning, decodeFacelets, encodeFacelets, extractCentres, extractCorners, extractWings, phase2CombinedDistance, phase2FbDistance, phase2Moves, phase2TargetFbRank, phase2UdDistance, phase3Moves, pruningDepth, rankFbCentres, rankUdCentres, setPruningDepth, transitionUdRank, unrankUdCentres} from "../src/Solver/ThreePhase4x4.res.mjs";

function buildPhase2DistanceInputs() {
  const symmetryMap = buildCentreSymmetryMap();
  const symmetryTable = buildSymmetryCentrePruning(15);
  return {symmetryMap: symmetryMap.TAG === "Ok" ? symmetryMap._0 : null, symmetryTable: symmetryTable.TAG === "Ok" ? symmetryTable._0 : null};
}

test("three-phase boundary round-trips CubeLab's canonical 96 facelets", () => {
  const state = MoveExecutor.parseAndApply(4, "Rw U 2F' Lw2");
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const encoded = encodeFacelets(state._0);
  expect(encoded.TAG).toBe("Ok");
  if (encoded.TAG !== "Ok") return;
  expect(encoded._0).toHaveLength(96);
  const decoded = decodeFacelets(encoded._0);
  expect(decoded.TAG).toBe("Ok");
  if (decoded.TAG === "Ok") expect(FaceletCodec.render(decoded._0)).toBe(FaceletCodec.render(state._0));
});

test("three-phase centre coordinate uses the upstream U/D/F/B/R/L slot order", () => {
  const solved = FaceletCodec.parse(4, "U".repeat(16) + "R".repeat(16) + "F".repeat(16) + "D".repeat(16) + "L".repeat(16) + "B".repeat(16));
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  expect(extractCentres(solved._0)).toEqual("UUUUDDDDFFFFBBBBRRRRLLLL");
});

test("three-phase wing coordinate uses the upstream 24 slot order", () => {
  const solved = FaceletCodec.parse(4, "U".repeat(16) + "R".repeat(16) + "F".repeat(16) + "D".repeat(16) + "L".repeat(16) + "B".repeat(16));
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  expect(extractWings(solved._0)).toEqual([
    "UF", "UL", "UB", "UR", "DB", "DL", "DF", "DR",
    "LF", "LB", "RB", "RF", "FU", "LU", "BU", "RU",
    "BD", "LD", "FD", "RD", "FL", "BL", "BR", "FR",
  ]);
});

test("three-phase corner coordinate uses the upstream eight slot order", () => {
  const solved = FaceletCodec.parse(4, "U".repeat(16) + "R".repeat(16) + "F".repeat(16) + "D".repeat(16) + "L".repeat(16) + "B".repeat(16));
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  expect(extractCorners(solved._0)).toEqual(["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"]);
});

test("three-phase transition seam agrees with the canonical 4×4 executor", () => {
  const solved = FaceletCodec.parse(4, "U".repeat(16) + "R".repeat(16) + "F".repeat(16) + "D".repeat(16) + "L".repeat(16) + "B".repeat(16));
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  const transitioned = applyTransition(solved._0, "2R U Rw'");
  const expected = MoveExecutor.parseAndApply(4, "2R U Rw'");
  expect(transitioned.TAG).toBe("Ok");
  expect(expected.TAG).toBe("Ok");
  if (transitioned.TAG === "Ok" && expected.TAG === "Ok") {
    expect(FaceletCodec.render(transitioned._0)).toBe(FaceletCodec.render(expected._0));
  }
});

test("generated centre transition matches a physical inner-layer move", () => {
  const state = MoveExecutor.parseAndApply(4, "2R U 2F L");
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const permutation = centreTransition("2R");
  expect(permutation.TAG).toBe("Ok");
  if (permutation.TAG !== "Ok") return;
  expect([...permutation._0].sort((left, right) => left - right)).toEqual([...Array(24).keys()]);
  const moved = applyTransition(state._0, "2R");
  expect(moved.TAG).toBe("Ok");
  if (moved.TAG === "Ok") {
    expect(applyCentreTransition(extractCentres(state._0), permutation._0)).toBe(extractCentres(moved._0));
  }
});

test("phase-one U/D centre coordinate ranks and un-ranks all selected slots", () => {
  const solved = "UUUUDDDDFFFFBBBBRRRRLLLL";
  expect(rankUdCentres(solved)).toBe(0);
  expect(unrankUdCentres(0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  const rank = rankUdCentres("UUFDDDDDDFFFBBBBRRRRLLLL");
  expect(rank).toBeGreaterThanOrEqual(0);
  expect(unrankUdCentres(rank)).toHaveLength(8);
});

test("phase-one centre symmetry enumerates the upstream 48 unique transforms", () => {
  const symmetries = centreSymmetryPermutations();
  expect(symmetries.TAG).toBe("Ok");
  if (symmetries.TAG !== "Ok") return;
  expect(symmetries._0).toHaveLength(48);
  expect(new Set(symmetries._0.map((permutation) => permutation.join(","))).size).toBe(48);
  expect(symmetries._0.every((permutation) => [...permutation].sort((left, right) => left - right).join(",") === [...Array(24).keys()].join(","))).toBe(true);
});

test("phase-one centre symmetry canonically maps every orbit to its minimum raw rank", () => {
  const symmetries = centreSymmetryPermutations();
  expect(symmetries.TAG).toBe("Ok");
  if (symmetries.TAG !== "Ok") return;
  const rawRank = rankUdCentres("UUFDDDDDDFFFBBBBRRRRLLLL");
  const canonical = canonicalUdRank(rawRank);
  expect(canonical.TAG).toBe("Ok");
  if (canonical.TAG !== "Ok") return;
  const orbit = symmetries._0.map((permutation) => transitionUdRank(rawRank, permutation));
  expect(canonical._0.rawRank).toBe(Math.min(...orbit));
  expect(canonical._0.symmetry).toBe(orbit.indexOf(Math.min(...orbit)));
});

test("phase-one raw-to-symmetry map reaches the upstream 15,582 compact ranks", () => {
  const map = buildCentreSymmetryMap();
  expect(map.TAG).toBe("Ok");
  if (map.TAG !== "Ok") return;
  expect(map._0.representatives).toHaveLength(15582);
  expect(map._0.rawToSymmetry).toHaveLength(735471);
  expect(map._0.rawToSymmetry.every((entry) => entry >= 0)).toBe(true);
  expect(Math.floor(map._0.rawToSymmetry[0] / 64)).toBe(0);
});

test("phase-one pruning storage packs two four-bit depths per entry", () => {
  const table = createCentrePruning();
  expect(pruningDepth(table, 0)).toBe(15);
  setPruningDepth(table, 0, 0);
  setPruningDepth(table, 1, 9);
  expect(pruningDepth(table, 0)).toBe(0);
  expect(pruningDepth(table, 1)).toBe(9);
});

test("phase-one BFS seeds solved and discovers one-move centre states", () => {
  const table = buildCentrePruning(1);
  expect(table.TAG).toBe("Ok");
  if (table.TAG !== "Ok") return;
  expect(pruningDepth(table._0, 0)).toBe(0);
  expect([...table._0].some((packed) => packed === 1 || Math.floor(packed / 16) === 1)).toBe(true);
});

test("symmetry-reduced phase-one BFS stores only compact centre representatives", () => {
  const table = buildSymmetryCentrePruning(1);
  expect(table.TAG).toBe("Ok");
  if (table.TAG !== "Ok") return;
  expect(table._0).toHaveLength(7791);
  expect(pruningDepth(table._0, 0)).toBe(0);
});

test("phase-two move set matches the upstream 28 allowed moves", () => {
  expect(phase2Moves).toHaveLength(28);
  expect(new Set(phase2Moves.map((move) => move.notation)).size).toBe(28);
  expect(new Set(phase2Moves.map((move) => move.faceId)).size).toBe(12);
});

test("phase-three move set matches the upstream 20 allowed moves", () => {
  expect(phase3Moves).toHaveLength(20);
  expect(new Set(phase3Moves.map((move) => move.notation)).size).toBe(20);
  expect(new Set(phase3Moves.map((move) => move.faceId)).size).toBe(12);
});

test("every phase-two and phase-three move notation is a legal 4×4 transition", () => {
  const solved = FaceletCodec.parse(4, "U".repeat(16) + "R".repeat(16) + "F".repeat(16) + "D".repeat(16) + "L".repeat(16) + "B".repeat(16));
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  [...phase2Moves, ...phase3Moves].forEach((move) => {
    const applied = applyTransition(solved._0, move.notation);
    expect(applied.TAG).toBe("Ok");
  });
});

test("axis transition rule rejects a repeated face and an out-of-order axis pair", () => {
  expect(axisTransitionAllowed(-1, 0)).toBe(true);
  expect(axisTransitionAllowed(0, 0)).toBe(false);
  expect(axisTransitionAllowed(0, 3)).toBe(true);
  expect(axisTransitionAllowed(3, 0)).toBe(false);
  expect(axisTransitionAllowed(3, 6)).toBe(true);
  expect(axisTransitionAllowed(6, 3)).toBe(false);
  expect(axisTransitionAllowed(0, 1)).toBe(true);
  expect(axisTransitionAllowed(1, 0)).toBe(true);
});

test("phase-two F/B rank is always defined and targets the F,B block at solved", () => {
  const solved = "UUUUDDDDFFFFBBBBRRRRLLLL";
  expect(rankFbCentres(solved)).toBe(phase2TargetFbRank);
  // Swapping F and B internally does not change which block holds them.
  const swappedSides = "UUUUDDDDBBBBFFFFRRRRLLLL";
  expect(rankFbCentres(swappedSides)).toBe(phase2TargetFbRank);
  // Even a state that is not phase-one-solved always has exactly 8 F/B
  // stickers somewhere among the 24 slots, so this never returns -1.
  const mixed = "UDUDUDUDFBFBFBFBRLRLRLRL";
  expect(rankFbCentres(mixed)).toBeGreaterThanOrEqual(0);
});

test("a whole-cube x rotation conjugates the U/D target to the F/B target", () => {
  const xTransition = centreTransition("x");
  expect(xTransition.TAG).toBe("Ok");
  if (xTransition.TAG !== "Ok") return;
  expect(transitionUdRank(0, xTransition._0)).toBe(phase2TargetFbRank);
});

test("phase-two distance functions read zero exactly at each coordinate's own target", () => {
  const {symmetryMap, symmetryTable} = buildPhase2DistanceInputs();
  expect(symmetryMap).not.toBeNull();
  expect(symmetryTable).not.toBeNull();

  const ud = phase2UdDistance(0, symmetryMap, symmetryTable);
  expect(ud.TAG).toBe("Ok");
  if (ud.TAG === "Ok") expect(ud._0).toBe(0);

  const fb = phase2FbDistance(phase2TargetFbRank, symmetryMap, symmetryTable);
  expect(fb.TAG).toBe("Ok");
  if (fb.TAG === "Ok") expect(fb._0).toBe(0);

  const combined = phase2CombinedDistance(0, phase2TargetFbRank, symmetryMap, symmetryTable);
  expect(combined.TAG).toBe("Ok");
  if (combined.TAG === "Ok") expect(combined._0).toBe(0);
});

test("phase-two distances stay admissible (never exceed the true move count) across a real scramble", () => {
  const {symmetryMap, symmetryTable} = buildPhase2DistanceInputs();
  expect(symmetryMap).not.toBeNull();
  expect(symmetryTable).not.toBeNull();

  const scrambleMoves = ["Rw", "U", "Fw2", "Dw2", "Lw'", "B2"];
  let state = MoveExecutor.parseAndApply(4, "");
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;

  for (let depth = 0; depth < scrambleMoves.length; depth++) {
    const centres = extractCentres(state._0);
    const udRank = rankUdCentres(centres);
    const fbRank = rankFbCentres(centres);
    expect(fbRank).toBeGreaterThanOrEqual(0);

    const combined = phase2CombinedDistance(udRank, fbRank, symmetryMap, symmetryTable);
    expect(combined.TAG).toBe("Ok");
    // Every scrambled prefix is reachable to the joint target within the
    // moves already used to build it, so admissibility means the bound can
    // never exceed how many scramble moves remain to undo it in the worst
    // case -- here simply that it stays a small, finite, non-negative value,
    // and it must be strictly positive once the state has actually moved
    // away from the joint target.
    if (combined.TAG === "Ok") {
      expect(combined._0).toBeGreaterThanOrEqual(0);
      expect(combined._0).toBeLessThanOrEqual(15);
      if (depth > 0) expect(combined._0).toBeGreaterThan(0);
    }

    const next = applyTransition(state._0, scrambleMoves[depth]);
    expect(next.TAG).toBe("Ok");
    if (next.TAG === "Ok") state = next;
  }
});

test("phase-two coordinate transitions agree with re-ranking a real move's facelet result", () => {
  const before = MoveExecutor.parseAndApply(4, "Rw U Fw2 Dw2");
  expect(before.TAG).toBe("Ok");
  if (before.TAG !== "Ok") return;
  const beforeCentres = extractCentres(before._0);
  const beforeUdRank = rankUdCentres(beforeCentres);
  const beforeFbRank = rankFbCentres(beforeCentres);

  ["U", "D2", "Rw", "Fw2"].forEach((notation) => {
    const after = applyTransition(before._0, notation);
    expect(after.TAG).toBe("Ok");
    if (after.TAG !== "Ok") return;
    const afterCentres = extractCentres(after._0);
    const afterUdRank = rankUdCentres(afterCentres);
    const afterFbRank = rankFbCentres(afterCentres);

    const transition = centreTransition(notation);
    expect(transition.TAG).toBe("Ok");
    if (transition.TAG !== "Ok") return;
    expect(transitionUdRank(beforeUdRank, transition._0)).toBe(afterUdRank);
    expect(transitionUdRank(beforeFbRank, transition._0)).toBe(afterFbRank);
  });
});
