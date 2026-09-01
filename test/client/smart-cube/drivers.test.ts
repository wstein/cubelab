import {describe, expect, test} from "bun:test";

import {
  resolveSmartCubeDriver,
  smartCubeDrivers,
} from "../../../src/client/smart-cube/drivers";

describe("smart cube driver registry", () => {
  test("covers every requested manufacturer", () => {
    expect(smartCubeDrivers.map((driver) => driver.brand).sort()).toEqual([
      "gan",
      "giiker",
      "gocube",
      "moyu",
    ]);
  });

  test("resolves native protocol families", () => {
    expect(resolveSmartCubeDriver("gan-gen4", "GAN14ui")?.brand).toBe("gan");
    expect(resolveSmartCubeDriver("giiker", "GiCube")?.brand).toBe("giiker");
    expect(resolveSmartCubeDriver("gocube", "Rubik's Connected")?.brand).toBe("gocube");
    expect(resolveSmartCubeDriver("moyu-mhc", "MHC-01")?.brand).toBe("moyu");
    expect(resolveSmartCubeDriver("moyu32", "WCU_MY32_A388")?.brand).toBe("moyu");
  });

  test("classifies MoYu AI models transported over GAN Gen2 as MoYu", () => {
    expect(resolveSmartCubeDriver("gan-gen2", "AiCube-A1")?.brand).toBe("moyu");
    expect(resolveSmartCubeDriver("gan-gen2", "GAN12ui")?.brand).toBe("gan");
  });

  test("rejects protocols outside the supported registry", () => {
    expect(resolveSmartCubeDriver("unknown", "Mystery Cube")).toBeNull();
  });
});
