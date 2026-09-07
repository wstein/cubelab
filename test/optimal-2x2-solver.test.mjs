import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, test, vi} from "vitest";

import * as FaceletCodec from "../src/State/FaceletCodec.res.mjs";
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

  test("accepts a solution that ends on a whole-cube rotation of solved", async () => {
    const bytes = await readFile(tablePath);
    const fetch = vi.fn(async (url) => {
      expect(url).toBe(OPTIMAL_2X2_TABLE_URL);
      return new Response(bytes);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetch;
    try {
      const solver = await import("../src/Solver/Optimal2x2Solver.ts");
      // A state whose HTM-optimal (7 move) solve reaches a whole-cube rotation of
      // solved (e.g. UUUULLLLBBBBDDDDRRRRFFFF), not the untouched identity cubies.
      // A 2x2 has no fixed centres, so this is still a fully solved cube: every
      // face is monochrome. Regression test for the strict identity check that
      // used to reject these as "failed verification".
      const parsed = FaceletCodec.parse(2, "UUUUFRFRLLLLDDDDRBRBBFBF");
      expect(parsed.TAG).toBe("Ok");
      const solution = await solver.solve(parsed._0);
      expect(solution.moveCount).toBe(7);
      const replay = MoveExecutor.applyAlg(parsed._0, solution.alg);
      expect(replay.TAG).toBe("Ok");
      expect(FaceletCodec.render(replay._0).split("").every((color, index, all) =>
        color === all[Math.floor(index / 4) * 4])).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uniformly samples a canonical coordinate and renders a replayable inverse scramble", async () => {
    const bytes = await readFile(tablePath);
    const tables = decodeOptimal2x2Tables(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const solver = await import("../src/Solver/Optimal2x2Solver.ts");
    const generated = solver.randomStateScrambleFromTables(tables, () => 0.5);
    expect(generated.coordinate).toBe(Math.floor(0.5 * 3_674_160));
    const replay = MoveExecutor.applyAlg(StateTypes.solved(2)._0, generated.scramble);
    expect(replay.TAG).toBe("Ok");
    if (replay.TAG === "Ok") expect(FaceletCodec.render(replay._0)).toBe(FaceletCodec.render(generated.state));
    const solution = await solver.solve(generated.state);
    expect(solution.moveCount).toBe(generated.moveCount);
    expect(generated.moveCount).toBeGreaterThanOrEqual(5);
  });

  test("supports exact easy-drill distance buckets alongside any and 5+", async () => {
    const bytes = await readFile(tablePath);
    const tables = decodeOptimal2x2Tables(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const solver = await import("../src/Solver/Optimal2x2Solver.ts");
    expect(solver.randomStateScrambleFromTables(tables, () => 0, "any").moveCount).toBe(0);
    expect(solver.randomStateScrambleFromTables(tables, () => 0, "3").moveCount).toBe(3);
    expect(solver.randomStateScrambleFromTables(tables, () => 0, "4").moveCount).toBe(4);
  });
});
