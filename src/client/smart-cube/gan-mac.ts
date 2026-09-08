/**
 * GAN i4 advertisements can end with an FF broadcast-address trailer instead
 * of their encryption MAC. The observed address sits after a three-byte GAN
 * prefix in the manufacturer payload. Return it in advertised byte order: the
 * GAN transport reverses its display form when it derives the AES salt.
 */
export const ganI4MacFromManufacturerData = (data: DataView): string | null => {
  if (data.byteLength < 9) return null;
  const tailIsBroadcast = Array.from({length: 6}, (_, index) => data.getUint8(data.byteLength - 6 + index))
    .every((value) => value === 0xff);
  if (!tailIsBroadcast) return null;
  return Array.from({length: 6}, (_, index) => data.getUint8(3 + index).toString(16).padStart(2, "0"))
    .join(":").toUpperCase();
};

/**
 * Web Bluetooth only exposes manufacturer data after `watchAdvertisements()`
 * starts.  This must run before GATT connects: several GAN i4 firmwares stop
 * advertising once the connection is established.
 */
export const recoverGanI4MacFromAdvertisements = async (
  device: BluetoothDevice,
  timeoutMs = 8_000,
): Promise<string | null> => {
  if (!/^GANi4(?:_|$)/i.test(device.name ?? "") || typeof device.watchAdvertisements !== "function") {
    return null;
  }
  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const finish = (mac: string | null) => {
      if (settled) return;
      settled = true;
      if (timeout !== null) clearTimeout(timeout);
      device.removeEventListener("advertisementreceived", onAdvertisement);
      controller.abort();
      resolve(mac);
    };
    const onAdvertisement = (event: Event) => {
      const manufacturerData = (event as BluetoothAdvertisingEvent).manufacturerData;
      if (!manufacturerData) return;
      for (const value of manufacturerData.values()) {
        const mac = ganI4MacFromManufacturerData(value);
        if (mac) finish(mac);
      }
    };
    timeout = setTimeout(() => finish(null), timeoutMs);
    device.addEventListener("advertisementreceived", onAdvertisement);
    device.watchAdvertisements({signal: controller.signal}).catch(() => finish(null));
  });
};
