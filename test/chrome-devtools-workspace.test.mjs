import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

const astroConfig = await readFile(new URL("../astro.config.mjs", import.meta.url), "utf8");

test("enables Astro's Chrome DevTools automatic-workspace endpoint", () => {
  assert.match(astroConfig, /experimental:\s*\{\s*chromeDevtoolsWorkspace:\s*true/);
});
