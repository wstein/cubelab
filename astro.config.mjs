// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  // Project Pages are served below /cubelab. Keep local dev and preview at
  // the root so existing local URLs do not change.
  site: "https://wstein.github.io",
  base: process.env.GITHUB_ACTIONS === "true" ? "/cubelab" : undefined,
  experimental: {
    chromeDevtoolsWorkspace: true,
  },
});
