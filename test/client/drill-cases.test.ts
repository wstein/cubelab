import {describe, expect, test} from "vitest";

import {
  curatedDrillCases,
  drillCaseById,
  drillCasesForFamily,
  nextDrillRotation,
  randomDrillCase,
} from "../../src/client/drill-cases";

describe("curated Academy drill cases", () => {
  test("offers executable OLL, PLL, and F2L drills", () => {
    expect(new Set(curatedDrillCases.map((entry) => entry.family))).toEqual(new Set(["OLL", "PLL", "F2L"]));
    expect(curatedDrillCases.every((entry) => entry.algorithm.length > 0)).toBe(true);
    expect(drillCaseById("pll-t")?.label).toBe("T-Perm");
    expect(drillCaseById("missing")).toBeNull();
  });

  test("filters and chooses a case within the requested family", () => {
    expect(drillCasesForFamily("OLL").every((entry) => entry.family === "OLL")).toBe(true);
    expect(randomDrillCase("PLL", () => 0)?.family).toBe("PLL");
    expect(randomDrillCase("F2L", () => 0.999)?.family).toBe("F2L");
    expect([0, 1, 2, 3].reduce(nextDrillRotation, 0)).toBe(0);
  });
});
