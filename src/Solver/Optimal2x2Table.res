%%raw(`
export const OPTIMAL_2X2_TABLE_VERSION = 2;
export const OPTIMAL_2X2_TABLE_URL = "/solver/optimal-2x2.v2.bin";
export const OPTIMAL_2X2_STATES = 3674160;
export const OPTIMAL_2X2_MAGIC = "CL2X2V2\0";
export const OPTIMAL_2X2_HEADER_BYTES = 32;
`)

let optimal_2X2_TABLE_VERSION = 2
let optimal_2X2_TABLE_URL = "/solver/optimal-2x2.v2.bin"
let optimal_2X2_STATES = 3674160
let optimal_2X2_MAGIC = "CL2X2V2\x00"
let optimal_2X2_HEADER_BYTES = 32

type optimal2x2Tables = {
  distance: unknown,
}

let packedBytes = entries => (entries + 1) / 2

let checksum: 'bytes => int = %raw(`function(bytes) {
  let hash = 2166136261;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}`)

let optimal2x2TableBytes = () => optimal_2X2_HEADER_BYTES + packedBytes(optimal_2X2_STATES)

let packedDistance: ('table, int) => int = %raw(`function(table, coordinate) {
  const value = table[Math.floor(coordinate / 2)];
  return coordinate % 2 === 0 ? value & 15 : value >>> 4;
}`)

let decodeOptimal2x2Tables: 'buffer => optimal2x2Tables = %raw(`function(buffer) {
  if (buffer.byteLength !== (32 + Math.ceil(3674160 / 2))) {
    throw new Error("The optimal 2×2 solver table has an unexpected size.");
  }
  const bytes = new Uint8Array(buffer);
  const header = new DataView(buffer);
  if (String.fromCharCode(...bytes.slice(0, 8)) !== "CL2X2V2\0") {
    throw new Error("The optimal 2×2 solver table has an invalid signature.");
  }
  if (header.getUint32(8, true) !== 2 || header.getUint32(12, true) !== 3674160) {
    throw new Error("The optimal 2×2 solver table has incompatible coordinates.");
  }
  const distance = new Uint8Array(buffer.slice(32));
  let hash = 2166136261;
  for (const value of distance) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  if (header.getUint32(16, true) !== (hash >>> 0)) {
    throw new Error("The optimal 2×2 solver table failed its integrity check.");
  }
  return {distance};
}`)

let encodeOptimal2x2Tables: optimal2x2Tables => 'buffer = %raw(`function(tables) {
  const distance = tables.distance;
  const expectedLength = Math.ceil(3674160 / 2);
  if (distance.byteLength !== expectedLength) {
    throw new Error("The optimal 2×2 distance table has an unexpected length.");
  }
  const totalBytes = 32 + expectedLength;
  const buffer = new ArrayBuffer(totalBytes);
  const bytes = new Uint8Array(buffer);
  bytes.set(Array.from("CL2X2V2\0", character => character.charCodeAt(0)));
  bytes.set(distance, 32);
  const header = new DataView(buffer);
  header.setUint32(8, 2, true);
  header.setUint32(12, 3674160, true);
  let hash = 2166136261;
  for (const value of distance) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  header.setUint32(16, hash >>> 0, true);
  return buffer;
}`)
