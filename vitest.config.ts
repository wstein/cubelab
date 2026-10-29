import {defineConfig} from "vitest/config";
import {scaledTimeout} from "./test/support/timeout-factor.mjs";

export default defineConfig({
  test: {
    include: ["test/**/*.test.mjs", "test/client/**/*.test.ts", "test/Solver/petrus-5x5.test.ts"],
    exclude: ["test/browser/**", "node_modules/**"],
    environment: "node",
    testTimeout: scaledTimeout(60000),
    hookTimeout: scaledTimeout(10000),
    server: {
      deps: {
        inline: [/smartcube-web-bluetooth/],
      },
    },
  },
});
