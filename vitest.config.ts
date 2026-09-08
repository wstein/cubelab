import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.mjs", "test/client/**/*.test.ts", "test/Solver/petrus-5x5.test.ts"],
    exclude: ["test/browser/**", "node_modules/**"],
    environment: "node",
    testTimeout: 60000,
    server: {
      deps: {
        inline: [/smartcube-web-bluetooth/],
      },
    },
  },
});
