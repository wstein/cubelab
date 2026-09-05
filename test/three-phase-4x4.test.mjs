import {expect, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import {applyCentreTransition, applyTransition, buildCentrePruning, centreTransition, createCentrePruning, decodeFacelets, encodeFacelets, extractCentres, extractCorners, extractWings, pruningDepth, rankUdCentres, setPruningDepth, unrankUdCentres} from "../src/Solver/ThreePhase4x4.res.mjs";

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
