import {expect, test} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {isMonochromeSolved4x4, reduce4x4} from "../src/Solver/Reduction4x4.ts";

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

test("refuses a 4×4 with unresolved centres or wing pairs", () => {
  const unresolved = apply(4, "2R");
  const result = reduce4x4(unresolved);
  expect(result.TAG).toBe("Error");
  if (result.TAG === "Error") {
    expect(result._0.message).toMatch(/not reduced yet/);
  }
});
