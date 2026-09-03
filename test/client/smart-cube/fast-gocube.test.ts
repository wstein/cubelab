import {describe, expect, test} from "vitest";

import {
  AXIS_PERM,
  decodeGoCubeFacelets,
  gocubeChecksumValid,
  goCubeDeviceSupportsGyro,
  isGoCubeDeviceName,
  parseGoCubeOrientationPayload,
} from "../../../src/client/smart-cube/fast-gocube";

const solved = "U".repeat(9) + "R".repeat(9) + "F".repeat(9)
  + "D".repeat(9) + "L".repeat(9) + "B".repeat(9);

describe("fast GoCube transport", () => {
  test("recognizes only GoCube and Rubik's Connected names", () => {
    expect(isGoCubeDeviceName("GoCube_ABC")).toBe(true);
    expect(isGoCubeDeviceName("Rubiks_123")).toBe(true);
    expect(isGoCubeDeviceName("GANicXXX")).toBe(false);
    expect(goCubeDeviceSupportsGyro("GoCube_ABC")).toBe(true);
    expect(goCubeDeviceSupportsGyro("GoCubeX_ABC")).toBe(false);
    expect(goCubeDeviceSupportsGyro("Rubiks_123")).toBe(false);
  });

  test("decodes a solved full-state frame without waiting for it during connect", () => {
    // Type-2 GoCube frames contain six wire-order faces. Fill each wire face
    // with the colour that maps to its canonical URFDLB axis.
    const value = new Uint8Array(60);
    value[0] = 0x2a;
    value[2] = 2;
    const canonicalColours = "URFDLB";
    const wireColours = "BFUDRL";
    for (let wireFace = 0; wireFace < 6; wireFace += 1) {
      const canonicalFace = canonicalColours[AXIS_PERM[wireFace]]!;
      const rawColour = wireColours.indexOf(canonicalFace);
      value.fill(rawColour, 3 + wireFace * 9, 3 + (wireFace + 1) * 9);
    }
    value[value.length - 2] = 0x0d;
    value[value.length - 1] = 0x0a;
    let sum = 0;
    for (let index = 0; index <= value.length - 4; index += 1) sum += value[index]!;
    value[value.length - 3] = sum & 0xff;

    const frame = new DataView(value.buffer);
    expect(gocubeChecksumValid(frame)).toBe(true);
    expect(decodeGoCubeFacelets(frame)).toBe(solved);
  });

  test("normalizes a valid orientation payload and rejects malformed values", () => {
    expect(parseGoCubeOrientationPayload("1#2#3#4")).toMatchObject({
      x: 1 / Math.sqrt(30),
      y: -3 / Math.sqrt(30),
      z: -2 / Math.sqrt(30),
      w: 4 / Math.sqrt(30),
    });
    expect(parseGoCubeOrientationPayload("1#2#nope#4")).toBeNull();
    expect(parseGoCubeOrientationPayload("0#0#0#0")).toBeNull();
  });
});
