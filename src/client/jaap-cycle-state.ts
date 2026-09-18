import * as StateTypes from "../State/StateTypes.res.mjs";
import type {CubeState} from "./cube-gl";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};

type Axis = "x" | "y" | "z";
type JaapPosition = {
  source: string;
  coordinate: [number, number, number];
  stickerFaces: string[];
  key: string;
};

const storageIndex: Record<string, number> = {U: 0, L: 1, F: 2, R: 3, B: 4, D: 5};
const letterCoordinate: Record<string, {axis: Axis; value: number}> = {
  L: {axis: "x", value: 0}, l: {axis: "x", value: 1}, r: {axis: "x", value: 2}, R: {axis: "x", value: 3},
  D: {axis: "y", value: 0}, d: {axis: "y", value: 1}, u: {axis: "y", value: 2}, U: {axis: "y", value: 3},
  B: {axis: "z", value: 0}, b: {axis: "z", value: 1}, f: {axis: "z", value: 2}, F: {axis: "z", value: 3},
};

const faceletIndex = (face: string, [x, y, z]: [number, number, number]): number => {
  const last = 3;
  const [row, col] = face === "U" ? [z, x]
    : face === "D" ? [last - z, x]
    : face === "F" ? [last - y, x]
    : face === "B" ? [last - y, last - x]
    : face === "R" ? [last - y, last - z]
    : [last - y, z];
  return row * 4 + col;
};

const coordinateLetter = (axis: Axis, value: number): string => {
  const letters: Record<Axis, string[]> = {
    x: ["L", "l", "r", "R"],
    y: ["D", "d", "u", "U"],
    z: ["B", "b", "f", "F"],
  };
  return letters[axis][value]!;
};

// Jaap writes the y, z, then x layer coordinate. This produces his published
// names directly: UFl, UbR, dFR, UBr, UfL, uFL, ...
const visiblePositions = (): JaapPosition[] => {
  const positions: JaapPosition[] = [];
  for (let y = 0; y < 4; y += 1) for (let z = 0; z < 4; z += 1) for (let x = 0; x < 4; x += 1) {
    const label = `${coordinateLetter("y", y)}${coordinateLetter("z", z)}${coordinateLetter("x", x)}`;
    if (!/[A-Z]/.test(label)) continue;
    const position = parsePosition(label);
    positions.push(position);
  }
  return positions;
};

const parsePosition = (source: string): JaapPosition => {
  const label = source.trim();
  if (!/^[UDLRFBudlrfb]{3}$/.test(label)) {
    throw new Error(`'${source}' is not a Jaap 4×4 cubie position.`);
  }
  const values: Partial<Record<Axis, number>> = {};
  const stickerFaces: string[] = [];
  for (const letter of label) {
    const coordinate = letterCoordinate[letter]!;
    if (values[coordinate.axis] !== undefined) {
      throw new Error(`'${label}' names the ${coordinate.axis}-axis more than once.`);
    }
    values[coordinate.axis] = coordinate.value;
    if (letter === letter.toUpperCase()) stickerFaces.push(letter);
  }
  if (values.x === undefined || values.y === undefined || values.z === undefined) {
    throw new Error(`'${label}' must name one layer on each cube axis.`);
  }
  if (stickerFaces.length === 0) throw new Error(`'${label}' names an invisible internal cubie.`);
  const coordinate: [number, number, number] = [values.x, values.y, values.z];
  return {source: label, coordinate, stickerFaces, key: coordinate.join(":")};
};

/** Jaap's native 4×4 state cycles contain comma-separated mixed-case cubie
 * coordinates. This deliberately excludes parenthesised move algorithms. */
export const looksLikeJaapCycleState = (input: string): boolean => {
  const tokens = [...input.matchAll(/(?:^|[(,])\s*([UDLRFBudlrfb]{3})\s*(?=[,)])/g)].map((match) => match[1]!);
  return tokens.length > 0 && tokens.some((token) => /[A-Z]/.test(token) && /[a-z]/.test(token));
};

/** Parses Jaap Scherphuis's 4×4 permutation cycles. Uppercase letters name
 * visible outer faces; lowercase letters select one of the two inner layers.
 * Letter order carries sticker orientation from one cycle member to the next. */
export const parseJaapCycleState = (input: string, size: number): Result<CubeState, string> => {
  if (size !== 4) return {TAG: "Error", _0: "Jaap mixed-case cubie cycles are available only for the 4×4×4."};
  const cycleMatches = [...input.matchAll(/\(([^()]*)\)/g)];
  if (cycleMatches.length === 0) return {TAG: "Error", _0: "Expected at least one Jaap permutation cycle."};
  const remainder = input.replace(/\(([^()]*)\)/g, "").trim();
  if (remainder !== "") return {TAG: "Error", _0: `Unexpected Jaap cycle input '${remainder}'.`};

  try {
    const solved = StateTypes.solved(4)._0 as CubeState;
    const facelets = solved.facelets.map((face) => [...face]);
    const used = new Set<string>();

    for (const match of cycleMatches) {
      const members = match[1]!.split(",").map(parsePosition);
      if (members.length < 2) throw new Error("A Jaap permutation cycle needs at least two positions.");
      const stickerCount = members[0]!.stickerFaces.length;
      if (!members.every((member) => member.stickerFaces.length === stickerCount)) {
        throw new Error("Each Jaap cycle must contain only one cubie kind: corners, wings, or centres.");
      }
      if (new Set(members.map((member) => member.key)).size !== members.length) {
        throw new Error("A Jaap cycle may not repeat a cubie position.");
      }
      for (const member of members) {
        if (used.has(member.key)) throw new Error(`'${member.source}' appears in more than one cycle.`);
        used.add(member.key);
      }

      const colours = members.map((member) => member.stickerFaces.map((face) =>
        facelets[storageIndex[face]!]![faceletIndex(face, member.coordinate)]!));
      members.forEach((destination, index) => {
        const sourceColours = colours[(index + members.length - 1) % members.length]!;
        destination.stickerFaces.forEach((face, sticker) => {
          facelets[storageIndex[face]!]![faceletIndex(face, destination.coordinate)] = sourceColours[sticker]!;
        });
      });
    }
    return {TAG: "Ok", _0: {size: 4, facelets}};
  } catch (reason) {
    return {TAG: "Error", _0: reason instanceof Error ? reason.message : String(reason)};
  }
};

/** Renders a 4×4 facelet state as Jaap cubie cycles. Same-colour centres and
 * paired wings are assigned deterministically, because a sticker state cannot
 * distinguish those otherwise identical physical identities. */
export const renderJaapCycleState = (state: CubeState): Result<string, string> => {
  if (state.size !== 4) return {TAG: "Error", _0: "Jaap mixed-case cubie cycles are available only for the 4×4×4."};
  const positions = visiblePositions();
  const sourceForDestination = Array.from({length: positions.length}, () => -1);
  const usedSources = new Set<number>();

  for (let destinationIndex = 0; destinationIndex < positions.length; destinationIndex += 1) {
    const destination = positions[destinationIndex]!;
    const colours = destination.stickerFaces.map((face) =>
      state.facelets[storageIndex[face]!]![faceletIndex(face, destination.coordinate)]!);
    const candidates = positions.map((source, sourceIndex) => ({source, sourceIndex})).filter(({source, sourceIndex}) =>
      !usedSources.has(sourceIndex)
      && source.stickerFaces.length === destination.stickerFaces.length
      && source.stickerFaces.every((face, index) => face === colours[index]));
    if (candidates.length === 0) {
      return {
        TAG: "Error",
        _0: `The stickers at ${destination.source} require an orientation that plain Jaap cubie cycles cannot express.`,
      };
    }
    const selected = candidates.find(({source}) => source.key === destination.key) ?? candidates[0]!;
    sourceForDestination[destinationIndex] = selected.sourceIndex;
    usedSources.add(selected.sourceIndex);
  }

  const destinationForSource = Array.from({length: positions.length}, () => -1);
  sourceForDestination.forEach((source, destination) => { destinationForSource[source] = destination; });
  const visited = new Set<number>();
  const cycles: string[] = [];
  destinationForSource.forEach((next, start) => {
    if (visited.has(start) || next === start) return;
    const members = [start];
    visited.add(start);
    let current = next;
    while (current !== start) {
      if (current < 0 || visited.has(current)) return;
      members.push(current);
      visited.add(current);
      current = destinationForSource[current]!;
    }
    cycles.push(`(${members.map((index) => positions[index]!.source).join(",")})`);
  });
  return {TAG: "Ok", _0: cycles.join("")};
};
