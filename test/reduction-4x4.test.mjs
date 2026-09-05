import {expect, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {inspectReduction4x4, isMonochromeSolved4x4, reduce4x4} from "../src/Solver/Reduction4x4.ts";
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
