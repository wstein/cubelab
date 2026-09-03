export const OPTIMAL_2X2_TABLE_VERSION = 2;
export const OPTIMAL_2X2_TABLE_URL = "/solver/optimal-2x2.v2.bin";
export const OPTIMAL_2X2_STATES = 3_674_160;
export const OPTIMAL_2X2_MAGIC = "CL2X2V2\0";
export const OPTIMAL_2X2_HEADER_BYTES = 32;
export type Optimal2x2Tables = {distance: Uint8Array};

const packedBytes = (entries: number): number => Math.ceil(entries / 2);
const checksum = (bytes: Uint8Array): number => {
  let hash = 2_166_136_261;
  for (const value of bytes) { hash ^= value; hash = Math.imul(hash, 16_777_619); }
  return hash >>> 0;
};
export const optimal2x2TableBytes = (): number => OPTIMAL_2X2_HEADER_BYTES + packedBytes(OPTIMAL_2X2_STATES);
export const packedDistance = (table: Uint8Array, coordinate: number): number => {
  const value = table[Math.floor(coordinate / 2)]!;
  return coordinate % 2 === 0 ? value & 15 : value >>> 4;
};
export const decodeOptimal2x2Tables = (buffer: ArrayBuffer): Optimal2x2Tables => {
  if (buffer.byteLength !== optimal2x2TableBytes()) throw new Error("The optimal 2×2 solver table has an unexpected size.");
  const bytes = new Uint8Array(buffer);
  const header = new DataView(buffer);
  if (String.fromCharCode(...bytes.slice(0, 8)) !== OPTIMAL_2X2_MAGIC) throw new Error("The optimal 2×2 solver table has an invalid signature.");
  if (header.getUint32(8, true) !== OPTIMAL_2X2_TABLE_VERSION || header.getUint32(12, true) !== OPTIMAL_2X2_STATES) throw new Error("The optimal 2×2 solver table has incompatible coordinates.");
  const distance = new Uint8Array(buffer.slice(OPTIMAL_2X2_HEADER_BYTES));
  if (header.getUint32(16, true) !== checksum(distance)) throw new Error("The optimal 2×2 solver table failed its integrity check.");
  return {distance};
};
export const encodeOptimal2x2Tables = ({distance}: Optimal2x2Tables): ArrayBuffer => {
  if (distance.byteLength !== packedBytes(OPTIMAL_2X2_STATES)) throw new Error("The optimal 2×2 distance table has an unexpected length.");
  const buffer = new ArrayBuffer(optimal2x2TableBytes());
  const bytes = new Uint8Array(buffer);
  bytes.set(Array.from(OPTIMAL_2X2_MAGIC, (character) => character.charCodeAt(0)));
  bytes.set(distance, OPTIMAL_2X2_HEADER_BYTES);
  const header = new DataView(buffer);
  header.setUint32(8, OPTIMAL_2X2_TABLE_VERSION, true);
  header.setUint32(12, OPTIMAL_2X2_STATES, true);
  header.setUint32(16, checksum(distance), true);
  return buffer;
};
