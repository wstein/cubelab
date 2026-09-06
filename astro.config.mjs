// @ts-check
import { defineConfig } from "astro/config";
import { chromeDevToolsWorkspacePlugin } from "./scripts/chrome-devtools-workspace.mjs";

export default defineConfig({
  vite: {
    plugins: [chromeDevToolsWorkspacePlugin()],
  },
});
