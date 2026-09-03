/** Binary contract for the lazily fetched, HTM-optimal 2×2 solver tables. */
export const OPTIMAL_2X2_TABLE_VERSION = 1;
export const OPTIMAL_2X2_TABLE_URL = "/solver/optimal-2x2.v1.bin";
export const OPTIMAL_2X2_PERMUTATIONS = 40_320;
export const OPTIMAL_2X2_ORIENTATIONS = 2_187;
export const OPTIMAL_2X2_MOVES = 18;
export const OPTIMAL_2X2_MAGIC = "CL2X2V1\0";
export const OPTIMAL_2X2_HEADER_BYTES = 32;

export type Optimal2x2Tables = {
  permutationMoves: Uint16Array;
  orientationMoves: Uint16Array;
  permutationDistance: Uint8Array;
  orientationDistance: Uint8Array;
};

const packedBytes = (entries: number): number => Math.ceil(entries / 2);

const checksum = (bytes: Uint8Array): number => {
  let hash = 2_166_136_261;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

export const optimal2x2TableBytes = (): number =>
  OPTIMAL_2X2_HEADER_BYTES
  + OPTIMAL_2X2_PERMUTATIONS * OPTIMAL_2X2_MOVES * Uint16Array.BYTES_PER_ELEMENT
  + OPTIMAL_2X2_ORIENTATIONS * OPTIMAL_2X2_MOVES * Uint16Array.BYTES_PER_ELEMENT
  + packedBytes(OPTIMAL_2X2_PERMUTATIONS)
  + packedBytes(OPTIMAL_2X2_ORIENTATIONS);

const readMagic = (bytes: Uint8Array): string => String.fromCharCode(...bytes.slice(0, 8));

export const decodeOptimal2x2Tables = (buffer: ArrayBuffer): Optimal2x2Tables => {
  if (buffer.byteLength !== optimal2x2TableBytes()) {
    throw new Error("The optimal 2×2 solver table has an unexpected size.");
  }
  const bytes = new Uint8Array(buffer);
  if (readMagic(bytes) !== OPTIMAL_2X2_MAGIC) {
    throw new Error("The optimal 2×2 solver table has an invalid signature.");
  }
  const header = new DataView(buffer);
  if (header.getUint32(8, true) !== OPTIMAL_2X2_TABLE_VERSION) {
    throw new Error("This optimal 2×2 solver table version is not supported.");
  }
  if (
    header.getUint32(12, true) !== OPTIMAL_2X2_PERMUTATIONS
    || header.getUint32(16, true) !== OPTIMAL_2X2_ORIENTATIONS
    || header.getUint32(20, true) !== OPTIMAL_2X2_MOVES
  ) {
    throw new Error("The optimal 2×2 solver table has incompatible coordinates.");
  }
  if (header.getUint32(24, true) !== checksum(bytes.slice(OPTIMAL_2X2_HEADER_BYTES))) {
    throw new Error("The optimal 2×2 solver table failed its integrity check.");
  }

  let offset = OPTIMAL_2X2_HEADER_BYTES;
  const permutationMoveBytes = OPTIMAL_2X2_PERMUTATIONS * OPTIMAL_2X2_MOVES * Uint16Array.BYTES_PER_ELEMENT;
  const orientationMoveBytes = OPTIMAL_2X2_ORIENTATIONS * OPTIMAL_2X2_MOVES * Uint16Array.BYTES_PER_ELEMENT;
  const permutationMoves = new Uint16Array(buffer.slice(offset, offset + permutationMoveBytes));
  offset += permutationMoveBytes;
  const orientationMoves = new Uint16Array(buffer.slice(offset, offset + orientationMoveBytes));
  offset += orientationMoveBytes;
  const permutationDistance = new Uint8Array(buffer.slice(offset, offset + packedBytes(OPTIMAL_2X2_PERMUTATIONS)));
  offset += packedBytes(OPTIMAL_2X2_PERMUTATIONS);
  const orientationDistance = new Uint8Array(buffer.slice(offset, offset + packedBytes(OPTIMAL_2X2_ORIENTATIONS)));
  return {permutationMoves, orientationMoves, permutationDistance, orientationDistance};
};

export const encodeOptimal2x2Tables = (tables: Optimal2x2Tables): ArrayBuffer => {
  const buffer = new ArrayBuffer(optimal2x2TableBytes());
  const bytes = new Uint8Array(buffer);
  bytes.set(Array.from(OPTIMAL_2X2_MAGIC, (character) => character.charCodeAt(0)), 0);
  const header = new DataView(buffer);
  header.setUint32(8, OPTIMAL_2X2_TABLE_VERSION, true);
  header.setUint32(12, OPTIMAL_2X2_PERMUTATIONS, true);
  header.setUint32(16, OPTIMAL_2X2_ORIENTATIONS, true);
  header.setUint32(20, OPTIMAL_2X2_MOVES, true);

  let offset = OPTIMAL_2X2_HEADER_BYTES;
  const write = (values: Uint8Array | Uint16Array): void => {
    bytes.set(new Uint8Array(values.buffer, values.byteOffset, values.byteLength), offset);
    offset += values.byteLength;
  };
  write(tables.permutationMoves);
  write(tables.orientationMoves);
  write(tables.permutationDistance);
  write(tables.orientationDistance);
  header.setUint32(24, checksum(bytes.slice(OPTIMAL_2X2_HEADER_BYTES)), true);
  return buffer;
};

export const packedDistance = (table: Uint8Array, coordinate: number): number => {
  const value = table[Math.floor(coordinate / 2)]!;
  return coordinate % 2 === 0 ? value & 15 : value >>> 4;
};
