/**
 * Orbit64 state adapter, compatible with flix-orbit64 FORMAT.md.
 *
 * State tokens use the base64url alphabet and pack the orbit coordinates in
 * Horner mixed-radix order.  The facelet tables below are the published
 * `orbit64-<n>x<n>-draft@1` convention (U R F D L B, row-major).
 */
import * as FaceletCodec from "./FaceletCodec.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";

type CubeState = {size: number; facelets: unknown};
type Result<T> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: OrbitError};
type OrbitError = {TAG: string; message: string};
type Coordinate = {kind: "corner"; p: number[]; o: number[]} | {kind: "midge"; p: number[]; o: number[]} | {kind: "wing"; p: number[]} | {kind: "center"; p: number[]};

export const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const widths: Record<number, number> = {2: 5, 3: 12, 4: 27, 5: 43};
const FACES = "URFDLB";
const ok = <T>(value: T): Result<T> => ({TAG: "Ok", _0: value});
const fail = <T = never>(tag: string, message: string): Result<T> => ({TAG: "Error", _0: {TAG: tag, message}});

export const describeError = (error: OrbitError | unknown): string =>
  typeof error === "object" && error !== null && "message" in error
    ? String((error as OrbitError).message)
    : String(error);

const factorial = (n: number): bigint => {
  let result = 1n;
  for (let i = 2; i <= n; i += 1) result *= BigInt(i);
  return result;
};
const choose = (n: number, k: number): bigint => {
  let result = 1n;
  for (let i = 1; i <= k; i += 1) result = (result * BigInt(n - k + i)) / BigInt(i);
  return result;
};
const parity = (p: number[]): number => p.reduce((sum, value, i) =>
  sum + p.slice(i + 1).filter(other => other < value).length, 0) & 1;
const permRank = (p: number[]): bigint => p.reduce((rank, value, i) =>
  rank * BigInt(p.length - i) + BigInt(p.slice(i + 1).filter(other => other < value).length), 0n);
const permUnrank = (rank: bigint, n: number): number[] => {
  const available = Array.from({length: n}, (_, i) => i);
  const output: number[] = [];
  let remainder = rank;
  for (let i = n; i > 0; i -= 1) {
    const factor = factorial(i - 1);
    const index = Number(remainder / factor);
    remainder %= factor;
    output.push(available.splice(index, 1)[0]);
  }
  return output;
};
const permRankWithParity = (p: number[]): bigint => {
  let value = 0n;
  for (let i = 0; i < p.length - 2; i += 1) {
    value = value * BigInt(p.length - i) + BigInt(p.slice(i + 1).filter(x => x < p[i]).length);
  }
  return value;
};
const permUnrankWithParity = (rank: bigint, n: number, required: number): number[] => {
  const available = Array.from({length: n}, (_, i) => i);
  const output: number[] = [];
  let remainder = rank;
  while (available.length > 2) {
    const divisor = factorial(available.length - 1) / 2n;
    const index = Number(remainder / divisor);
    remainder %= divisor;
    output.push(available.splice(index, 1)[0]);
  }
  const direct = [...output, available[0], available[1]];
  return parity(direct) === required ? direct : [...output, available[1], available[0]];
};
const baseRank = (digits: number[], base: number, count: number): bigint =>
  digits.slice(0, count).reduce((value, digit) => value * BigInt(base) + BigInt(digit), 0n);
const baseUnrank = (value: bigint, base: number, count: number): number[] => {
  const output = Array<number>(count + 1).fill(0);
  let remainder = value;
  for (let i = count - 1; i >= 0; i -= 1) { output[i] = Number(remainder % BigInt(base)); remainder /= BigInt(base); }
  output[count] = (base - output.slice(0, count).reduce((sum, x) => sum + x, 0) % base) % base;
  return output;
};
const multisetRank = (labels: number[]): bigint => {
  let remaining = Array.from({length: 24}, (_, i) => i);
  let value = 0n;
  for (let colour = 0; colour < 5; colour += 1) {
    const selected = remaining.map((slot, i) => labels[slot] === colour ? i : -1).filter(i => i >= 0);
    let rank = 0n;
    selected.forEach((cell, i) => { rank += choose(cell, i + 1); });
    value = value * choose(remaining.length, 4) + rank;
    const chosen = new Set(selected.map(i => remaining[i]));
    remaining = remaining.filter(slot => !chosen.has(slot));
  }
  return value;
};
const combUnrank = (value: bigint, count: number): number[] => {
  const result: number[] = [];
  let remainder = value;
  for (let i = count; i >= 1; i -= 1) {
    let candidate = i - 1;
    while (choose(candidate + 1, i) <= remainder) candidate += 1;
    result.unshift(candidate);
    remainder -= choose(candidate, i);
  }
  return result;
};
const multisetUnrank = (value: bigint): number[] => {
  const radices = [choose(24, 4), choose(20, 4), choose(16, 4), choose(12, 4), choose(8, 4)];
  const digits = Array<number>(5);
  let remainder = value;
  for (let i = 4; i >= 0; i -= 1) { digits[i] = Number(remainder % radices[i]); remainder /= radices[i]; }
  let slots = Array.from({length: 24}, (_, i) => i);
  const result = Array<number>(24).fill(5);
  digits.forEach((digit, colour) => {
    const indexes = combUnrank(BigInt(digit), 4);
    const selected = indexes.map(index => slots[index]);
    selected.forEach(slot => { result[slot] = colour; });
    const used = new Set(selected); slots = slots.filter(slot => !used.has(slot));
  });
  return result;
};

const radices: Record<Coordinate["kind"], bigint> = {
  corner: factorial(8) * 3n ** 7n, midge: factorial(12) * 2n ** 11n,
  wing: factorial(24), center: choose(24, 4) * choose(20, 4) * choose(16, 4) * choose(12, 4) * choose(8, 4),
};
const layout = (size: number): Coordinate["kind"][] => size === 2 ? ["corner"] : size === 3 ? ["corner", "midge"] : size === 4 ? ["corner", "wing", "center"] : ["corner", "midge", "wing", "center", "center"];
const rankCoordinate = (coordinate: Coordinate): bigint => {
  if (coordinate.kind === "corner") return permRank(coordinate.p) * 3n ** 7n + baseRank(coordinate.o, 3, 7);
  if (coordinate.kind === "midge") return permRank(coordinate.p) * 2n ** 11n + baseRank(coordinate.o, 2, 11);
  return coordinate.kind === "wing" ? permRank(coordinate.p) : multisetRank(coordinate.p);
};
const unrankCoordinate = (kind: Coordinate["kind"], value: bigint): Coordinate => {
  if (kind === "corner") return {kind, p: permUnrank(value / (3n ** 7n), 8), o: baseUnrank(value % (3n ** 7n), 3, 7)};
  if (kind === "midge") return {kind, p: permUnrank(value / (2n ** 11n), 12), o: baseUnrank(value % (2n ** 11n), 2, 11)};
  return kind === "wing" ? {kind, p: permUnrank(value, 24)} : {kind, p: multisetUnrank(value)};
};
const carriesFrame = (size: number) => size === 3 || size === 5;
const frameFaces = [
  "URFDLB", "UBRDFL", "ULBDRF", "UFLDBR",
  "RFULBD", "RDFLUB", "RBDLFU", "RUB LDF".replaceAll(" ", ""),
  "FLUBRD", "FURBDL", "FRDBLU", "FDLBUR",
  "DLFURB", "DFRUBL", "DRBULF", "DBLUFR",
  "LBU RFD".replaceAll(" ", ""), "LUFRDB", "LFDRBU", "LDBRUF",
  "BRUFLD", "BDRFUL", "BLDFRU", "BULFDR",
];
const rotationSteps = [
  ...Array.from({length: 16}, (_, index) => {
    const x = Math.floor(index / 4); const y = index % 4;
    return `${"x ".repeat(x)}${"y ".repeat(y)}`.trim();
  }),
  ...[1, 3].flatMap(z => Array.from({length: 4}, (_, y) => `${"z ".repeat(z)}${"y ".repeat(y)}`.trim())),
];
const inverseRotation = (algorithm: string) => algorithm.split(" ").filter(Boolean).reverse().map(move => `${move}'`).join(" ");
const transform = (state: CubeState, algorithm: string): CubeState | null => {
  if (algorithm === "") return state;
  const parsed = MoveParser.parse(state.size, algorithm) as {TAG: string; _0: unknown};
  if (parsed.TAG !== "Ok") return null;
  const applied = MoveExecutor.applyAlg(state, parsed._0) as {TAG: string; _0: unknown};
  return applied.TAG === "Ok" ? applied._0 as CubeState : null;
};
const fixedCentreFrame = (size: number, facelets: string): string =>
  [...Array(6).keys()].map(face => facelets[face * size * size + Math.floor(size * size / 2)]).join("");
const coordinateCount = (size: number) => {
  const total = layout(size).reduce((value, kind) => value * radices[kind], 1n);
  return carriesFrame(size) ? total / 2n : total;
};
const stateCount = (size: number) => coordinateCount(size) * BigInt(carriesFrame(size) ? 24 : 1);
const rankCoordinates = (size: number, coordinates: Coordinate[]): bigint => {
  if (!carriesFrame(size)) return coordinates.reduce((value, coordinate) => value * radices[coordinate.kind] + rankCoordinate(coordinate), 0n);
  const [corner, midge, ...tail] = coordinates as [{kind: "corner"; p: number[]; o: number[]}, {kind: "midge"; p: number[]; o: number[]}, ...Coordinate[]];
  let value = rankCoordinate(corner) * (radices.midge / 2n) + permRankWithParity(midge.p) * 2048n + baseRank(midge.o, 2, 11);
  tail.forEach(coordinate => { value = value * radices[coordinate.kind] + rankCoordinate(coordinate); });
  return value;
};
const unrankCoordinates = (size: number, value: bigint): Coordinate[] => {
  const kinds = layout(size);
  if (!carriesFrame(size)) {
    const output = Array<Coordinate>(kinds.length); let remainder = value;
    for (let i = kinds.length - 1; i >= 0; i -= 1) { output[i] = unrankCoordinate(kinds[i], remainder % radices[kinds[i]]); remainder /= radices[kinds[i]]; }
    return output;
  }
  const tail = kinds.slice(2); const tailRadix = tail.reduce((v, kind) => v * radices[kind], 1n);
  const header = value / tailRadix; let tailValue = value % tailRadix;
  const cornerRank = header / (radices.midge / 2n); const midgeValue = header % (radices.midge / 2n);
  const corner = unrankCoordinate("corner", cornerRank) as Extract<Coordinate, {kind: "corner"}>;
  const midgeP = permUnrankWithParity(midgeValue / 2048n, 12, parity(corner.p));
  const decodedTail = Array<Coordinate>(tail.length);
  for (let i = tail.length - 1; i >= 0; i -= 1) { decodedTail[i] = unrankCoordinate(tail[i], tailValue % radices[tail[i]]); tailValue /= radices[tail[i]]; }
  return [corner, {kind: "midge", p: midgeP, o: baseUnrank(midgeValue % 2048n, 2, 11)}, ...decodedTail];
};

const c3 = [[8,9,20],[6,18,38],[0,36,47],[2,45,11],[29,26,15],[27,44,24],[33,53,42],[35,17,51]];
const e3 = [[5,10],[7,19],[3,37],[1,46],[32,16],[28,25],[30,43],[34,52],[23,12],[21,41],[50,39],[48,14]];
const cc = [[0,1,2],[0,2,4],[0,4,5],[0,5,1],[3,2,1],[3,4,2],[3,5,4],[3,1,5]];
const ec = [[0,1],[0,2],[0,4],[0,5],[3,1],[3,2],[3,4],[3,5],[2,1],[2,4],[5,4],[5,1]];
const c4 = [[15,16,35],[12,32,67],[0,64,83],[3,80,19],[51,47,28],[48,79,44],[60,95,76],[63,31,92]];
const w4 = [[1,82],[7,18],[8,66],[14,34],[17,11],[23,84],[24,43],[30,59],[33,13],[39,20],[40,75],[46,50],[49,45],[55,29],[56,77],[62,93],[65,4],[71,36],[72,91],[78,52],[81,2],[87,68],[88,27],[94,61]];
const z4 = [5,6,9,10,21,22,25,26,37,38,41,42,53,54,57,58,69,70,73,74,85,86,89,90];
const wc = [[0,5],[0,1],[0,4],[0,2],[1,0],[1,5],[1,2],[1,3],[2,0],[2,1],[2,4],[2,3],[3,2],[3,1],[3,4],[3,5],[4,0],[4,2],[4,5],[4,3],[5,0],[5,4],[5,1],[5,3]];
const c5 = [[24,25,54],[20,50,104],[0,100,129],[4,125,29],[79,74,45],[75,124,70],[95,149,120],[99,49,145]];
const e5 = [[14,27],[22,52],[10,102],[2,127],[89,47],[77,72],[85,122],[97,147],[64,35],[60,114],[139,110],[135,39]];
const w5 = [[1,128],[9,28],[15,103],[23,53],[26,19],[34,130],[40,69],[48,94],[51,21],[59,30],[65,119],[73,78],[76,71],[84,46],[90,121],[98,146],[101,5],[109,55],[115,144],[123,80],[126,3],[134,105],[140,44],[148,96]];
const x5 = [6,8,16,18,31,33,41,43,56,58,66,68,81,83,91,93,106,108,116,118,131,133,141,143];
const p5 = [7,11,13,17,32,36,38,42,57,61,63,67,82,86,88,92,107,111,113,117,132,136,138,142];

const readOriented = (fs: number[], slots: number[][], colours: number[][], kind: "corner" | "midge"): Coordinate | null => {
  const p: number[] = [], o: number[] = [];
  for (const slot of slots) {
    const seen = slot.map(index => fs[index]); let found: [number, number] | undefined;
    colours.forEach((piece, pieceIndex) => { for (let orientation = 0; orientation < seen.length; orientation += 1) if (seen.every((colour, i) => colour === piece[(i - orientation + seen.length) % seen.length])) found ??= [pieceIndex, orientation]; });
    if (!found) return null; p.push(found[0]); o.push(found[1]);
  }
  return {kind, p, o} as Coordinate;
};
const readPlain = (fs: number[], slots: number[][]): Coordinate | null => {
  const p: number[] = [];
  for (const slot of slots) { const found = wc.findIndex(piece => piece[0] === fs[slot[0]] && piece[1] === fs[slot[1]]); if (found < 0) return null; p.push(found); }
  return {kind: "wing", p};
};
const readCenters = (fs: number[], slots: number[]): Coordinate => ({kind: "center", p: slots.map(index => fs[index])});
const inputCoordinates = (size: number, facelets: string): Coordinate[] | null => {
  const fs = [...facelets].map(letter => FACES.indexOf(letter)); if (fs.some(x => x < 0)) return null;
  if (size === 2) {
    const grid = Array.from({length: 54}, (_, index) => { const face = Math.floor(index / 9), row = Math.floor(index / 3) % 3, col = index % 3; return row % 2 === 0 && col % 2 === 0 ? fs[face * 4 + Math.floor(row / 2) * 2 + Math.floor(col / 2)] : face; });
    const corner = readOriented(grid, c3, cc, "corner"); return corner ? [corner] : null;
  }
  if (size === 3) { const corner = readOriented(fs, c3, cc, "corner"), midge = readOriented(fs, e3, ec, "midge"); return corner && midge ? [corner, midge] : null; }
  if (size === 4) { const corner = readOriented(fs, c4, cc, "corner"), wing = readPlain(fs, w4); return corner && wing ? [corner, wing, readCenters(fs, z4)] : null; }
  const corner = readOriented(fs, c5, cc, "corner"), midge = readOriented(fs, e5, ec, "midge"), wing = readPlain(fs, w5);
  return corner && midge && wing ? [corner, midge, wing, readCenters(fs, x5), readCenters(fs, p5)] : null;
};
const renderCoordinates = (size: number, coordinates: Coordinate[]): string => {
  const fs = Array<number>(6 * size * size).fill(0);
  const writeOriented = (coordinate: Extract<Coordinate, {kind: "corner" | "midge"}>, slots: number[][], colours: number[][]) => slots.forEach((slot, s) => slot.forEach((at, k) => { fs[at] = colours[coordinate.p[s]][(k - coordinate.o[s] + slot.length) % slot.length]; }));
  const writeWing = (coordinate: Extract<Coordinate, {kind: "wing"}>, slots: number[][]) => slots.forEach((slot, s) => slot.forEach((at, k) => { fs[at] = wc[coordinate.p[s]][k]; }));
  if (size === 2 || size === 3) {
    const grid = Array<number>(54).fill(0); for (let f = 0; f < 6; f += 1) grid[f * 9 + 4] = f;
    const corner = coordinates[0] as Extract<Coordinate, {kind: "corner"}>;
    c3.forEach((slot, s) => slot.forEach((_at, k) => { grid[c3[s][(k + corner.o[s]) % 3]] = cc[corner.p[s]][k]; }));
    if (size === 3) { const midge = coordinates[1] as Extract<Coordinate, {kind: "midge"}>; e3.forEach((slot, s) => slot.forEach((_at, k) => { grid[e3[s][(k + midge.o[s]) % 2]] = ec[midge.p[s]][k]; })); return grid.map(x => FACES[x]).join(""); }
    return Array.from({length: 24}, (_, i) => { const face = Math.floor(i / 4), row = Math.floor(i / 2) % 2, col = i % 2; return FACES[grid[face * 9 + row * 6 + col * 2]]; }).join("");
  }
  if (size === 4) { writeOriented(coordinates[0] as Extract<Coordinate, {kind: "corner"}>, c4, cc); writeWing(coordinates[1] as Extract<Coordinate, {kind: "wing"}>, w4); (coordinates[2] as Extract<Coordinate, {kind: "center"}>).p.forEach((colour, i) => { fs[z4[i]] = colour; }); }
  else { for (let f = 0; f < 6; f += 1) fs[[12,37,62,87,112,137][f]] = f; writeOriented(coordinates[0] as Extract<Coordinate, {kind: "corner"}>, c5, cc); writeOriented(coordinates[1] as Extract<Coordinate, {kind: "midge"}>, e5, ec); writeWing(coordinates[2] as Extract<Coordinate, {kind: "wing"}>, w5); (coordinates[3] as Extract<Coordinate, {kind: "center"}>).p.forEach((colour, i) => { fs[x5[i]] = colour; }); (coordinates[4] as Extract<Coordinate, {kind: "center"}>).p.forEach((colour, i) => { fs[p5[i]] = colour; }); }
  return fs.map(x => FACES[x]).join("");
};

export const decodeState = (input: string): Result<CubeState> => {
  const token = input.trim(); const size = Object.entries(widths).find(([, width]) => width === token.length)?.[0];
  if (!size) return fail("InvalidTokenLength", "Orbit64 state tokens use 5, 12, 27, or 43 characters for 2×2×2 through 5×5×5.");
  if (![...token].every(char => alphabet.includes(char))) return fail("InvalidTokenCharacter", "Orbit64 uses only the Base64URL alphabet.");
  if (alphabet.indexOf(token[0]) > 15) return fail("InvalidHeader", "This Orbit64 token is not a state token (its leading class bits are not 00).");
  const n = Number(size); let value = 0n; for (const char of token) value = value * 64n + BigInt(alphabet.indexOf(char));
  if (value >= stateCount(n)) return fail("InvalidState", `The token is out of range for ${n}×${n}×${n}.`);
  const frameCount = carriesFrame(n) ? 24n : 1n;
  const frame = Number(value % frameCount);
  const rendered = renderCoordinates(n, unrankCoordinates(n, value / frameCount));
  const parsed = FaceletCodec.parse(n, rendered) as {TAG: string; _0: unknown};
  if (parsed.TAG !== "Ok") return fail("InvalidState", "Decoded Orbit64 facelets are invalid.");
  if (!carriesFrame(n) || frame === 0) return ok(parsed._0 as CubeState);
  const rotation = rotationSteps.find(step => {
    const candidate = transform(parsed._0 as CubeState, step);
    return candidate !== null && fixedCentreFrame(n, FaceletCodec.render(candidate) as string) === frameFaces[frame];
  });
  const framed = rotation === undefined ? null : transform(parsed._0 as CubeState, rotation);
  return framed ? ok(framed) : fail("InvalidFrame", "Orbit64's stored whole-cube frame could not be applied.");
};
export const encodeState = (state: CubeState): Result<string> => {
  const n = state.size;
  if (!(n in widths)) return fail("UnsupportedSize", "Orbit64 supports 2×2×2 through 5×5×5.");
  let canonical = state;
  let frame = 0;
  const facelets = FaceletCodec.render(state) as string;
  if (carriesFrame(n)) {
    const shown = fixedCentreFrame(n, facelets);
    frame = frameFaces.indexOf(shown);
    if (frame < 0) return fail("InvalidCoordinates", "The odd-cube fixed centres do not form a right-handed whole-cube frame.");
    const rotation = rotationSteps.find(step => {
      const candidate = transform(state, inverseRotation(step));
      return candidate !== null && fixedCentreFrame(n, FaceletCodec.render(candidate) as string) === FACES;
    });
    if (rotation === undefined) return fail("InvalidCoordinates", "The odd-cube centre frame could not be canonicalised.");
    canonical = transform(state, inverseRotation(rotation))!;
  }
  const canonicalFacelets = FaceletCodec.render(canonical) as string;
  const coordinates = inputCoordinates(n, canonicalFacelets);
  if (!coordinates) return fail("InvalidCoordinates", "The facelets do not describe Orbit64's published piece convention.");
  if (carriesFrame(n) && parity((coordinates[0] as Extract<Coordinate, {kind: "corner"}>).p) !== parity((coordinates[1] as Extract<Coordinate, {kind: "midge"}>).p)) return fail("InvalidCoordinates", "Corner and midge permutation parity must match.");
  let value = rankCoordinates(n, coordinates) * BigInt(carriesFrame(n) ? 24 : 1) + BigInt(frame); let output = "";
  for (let i = 0; i < widths[n]; i += 1) { output = alphabet[Number(value % 64n)] + output; value /= 64n; }
  return ok(output);
};

/** Rotate an odd cube into Orbit64's canonical U/R/F fixed-centre frame. */
export const canonicaliseState = (state: CubeState): Result<CubeState> => {
  if (!carriesFrame(state.size)) return fail("UnsupportedSize", "Orientation canonicalisation is available for 3×3×3 and 5×5×5 states.");
  const facelets = FaceletCodec.render(state) as string;
  const frame = frameFaces.indexOf(fixedCentreFrame(state.size, facelets));
  if (frame < 0) return fail("InvalidCoordinates", "The fixed centres do not form a right-handed whole-cube frame.");
  const rotation = rotationSteps.find(step => {
    const candidate = transform(state, inverseRotation(step));
    return candidate !== null && fixedCentreFrame(state.size, FaceletCodec.render(candidate) as string) === FACES;
  });
  const canonical = rotation === undefined ? null : transform(state, inverseRotation(rotation));
  return canonical ? ok(canonical) : fail("InvalidFrame", "The fixed-centre frame could not be canonicalised.");
};
