import {expect, test} from "vitest";

import packageManifest from "../package.json" with {type: "json"};

test("the 4×4 solve CLI is distinct from the centre-table generator", () => {
  expect(packageManifest.scripts["solver:solve-4x4"]).toBe("rescript && bun scripts/solve-4x4.ts");
  expect(packageManifest.scripts["solver:generate-4x4-centres"]).not.toContain("solve-4x4");
});
