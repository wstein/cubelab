import {describe, expect, test} from "vitest";

import {
  createStore,
  defaultAppState,
  pathForTab,
  hashForPath,
  readHash,
  readLocation,
  pathWithDeploymentBase,
  pathWithoutDeploymentBase,
  synchronizeHash,
  tabForPath,
  writeHash,
} from "../../src/client/store";

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
      moves: "U R U' R'",
      scheme: "Japanese" as const,
      lowercaseMode: "InnerSlice" as const,
      notationDialect: "Ruwix" as const,
      cubeStyle: "Speed" as const,
      turnGuides: false,
      autoOrbit: true,
      activeTab: "workbench" as const,
      note: "PB attempt, ignore the pause after F2L",
    };
    expect(readHash(writeHash(state))).toEqual(state);
  });

  test("omits an empty note from the hash and bounds an oversized one", () => {
    expect(writeHash(defaultAppState)).not.toMatch(/note=/);
    const parsed = readHash(`#note=${"x".repeat(500)}`);
    expect(parsed.note).toHaveLength(200);
    expect(writeHash({...defaultAppState, note: "x".repeat(500)})).toMatch(
      new RegExp(`note=${"x".repeat(200)}$`),
    );
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
    expect(parsed.autoOrbit).toBe(false);
    expect(parsed.input).toHaveLength(20_000);
    expect(parsed.moves).toBe("");
    expect(parsed.activeTab).toBe("converter");
  });

  test("round-trips explicit Twizzle, SSE, and ACube notation dialects", () => {
    expect(readHash("#dialect=Twizzle").notationDialect).toBe("Twizzle");
    expect(readHash("#dialect=Sse").notationDialect).toBe("Sse");
    expect(readHash("#dialect=Acube").notationDialect).toBe("Acube");
    expect(writeHash({...defaultAppState, notationDialect: "Twizzle"})).toContain("dialect=Twizzle");
    expect(writeHash({...defaultAppState, notationDialect: "Acube"})).toContain("dialect=Acube");
  });

  test("accepts only the supported viewport styles", () => {
    expect(readHash("#style=Speed").cubeStyle).toBe("Speed");
    expect(readHash("#style=glass").cubeStyle).toBe("Standard");
  });

  test("accepts only known workspace tabs", () => {
    expect(readHash("#tab=academy&method=beginner")).toMatchObject({
      activeTab: "academy",
      academyMethod: "beginner",
    });
    expect(readHash("#tab=academy&method=advancedCfop")).toMatchObject({
      activeTab: "academy",
      academyMethod: "advancedCfop",
    });
    expect(readHash("#tab=beginner")).toMatchObject({activeTab: "academy", academyMethod: "beginner"});
    expect(readHash("#tab=cfop")).toMatchObject({activeTab: "academy", academyMethod: "fullCfop"});
    expect(readHash("#tab=academy&method=easyCfop").academyMethod).toBe("beginnerCfop");
    expect(readHash("#tab=academy&method=intermediate").academyMethod).toBe("beginnerCfop");
    expect(readHash("#tab=academy&method=advancedLbl").academyMethod).toBe("advancedLbl");
    expect(readHash("#tab=academy&method=advanced").academyMethod).toBe("advancedCfop");
    expect(readHash("#tab=academy&method=fullCfop").academyMethod).toBe("fullCfop");
    expect(readHash("#tab=academy&method=petrus").academyMethod).toBe("petrus");
    expect(readHash("#tab=academy&method=petrus2x2").academyMethod).toBe("twoByTwoPetrus");
    expect(readHash("#tab=academy&method=classicalPetrus").academyMethod).toBe("petrus");
    expect(readHash("#tab=academy&method=enhancedPetrus").academyMethod).toBe("enhancedPetrus");
    expect(readHash("#tab=academy&method=modernPetrus").academyMethod).toBe("enhancedPetrus");
    expect(readHash("#tab=academy&method=reduction4x4").academyMethod).toBe("reduction4x4");
    expect(readHash("#tab=academy&method=reduction").academyMethod).toBe("reduction4x4");
    expect(readHash("#tab=workbench").activeTab).toBe("workbench");
    expect(readHash("#tab=patterns").activeTab).toBe("patterns");
    expect(readHash("#tab=unknown").activeTab).toBe("converter");
  });

  test("round-trips the patterns workspace tab through the URL hash", () => {
    expect(writeHash({...defaultAppState, activeTab: "patterns"})).toContain("tab=patterns");
    expect(readHash(writeHash({...defaultAppState, activeTab: "patterns"})).activeTab).toBe("patterns");
  });

  test("writes the selected Academy method into shareable URLs", () => {
    expect(writeHash({...defaultAppState, activeTab: "academy", academyMethod: "advancedCfop"}))
      .toContain("tab=academy&method=advancedCfop");
    expect(writeHash({...defaultAppState, activeTab: "academy", academyMethod: "petrus"}))
      .toContain("tab=academy&method=petrus");
    expect(writeHash({...defaultAppState, activeTab: "academy", academyMethod: "twoByTwoPetrus"}))
      .toContain("tab=academy&method=twoByTwoPetrus");
    expect(writeHash({...defaultAppState, activeTab: "academy", academyMethod: "enhancedPetrus"}))
      .toContain("tab=academy&method=enhancedPetrus");
    expect(writeHash({...defaultAppState, activeTab: "academy", academyMethod: "reduction4x4"}))
      .toContain("tab=academy&method=reduction4x4");
  });

  test("persists an explicit turn-guide opt-out", () => {
    expect(writeHash({...defaultAppState, turnGuides: false})).toContain("guides=off");
    expect(readHash("#guides=off").turnGuides).toBe(false);
    expect(readHash("#guides=on").turnGuides).toBe(true);
  });

  test("maps clean entry pathnames to workspace tabs and vice versa", () => {
    expect(tabForPath("/academy")).toBe("academy");
    expect(tabForPath("/workbench")).toBe("workbench");
    expect(tabForPath("/patterns")).toBe("patterns");
    expect(tabForPath("/timer")).toBe("timer");
    expect(tabForPath("/")).toBe("converter");
    expect(tabForPath("")).toBe("converter");
    expect(tabForPath("/unknown")).toBeNull();

    expect(pathForTab("academy")).toBe("/academy");
    expect(pathForTab("workbench")).toBe("/workbench");
    expect(pathForTab("patterns")).toBe("/patterns");
    expect(pathForTab("timer")).toBe("/timer");
    expect(pathForTab("converter")).toBe("/");
  });

  test("keeps route navigation below a project Pages deployment base", () => {
    expect(pathWithDeploymentBase("/", "/cubelab")).toBe("/cubelab/");
    expect(pathWithDeploymentBase("/academy", "/cubelab/")).toBe("/cubelab/academy");
    expect(pathWithoutDeploymentBase("/cubelab/academy", "/cubelab")).toBe("/academy");
    expect(pathWithoutDeploymentBase("/cubelab/", "/cubelab")).toBe("/");
    expect(readLocation({pathname: "/cubelab/timer"}, "/cubelab").activeTab).toBe("timer");
  });

  test("derives active workspace from location pathname when hash does not specify one", () => {
    expect(readLocation({pathname: "/timer"}).activeTab).toBe("timer");
    expect(readLocation({pathname: "/academy"}).activeTab).toBe("academy");
    expect(readLocation({pathname: "/workbench"}).activeTab).toBe("workbench");
    expect(readLocation({pathname: "/patterns"}).activeTab).toBe("patterns");
    expect(readLocation({pathname: "/", hash: "#size=4"}).size).toBe(4);
    expect(readLocation({pathname: "/", hash: "#size=4"}).activeTab).toBe("converter");

    // A clean route takes precedence over a conflicting legacy hash tab.
    expect(readLocation({pathname: "/timer", hash: "#tab=academy"}).activeTab).toBe("timer");

    // The root path is not itself a clean route selection — tabForPath("/")
    // answers "converter" only so hashForPath can omit a redundant tab=
    // param, not to say a bare "/" link has explicitly chosen Converter. A
    // legacy root link's #tab= must still be honoured.
    expect(readLocation({pathname: "/", hash: "#tab=academy"}).activeTab).toBe("academy");
    expect(readLocation({pathname: "", hash: "#tab=workbench"}).activeTab).toBe("workbench");
  });

  test("keeps route-selected tabs out of otherwise shareable hashes", () => {
    expect(writeHash(defaultAppState)).toBe("");
    expect(hashForPath({...defaultAppState, activeTab: "academy"}, "/academy")).toBe("");
    expect(hashForPath({...defaultAppState, activeTab: "academy", academyMethod: "fullCfop"}, "/academy"))
      .toBe("#method=fullCfop");
    expect(hashForPath({...defaultAppState, activeTab: "workbench", moves: "R U R'"}, "/workbench"))
      .toBe("#moves=R+U+R%27");
    expect(writeHash({...defaultAppState, activeTab: "academy"})).toBe("#tab=academy");
  });

  test("pushes discrete workspace navigation and replaces debounced edits", () => {
    const listeners = new Map<string, () => void>();
    const calls: Array<{kind: "push" | "replace"; url: string}> = [];
    const target = {
      location: {pathname: "/", search: "", hash: ""},
      history: {
        pushState: (_state: unknown, _title: string, url: string) => calls.push({kind: "push", url}),
        replaceState: (_state: unknown, _title: string, url: string) => calls.push({kind: "replace", url}),
      },
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
      clearTimeout: () => undefined,
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window;
    const store = createStore(defaultAppState);
    const stop = synchronizeHash(store, target, 0);
    store.patch({activeTab: "academy"});
    store.patch({input: "R U"});

    expect(calls).toEqual([
      {kind: "push", url: "/academy"},
      {kind: "replace", url: "/academy#alg=R+U"},
    ]);
    stop();
  });

  test("does not drop the project Pages base while synchronizing a connected cube state", () => {
    const calls: Array<{kind: "push" | "replace"; url: string}> = [];
    const target = {
      location: {pathname: "/cubelab/", search: "", hash: ""},
      history: {
        pushState: (_state: unknown, _title: string, url: string) => calls.push({kind: "push", url}),
        replaceState: (_state: unknown, _title: string, url: string) => calls.push({kind: "replace", url}),
      },
      setTimeout: (callback: () => void) => { callback(); return 1; },
      clearTimeout: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Window;
    const store = createStore(defaultAppState);
    const stop = synchronizeHash(store, target, 0, "/cubelab");
    store.patch({input: "UDUDUDUDU"});

    expect(calls).toEqual([{kind: "replace", url: "/cubelab/#alg=UDUDUDUDU"}]);
    stop();
  });
});
