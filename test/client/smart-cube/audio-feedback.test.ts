import {describe, expect, test} from "vitest";

import {
  type SmartCubeAudioCue,
  SMART_CUBE_SOUND_PREFERENCE,
  readSmartCubeSoundPreference,
  writeSmartCubeSoundPreference,
} from "../../../src/client/smart-cube/audio-feedback";

describe("smart cube sound preference", () => {
  test("supports a neutral cue for every cube turn", () => {
    const cue: SmartCubeAudioCue = "turn";
    expect(cue).toBe("turn");
  });

  test("defaults on and persists an explicit opt-out", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(readSmartCubeSoundPreference(storage)).toBe(true);
    writeSmartCubeSoundPreference(storage, false);
    expect(values.get(SMART_CUBE_SOUND_PREFERENCE)).toBe("off");
    expect(readSmartCubeSoundPreference(storage)).toBe(false);
    writeSmartCubeSoundPreference(storage, true);
    expect(readSmartCubeSoundPreference(storage)).toBe(true);
  });
});
