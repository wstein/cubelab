import {describe, expect, test} from "vitest";

import {
  defaultRegripProfile,
  parseRegripProfileRegistry,
  regripProfileFor,
} from "../../../src/client/smart-cube/regrip-profile";

describe("regrip profile registry", () => {
  test("parses a well-formed registry", () => {
    const registry = parseRegripProfileRegistry({
      version: 1,
      default: {label: "Default", regripThresholdDegrees: 65, artificialDriftDegreesPerSecond: 120},
      profiles: {
        gocube: {label: "GoCube", regripThresholdDegrees: 70, artificialDriftDegreesPerSecond: 90},
      },
    });
    expect(registry).not.toBeNull();
    expect(regripProfileFor(registry, "gocube")).toEqual({
      label: "GoCube",
      regripThresholdDegrees: 70,
      artificialDriftDegreesPerSecond: 90,
    });
    expect(regripProfileFor(registry, "gan")).toEqual(registry!.default);
  });

  test("rejects a threshold outside the 0-90 range a cardinal step allows", () => {
    expect(parseRegripProfileRegistry({
      version: 1,
      default: {label: "Default", regripThresholdDegrees: 95, artificialDriftDegreesPerSecond: 120},
      profiles: {},
    })).toBeNull();
  });

  test("drops an unknown brand key rather than failing the whole registry", () => {
    const registry = parseRegripProfileRegistry({
      version: 1,
      default: {label: "Default", regripThresholdDegrees: 65, artificialDriftDegreesPerSecond: 120},
      profiles: {
        atari: {label: "Atari", regripThresholdDegrees: 65, artificialDriftDegreesPerSecond: 120},
      },
    });
    expect(registry?.profiles).toEqual({});
  });

  test("rejects malformed input entirely", () => {
    expect(parseRegripProfileRegistry(null)).toBeNull();
    expect(parseRegripProfileRegistry({version: 2, default: {}, profiles: {}})).toBeNull();
    expect(parseRegripProfileRegistry({version: 1, default: {label: "x"}, profiles: {}})).toBeNull();
  });

  test("falls back to the built-in default when no registry is available", () => {
    expect(regripProfileFor(null, "gocube")).toEqual(defaultRegripProfile);
  });
});
