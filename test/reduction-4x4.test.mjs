import {expect, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {
  inspectReduction4x4,
  isMonochromeSolved4x4,
  planNextCentreBlock4x4,
  planNextWingPair4x4,
  planOLLParityRepair4x4,
  reduce4x4,
} from "../src/Solver/Reduction4x4.ts";
import * as TwoPhaseSolver from "../src/Solver/TwoPhaseSolver.res.mjs";

const apply = (size, algorithm) => {
  const result = MoveExecutor.parseAndApply(size, algorithm);
  if (result.TAG !== "Ok") throw new Error(String(result._0));
  return result._0;
};

test("reduces a paired 4×4 outer-turn state to the equivalent 3×3", () => {
  const algorithm = "R U F2 L'";
  const fourByFour = apply(4, algorithm);
  const threeByThree = apply(3, algorithm);
  const reduced = reduce4x4(fourByFour);

  expect(reduced.TAG).toBe("Ok");
  if (reduced.TAG === "Ok") {
    expect(reduced._0.compact).toBe(FaceletCodec.render(threeByThree));
  }
  expect(isMonochromeSolved4x4(fourByFour)).toBe(false);
});

test("accepts a solved 4×4 in any monochrome face orientation", () => {
  const solved = StateTypes.solved(4);
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  expect(reduce4x4(solved._0).TAG).toBe("Ok");
  expect(isMonochromeSolved4x4(solved._0)).toBe(true);
});

test("reports centre and wing milestones before attempting the 3×3 handoff", () => {
  const solved = StateTypes.solved(4);
  expect(solved.TAG).toBe("Ok");
  if (solved.TAG !== "Ok") return;
  const complete = inspectReduction4x4(solved._0);
  expect(complete.TAG).toBe("Ok");
  if (complete.TAG === "Ok") {
    expect(complete._0).toMatchObject({
      centreBlocksComplete: 6,
      wingRowsPaired: 24,
      stage: "reduced",
    });
  }

  const unresolved = inspectReduction4x4(apply(4, "2R"));
  expect(unresolved.TAG).toBe("Ok");
  if (unresolved.TAG === "Ok") {
    expect(unresolved._0.stage).not.toBe("reduced");
    expect(unresolved._0.nextGoal).toMatch(/centre blocks|wing rows/);
    expect(unresolved._0.wingRows.every((row) => row.edge && row.colours)).toBe(true);
  }
});

test("finds a replay-verified centre improvement from an unsolved 4×4", () => {
  const scrambled = apply(4, "2R U 2F L 2U B 2L D 2B R");
  const before = inspectReduction4x4(scrambled);
  expect(before.TAG).toBe("Ok");
  if (before.TAG !== "Ok") return;
  expect(before._0.centreBlocksComplete).toBe(0);

  const guide = planNextCentreBlock4x4(scrambled);
  expect(guide.TAG).toBe("Ok");
  if (guide.TAG !== "Ok") return;
  expect(guide._0.algorithm).not.toBe("");
  const replay = MoveExecutor.applyAlg(scrambled, guide._0.alg);
  expect(replay.TAG).toBe("Ok");
  if (replay.TAG !== "Ok") return;
  const after = inspectReduction4x4(replay._0);
  expect(after.TAG).toBe("Ok");
  if (after.TAG === "Ok") {
    expect(after._0.centreBlocksComplete).toBeGreaterThanOrEqual(before._0.centreBlocksComplete);
    expect(guide._0.afterScore).toBeGreaterThan(guide._0.beforeScore);
  }
});

test("lifts a verified two-phase finish back onto the original reduced 4×4", () => {
  const fourByFour = apply(4, "R U F2 L'");
  const reduced = reduce4x4(fourByFour);
  expect(reduced.TAG).toBe("Ok");
  if (reduced.TAG !== "Ok") return;

  TwoPhaseSolver.prepareTables();
  const solution = TwoPhaseSolver.solve(reduced._0.state);
  expect(solution.TAG).toBe("Ok");
  if (solution.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(fourByFour, solution._0.alg);
  expect(replay.TAG).toBe("Ok");
  if (replay.TAG === "Ok") expect(isMonochromeSolved4x4(replay._0)).toBe(true);
});

test("refuses a 4×4 with unresolved centres or wing pairs", () => {
  const unresolved = apply(4, "2R");
  const result = reduce4x4(unresolved);
  expect(result.TAG).toBe("Error");
  if (result.TAG === "Error") {
    expect(result._0.message).toMatch(/Build centre blocks|Pair wing rows/);
  }
});

test("the Academy's 4×4 last-two-edge and parity sequences parse in modern notation", () => {
  const sequences = [
    "R U R' F R' F' R",
    "u' R U R' F R' F' R u",
    "r U2 x r U2 r U2 r' U2 l U2 r' U2 r U2 r' U2 r'",
    "r2 U2 r2 u2 r2 u2",
  ];
  sequences.forEach((sequence) => {
    expect(MoveParser.parseWithOptions(4, "Wide", "Modern", sequence).TAG).toBe("Ok");
  });
});

test("finds a replay-verified centre-preserving next wing-pair guide", () => {
  const scrambled = apply(4, "2R U R' U' 2R'");
  const before = inspectReduction4x4(scrambled);
  expect(before.TAG).toBe("Ok");
  if (before.TAG !== "Ok") return;
  expect(before._0).toMatchObject({centreBlocksComplete: 6, stage: "wings"});

  const guide = planNextWingPair4x4(scrambled);
  expect(guide.TAG).toBe("Ok");
  if (guide.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(scrambled, guide._0.alg);
  expect(replay.TAG).toBe("Ok");
  if (replay.TAG !== "Ok") return;
  const after = inspectReduction4x4(replay._0);
  expect(after.TAG).toBe("Ok");
  if (after.TAG === "Ok") {
    expect(after._0.centreBlocksComplete).toBe(6);
    expect(after._0.wingRowsPaired).toBeGreaterThan(before._0.wingRowsPaired);
    expect(guide._0.after).toBe(after._0.wingRowsPaired);
  }
});

test("uses an outer-turn setup when a pairing seed is not already in a working slot", () => {
  // This is an outer-turn conjugate of a pairing case. A direct seed attempt
  // has no improvement here; the Academy planner must set the wing up, pair
  // it, and restore the surrounding outer-layer state.
  const scrambled = apply(4, "U R u' R U R' F R' F' R u R' U'");
  const before = inspectReduction4x4(scrambled);
  expect(before.TAG).toBe("Ok");
  if (before.TAG !== "Ok") return;
  expect(before._0).toMatchObject({centreBlocksComplete: 6, wingRowsPaired: 20});

  const guide = planNextWingPair4x4(scrambled);
  expect(guide.TAG).toBe("Ok");
  if (guide.TAG !== "Ok") return;
  expect(guide._0.algorithm).not.toBe("");
  const replay = MoveExecutor.applyAlg(scrambled, guide._0.alg);
  expect(replay.TAG).toBe("Ok");
  if (replay.TAG !== "Ok") return;
  const after = inspectReduction4x4(replay._0);
  expect(after.TAG).toBe("Ok");
  if (after.TAG === "Ok") {
    expect(after._0.centreBlocksComplete).toBe(6);
    expect(after._0.wingRowsPaired).toBeGreaterThan(before._0.wingRowsPaired);
  }
});

test("recognises and repairs OLL parity in a fully paired 4×4", () => {
  const state = FaceletCodec.parse(
    4,
    "FBBBBUURBUURDLLLUUUDBRRRBRRRDUUDLDDFUFFDUFFDBRRBUFFRFDDFFDDFBLLRUUUFFLLLFLLLULLLLRRRDBBDDBBDFBBR",
  );
  expect(state.TAG).toBe("Ok");
  if (state.TAG !== "Ok") return;
  const inspection = inspectReduction4x4(state._0);
  expect(inspection.TAG).toBe("Ok");
  if (inspection.TAG === "Ok") expect(inspection._0).toMatchObject({stage: "reduced", wingRowsPaired: 24});
  const blocked = reduce4x4(state._0);
  expect(blocked.TAG).toBe("Error");
  if (blocked.TAG === "Error") expect(blocked._0.message).toMatch(/OLL parity/);

  const repair = planOLLParityRepair4x4(state._0);
  expect(repair.TAG).toBe("Ok");
  if (repair.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(state._0, repair._0.alg);
  expect(replay.TAG).toBe("Ok");
  if (replay.TAG === "Ok") expect(reduce4x4(replay._0).TAG).toBe("Ok");
});
test("keeps a legal 22/24 last-two-dedge state on the wing-pair path", () => {
  // This legal centre-complete state reaches 24/24 through 22 -> 20 -> 24.
  // The first sequence is a setup loss, so a strict one-ply hill climb cannot
  // accept it; the guide must verify the combined two-ply result instead.
  const parsed = FaceletCodec.parse(
    4,
    "FFFDLUUDLUUDLLLLUFFFURRRURRRBRRLDFFFDFFFDFFFRBBRFLLDDDDBDDDBRDDURUUBULLRULLBBLLULRRDUBBBUBBBBRBU",
  );
  expect(parsed.TAG).toBe("Ok");
  if (parsed.TAG !== "Ok") return;
  const before = inspectReduction4x4(parsed._0);
  expect(before.TAG).toBe("Ok");
  if (before.TAG !== "Ok") return;
  expect(before._0).toMatchObject({centreBlocksComplete: 6, wingRowsPaired: 22});

  // Apply the setup to the regression state rather than using a new cube.
  const setupReplay = MoveExecutor.applyAlg(parsed._0, MoveParser.parseWithOptions(4, "Wide", "Modern", "2L D L D' 2L'")._0);
  expect(setupReplay.TAG).toBe("Ok");
  if (setupReplay.TAG === "Ok") {
    const setupProgress = inspectReduction4x4(setupReplay._0);
    expect(setupProgress.TAG).toBe("Ok");
    if (setupProgress.TAG === "Ok") expect(setupProgress._0.wingRowsPaired).toBe(20);
  }

  const guide = planNextWingPair4x4(parsed._0);
  expect(guide.TAG).toBe("Ok");
  if (guide.TAG !== "Ok") return;
  const replay = MoveExecutor.applyAlg(parsed._0, guide._0.alg);
  expect(replay.TAG).toBe("Ok");
  if (replay.TAG !== "Ok") return;
  const after = inspectReduction4x4(replay._0);
  expect(after.TAG).toBe("Ok");
  if (after.TAG === "Ok") {
    expect(after._0).toMatchObject({centreBlocksComplete: 6, wingRowsPaired: 24});
  }
});
