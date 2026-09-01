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
      turnGuides: false,
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
    expect(parsed.turnGuides).toBe(true);
    expect(parsed.input).toHaveLength(20_000);
    expect(parsed.activeTab).toBe("converter");
  });

  test("accepts only known workspace tabs", () => {
    expect(readHash("#tab=academy&method=beginner")).toMatchObject({
      activeTab: "academy",
      academyMethod: "beginner",
    });
    expect(readHash("#tab=academy&method=easyCfop")).toMatchObject({
      activeTab: "academy",
      academyMethod: "easyCfop",
    });
    expect(readHash("#tab=beginner")).toMatchObject({activeTab: "academy", academyMethod: "beginner"});
    expect(readHash("#tab=cfop")).toMatchObject({activeTab: "academy", academyMethod: "easyCfop"});
    expect(readHash("#tab=academy&method=intermediate").academyMethod).toBe("intermediate");
    expect(readHash("#tab=academy&method=advanced").academyMethod).toBe("advanced");
    expect(readHash("#tab=workbench").activeTab).toBe("workbench");
    expect(readHash("#tab=unknown").activeTab).toBe("converter");
  });

  test("writes the selected Academy method into shareable URLs", () => {
    expect(writeHash({...defaultAppState, activeTab: "academy", academyMethod: "easyCfop"}))
      .toContain("tab=academy&method=easyCfop");
  });

  test("persists an explicit turn-guide opt-out", () => {
    expect(writeHash({...defaultAppState, turnGuides: false})).toContain("guides=off");
    expect(readHash("#guides=off").turnGuides).toBe(false);
    expect(readHash("#guides=on").turnGuides).toBe(true);
  });
});
