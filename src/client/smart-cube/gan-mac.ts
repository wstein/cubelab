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
