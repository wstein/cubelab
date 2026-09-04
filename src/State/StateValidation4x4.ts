import * as FaceletCodec from "./FaceletCodec.res.mjs";
import * as PieceReducer from "./PieceReducer.res.mjs";

type ReScriptResult<T> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: unknown};
type Face = "U" | "R" | "F" | "D" | "L" | "B";
type Vector = {x: number; y: number; z: number};
type Sticker = {position: Vector; normal: Vector};
type WingSlot = {indices: [number, number]};

const size = 4;
const last = size - 1;
const faces: Face[] = ["U", "R", "F", "D", "L", "B"];
const faceIndex = new Map(faces.map((face, index) => [face, index]));
const centreIndices = [5, 6, 9, 10];
const cornerLocalIndices = [0, 3, 12, 15];

const serialIndex = (face: Face, row: number, column: number): number =>
  faceIndex.get(face)! * 16 + row * size + column;

const stickerFor = (face: Face, row: number, column: number): Sticker => {
  switch (face) {
    case "U": return {position: {x: column, y: last, z: row}, normal: {x: 0, y: 1, z: 0}};
    case "D": return {position: {x: column, y: 0, z: last - row}, normal: {x: 0, y: -1, z: 0}};
    case "F": return {position: {x: column, y: last - row, z: last}, normal: {x: 0, y: 0, z: 1}};
    case "B": return {position: {x: last - column, y: last - row, z: 0}, normal: {x: 0, y: 0, z: -1}};
    case "R": return {position: {x: last, y: last - row, z: last - column}, normal: {x: 1, y: 0, z: 0}};
    case "L": return {position: {x: 0, y: last - row, z: column}, normal: {x: -1, y: 0, z: 0}};
  }
};

const faceletFor = (sticker: Sticker): [Face, number, number] => {
  const {x, y, z} = sticker.position;
  const normal = sticker.normal;
  if (normal.y === 1) return ["U", z, x];
  if (normal.y === -1) return ["D", last - z, x];
  if (normal.z === 1) return ["F", last - y, x];
  if (normal.z === -1) return ["B", last - y, last - x];
  if (normal.x === 1) return ["R", last - y, last - z];
  return ["L", last - y, z];
};

const indexFor = (sticker: Sticker): number => {
  const [face, row, column] = faceletFor(sticker);
  return serialIndex(face, row, column);
};

const positionKey = ({x, y, z}: Vector): string => `${x}/${y}/${z}`;

type Axis = "X" | "Y" | "Z";
type Generator = {axis: Axis; direction: 1 | -1; affected: (position: Vector) => boolean};

const rotate = (vector: Vector, axis: Axis, direction: 1 | -1, coordinate: boolean): Vector => {
  const invert = (value: number): number => coordinate ? last - value : -value;
  if (axis === "X") return direction === 1
    ? {x: vector.x, y: invert(vector.z), z: vector.y}
    : {x: vector.x, y: vector.z, z: invert(vector.y)};
  if (axis === "Y") return direction === 1
    ? {x: vector.z, y: vector.y, z: invert(vector.x)}
    : {x: invert(vector.z), y: vector.y, z: vector.x};
  return direction === 1
    ? {x: invert(vector.y), y: vector.x, z: vector.z}
    : {x: vector.y, y: invert(vector.x), z: vector.z};
};

const applyGenerator = (sticker: Sticker, generator: Generator): Sticker => {
  if (!generator.affected(sticker.position)) return sticker;
  return {
    position: rotate(sticker.position, generator.axis, generator.direction, true),
    normal: rotate(sticker.normal, generator.axis, generator.direction, false),
  };
};

const generators: Generator[] = [
  {axis: "X", direction: -1, affected: ({x}) => x === last},
  {axis: "X", direction: 1, affected: ({x}) => x === 0},
  {axis: "Y", direction: -1, affected: ({y}) => y === last},
  {axis: "Y", direction: 1, affected: ({y}) => y === 0},
  {axis: "Z", direction: -1, affected: ({z}) => z === last},
  {axis: "Z", direction: 1, affected: ({z}) => z === 0},
  {axis: "X", direction: -1, affected: ({x}) => x === last - 1},
  {axis: "X", direction: 1, affected: ({x}) => x === 1},
  {axis: "Y", direction: -1, affected: ({y}) => y === last - 1},
  {axis: "Y", direction: 1, affected: ({y}) => y === 1},
  {axis: "Z", direction: -1, affected: ({z}) => z === last - 1},
  {axis: "Z", direction: 1, affected: ({z}) => z === 1},
];

const wingSlots = (): WingSlot[] => {
  const grouped = new Map<string, number[]>();
  faces.forEach((face) => {
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const outer = row === 0 || row === last || column === 0 || column === last;
        const corner = (row === 0 || row === last) && (column === 0 || column === last);
        if (!outer || corner) continue;
        const index = serialIndex(face, row, column);
        const key = positionKey(stickerFor(face, row, column).position);
        grouped.set(key, [...(grouped.get(key) ?? []), index]);
      }
    }
  });
  const slots = [...grouped.values()]
    .map((indices) => indices.sort((left, right) => left - right))
    .sort((left, right) => left[0]! - right[0]!);
  if (slots.length !== 24 || slots.some((slot) => slot.length !== 2)) {
    throw new Error("The 4×4 wing topology is inconsistent.");
  }
  return slots.map((indices) => ({indices: [indices[0]!, indices[1]!]}));
};

const allWingSlots = wingSlots();

/** Every orientation/slot a particular physical wing can reach under legal turns. */
const wingDestinations = (source: WingSlot): Array<[number, number]> => {
  const [first, second] = source.indices;
  const toSticker = (index: number): Sticker => {
    const face = faces[Math.floor(index / 16)]!;
    const local = index % 16;
    return stickerFor(face, Math.floor(local / size), local % size);
  };
  const initial: [Sticker, Sticker] = [toSticker(first), toSticker(second)];
  const queue: Array<[Sticker, Sticker]> = [initial];
  const seen = new Set<string>();
  const destinations: Array<[number, number]> = [];
  while (queue.length > 0) {
    const [left, right] = queue.shift()!;
    const leftIndex = indexFor(left);
    const rightIndex = indexFor(right);
    const key = `${leftIndex}/${rightIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    destinations.push([leftIndex, rightIndex]);
    generators.forEach((generator) => queue.push([
      applyGenerator(left, generator),
      applyGenerator(right, generator),
    ]));
  }
  return destinations;
};

const allWingDestinations = allWingSlots.map(wingDestinations);

const cornerState = (compact: string): ReScriptResult<unknown> => {
  const reduced = faces.flatMap((face) => cornerLocalIndices.map((index) => compact[serialIndex(face, Math.floor(index / 4), index % 4)]!)).join("");
  const parsed = FaceletCodec.parse(2, reduced) as ReScriptResult<unknown>;
  if (parsed.TAG === "Error") return parsed;
  return PieceReducer.reduce(parsed._0) as ReScriptResult<unknown>;
};

/**
 * Whether the supplied (possibly partial) wing stickers admit one distinct
 * physical wing for every slot. Null means that sticker has not been entered
 * yet, which lets the manual editor use exactly this reachability model for
 * its live colour dots.
 */
export const canComplete4x4Wings = (compact: ReadonlyArray<string | null>): boolean => {
  if (compact.length !== 96) return false;
  const sourceColours = allWingSlots.map(({indices}) => [
    faces[Math.floor(indices[0] / 16)]!,
    faces[Math.floor(indices[1] / 16)]!,
  ] as const);
  const edges = allWingDestinations.map((destinations, source) => {
    const [firstColour, secondColour] = sourceColours[source]!;
    const slots = new Set<number>();
    destinations.forEach(([first, second]) => {
      if (compact[first] !== null && compact[first] !== firstColour) return;
      if (compact[second] !== null && compact[second] !== secondColour) return;
      const slot = allWingSlots.findIndex(({indices}) => indices.includes(first) && indices.includes(second));
      if (slot >= 0) slots.add(slot);
    });
    return [...slots];
  });
  const matchedSourceForSlot = Array<number>(24).fill(-1);
  const assign = (source: number, visited: Set<number>): boolean => edges[source]!.some((slot) => {
    if (visited.has(slot)) return false;
    visited.add(slot);
    if (matchedSourceForSlot[slot] === -1 || assign(matchedSourceForSlot[slot]!, visited)) {
      matchedSourceForSlot[slot] = source;
      return true;
    }
    return false;
  });
  return edges.every((_, source) => assign(source, new Set<number>()));
};

/**
 * Validates all observable 4×4 piece constraints. Centre and same-colour
 * wing copies are physically indistinguishable in facelets, so their internal
 * permutation parity is intentionally existentially matched rather than
 * falsely rejecting legal reduction-parity states.
 */
export const validate4x4 = (state: unknown): string | null => {
  if ((state as {size?: unknown}).size !== 4) return "The 4×4 validator received a non-4×4 state.";
  const compact = FaceletCodec.render(state);
  if (typeof compact !== "string" || compact.length !== 96) return "A 4×4 state must contain 96 facelets.";
  const corners = cornerState(compact);
  if (corners.TAG === "Error") return `Invalid 4×4 corners: ${PieceReducer.describeError(corners._0)}.`;
  const centres = faces.flatMap((face) => centreIndices.map((index) => compact[serialIndex(face, Math.floor(index / 4), index % 4)]!));
  if (faces.some((face) => centres.filter((colour) => colour === face).length !== 4)) {
    return "Invalid 4×4 centres: each centre colour must occur exactly four times.";
  }
  if (!canComplete4x4Wings(compact.split(""))) {
    return "Invalid 4×4 wings: the stickers cannot form a legal permutation and orientation of the 24 wing pieces.";
  }
  return null;
};
