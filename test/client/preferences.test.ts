import {expect, test} from "vitest";

import {
  defaultPreferences,
  PREFERENCES_STORAGE_KEY,
  readPreferences,
  writePreferences,
  type StorageLike,
} from "../../src/client/preferences";

const memoryStorage = (): StorageLike => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test("falls back to defaults when nothing is stored", () => {
  expect(readPreferences(memoryStorage())).toEqual(defaultPreferences);
});

test("round-trips a full write through read", () => {
  const storage = memoryStorage();
  const preferences = {
    playbackSpeed: 2,
    tnoodleEnabled: true,
    tnoodleServerUrl: "http://localhost:9999",
    tnoodleEvent: "333" as const,
    inspectionSeconds: 12,
  };
  expect(writePreferences(storage, preferences)).toBe(true);
  expect(readPreferences(storage)).toEqual(preferences);
});

test("merges a partial stored object over defaults", () => {
  const storage = memoryStorage();
  storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({playbackSpeed: 2}));
  expect(readPreferences(storage)).toEqual({...defaultPreferences, playbackSpeed: 2});
});

test("falls back to defaults on malformed JSON", () => {
  const storage = memoryStorage();
  storage.setItem(PREFERENCES_STORAGE_KEY, "not json");
  expect(readPreferences(storage)).toEqual(defaultPreferences);
});

test("rejects an invalid playbackSpeed rather than trusting it", () => {
  const storage = memoryStorage();
  storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({playbackSpeed: 7}));
  expect(readPreferences(storage)).toEqual(defaultPreferences);
});

test("rejects a non-positive inspectionSeconds rather than trusting it", () => {
  const storage = memoryStorage();
  storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({inspectionSeconds: 0}));
  expect(readPreferences(storage)).toEqual(defaultPreferences);
});

test("rejects an unsupported TNoodle event", () => {
  const storage = memoryStorage();
  storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({tnoodleEvent: "444"}));
  expect(readPreferences(storage)).toEqual(defaultPreferences);
});
