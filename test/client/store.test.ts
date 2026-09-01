import {describe, expect, test} from "bun:test";

import {createStore, defaultAppState, readHash, writeHash} from "../../src/client/store";

describe("application state store", () => {
  test("notifies subscribers only when state changes", () => {
    const store = createStore(defaultAppState);
    const seen: number[] = [];
    const unsubscribe = store.subscribe((state) => seen.push(state.size));
    store.patch({size: 3});
    store.patch({size: 4});
    unsubscribe();
    store.patch({size: 5});
    expect(seen).toEqual([4]);
  });

  test("round-trips shareable settings and algorithms through the URL hash", () => {
    const state = {
      ...defaultAppState,
      size: 5,
      input: "Rw U2 r' // parity",
      scheme: "Japanese" as const,
      lowercaseMode: "InnerSlice" as const,
      notationDialect: "Ruwix" as const,
      cubeStyle: "Speed" as const,
      activeTab: "workbench" as const,
    };
    expect(readHash(writeHash(state))).toEqual(state);
  });

  test("rejects invalid hash settings and bounds imported input", () => {
    const parsed = readHash(
      `#size=99&scheme=Custom&custom=AAAAAA&lowercase=nope&style=nope&alg=${"R".repeat(21_000)}`,
    );
    expect(parsed.size).toBe(3);
    expect(parsed.customScheme).toBe("WOGRBY");
    expect(parsed.lowercaseMode).toBe("Wide");
    expect(parsed.notationDialect).toBe("Modern");
    expect(parsed.cubeStyle).toBe("Standard");
    expect(parsed.input).toHaveLength(20_000);
    expect(parsed.activeTab).toBe("converter");
  });

  test("accepts only known workspace tabs", () => {
    expect(readHash("#tab=beginner").activeTab).toBe("beginner");
    expect(readHash("#tab=workbench").activeTab).toBe("workbench");
    expect(readHash("#tab=unknown").activeTab).toBe("converter");
  });
});
