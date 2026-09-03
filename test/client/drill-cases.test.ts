import {describe, expect, test} from "vitest";

import {curatedDrillCases, drillCaseById} from "../../src/client/drill-cases";

describe("curated Academy drill cases", () => {
  test("offers executable OLL, PLL, and F2L drills", () => {
    expect(new Set(curatedDrillCases.map((entry) => entry.family))).toEqual(new Set(["OLL", "PLL", "F2L"]));
    expect(curatedDrillCases.every((entry) => entry.algorithm.length > 0)).toBe(true);
    expect(drillCaseById("pll-t")?.label).toBe("T-Perm");
    expect(drillCaseById("missing")).toBeNull();
  });
});
