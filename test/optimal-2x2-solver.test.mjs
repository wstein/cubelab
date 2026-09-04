import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, test, vi} from "vitest";

import * as MoveExecutor from "../src/Move/MoveExecutor.res.mjs";
import * as MoveParser from "../src/Move/MoveParser.res.mjs";
import * as StateTypes from "../src/State/StateTypes.res.mjs";
import {
  decodeOptimal2x2Tables,
  OPTIMAL_2X2_TABLE_URL,
  optimal2x2TableBytes,
} from "../src/Solver/Optimal2x2Table.ts";

const tablePath = fileURLToPath(new URL("../public/solver/optimal-2x2.v2.bin", import.meta.url));

const apply = (input) => {
  const solved = StateTypes.solved(2);
  const algorithm = MoveParser.parse(2, input);
  if (solved.TAG !== "Ok" || algorithm.TAG !== "Ok") throw new Error("Test setup failed.");
  const result = MoveExecutor.applyAlg(solved._0, algorithm._0);
  if (result.TAG !== "Ok") throw new Error("Test setup could not apply the scramble.");
  return result._0;
};

describe("optimal 2×2 table", () => {
  test("is versioned, integrity checked, and has the documented byte length", async () => {
    const bytes = await readFile(tablePath);
    expect(bytes.byteLength).toBe(optimal2x2TableBytes());
    const tables = decodeOptimal2x2Tables(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(tables.distance).toHaveLength(Math.ceil(3_674_160 / 2));
  });

  test("rejects a corrupt downloaded table", async () => {
    const bytes = await readFile(tablePath);
    const corrupt = new Uint8Array(bytes);
    corrupt[100] ^= 1;
    expect(() => decodeOptimal2x2Tables(corrupt.buffer)).toThrow(/integrity check/);
  });

  test("returns and replay-verifies HTM-shortest solutions", async () => {
    const bytes = await readFile(tablePath);
    const fetch = vi.fn(async (url) => {
      expect(url).toBe(OPTIMAL_2X2_TABLE_URL);
      return new Response(bytes);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetch;
    try {
      const solver = await import("../src/Solver/Optimal2x2Solver.ts");
      expect(solver.hasPreparedTables()).toBe(false);
      const state = apply("R U F2 R'");
      const solution = await solver.solve(state);
      expect(solution.moveCount).toBeLessThanOrEqual(4);
      const replay = MoveExecutor.applyAlg(state, solution.alg);
      const solved = StateTypes.solved(2);
      expect(replay).toEqual(solved);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(solver.hasPreparedTables()).toBe(true);
      await solver.prepareTables();
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
