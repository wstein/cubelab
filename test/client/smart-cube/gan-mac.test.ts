import {describe, expect, test} from "vitest";

import {
  ganI4MacFromManufacturerData,
  ganI4TransportMacFromManufacturerData,
  recoverGanI4MacFromAdvertisements,
  reverseGanMacAddress,
} from "../../../src/client/smart-cube/gan-mac";

describe("GAN i4 manufacturer-data MAC recovery", () => {
  test("reads the i4 address before its FF broadcast trailer", () => {
    // Captured GANi4_A73F payload after its 0x0001 company identifier.
    const data = new DataView(Uint8Array.from([
      0x00, 0x00, 0x00, 0x3f, 0xa7, 0xbd, 0x5e, 0x3d, 0x0c,
      0x64, 0x63, 0x6f, 0x6e, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]).buffer);
    expect(ganI4MacFromManufacturerData(data)).toBe("3F:A7:BD:5E:3D:0C");
    // The browser transport reverses its display MAC before salting AES. The
    // capture proves i4 needs this advertised byte order as the final salt.
    expect(ganI4TransportMacFromManufacturerData(data)).toBe("0C:3D:5E:BD:A7:3F");
  });

  test("does not reinterpret an ordinary GAN advertisement", () => {
    const data = new DataView(Uint8Array.from([0, 0, 0, 1, 2, 3, 4, 5, 6]).buffer);
    expect(ganI4MacFromManufacturerData(data)).toBeNull();
  });

  test("does not wait for advertisements from a non-i4 cube", async () => {
    const watchAdvertisements = () => Promise.reject(new Error("should not run"));
    await expect(recoverGanI4MacFromAdvertisements({
      name: "GAN356i",
      watchAdvertisements,
    } as unknown as BluetoothDevice)).resolves.toBeNull();
  });

  test("only reverses a valid human-entered MAC", () => {
    expect(reverseGanMacAddress("3F:A7:BD:5E:3D:0C")).toBe("0C:3D:5E:BD:A7:3F");
    expect(reverseGanMacAddress("not-a-mac")).toBeNull();
  });
});
