import type {CubeState} from "./cube-gl";

export type Face = "U" | "L" | "F" | "R" | "B" | "D";
export type GridPosition = [number, number, number];
export type CubieFocus = {
  piece: string;
  source: [number, number, number];
  target: [number, number, number];
  label?: string;
};

type Sticker = {face: Face; colour: Face};
type Cubie = {position: GridPosition; stickers: Sticker[]; piece: string; target: string};

const faces: Face[] = ["U", "L", "F", "R", "B", "D"];
const faceletPosition = (
  size: number,
  face: Face,
  row: number,
  column: number,
): GridPosition => {
  const last = size - 1;
  switch (face) {
    case "U": return [column, last, row];
    case "D": return [column, 0, last - row];
    case "F": return [column, last - row, last];
    case "B": return [last - column, last - row, 0];
    case "R": return [last, last - row, last - column];
    case "L": return [0, last - row, column];
  }
};

const pieceKey = (colours: Face[]): string => [...colours].sort().join("");
const positionKey = ([x, y, z]: GridPosition): string => `${x},${y},${z}`;

const centreColours = (state: CubeState): Record<Face, Face> => {
  const centre = Math.floor(state.size / 2);
  const index = centre * state.size + centre;
  return Object.fromEntries(faces.map((face, storageIndex) => [
    face,
    state.facelets[storageIndex][index] as Face,
  ])) as Record<Face, Face>;
};

export const cubies = (state: CubeState): Cubie[] => {
  const centres = centreColours(state);
  const byPosition = new Map<string, {position: GridPosition; stickers: Sticker[]}>();
  faces.forEach((face, storageIndex) => {
    state.facelets[storageIndex].forEach((colour, index) => {
      const position = faceletPosition(
        state.size,
        face,
        Math.floor(index / state.size),
        index % state.size,
      );
      const key = positionKey(position);
      const entry = byPosition.get(key) ?? {position, stickers: []};
      entry.stickers.push({face, colour: colour as Face});
      byPosition.set(key, entry);
    });
  });
  return [...byPosition.values()]
    .filter(({stickers}) => stickers.length === 2 || stickers.length === 3)
    .map(({position, stickers}) => ({
      position,
      stickers,
      piece: pieceKey(stickers.map(({colour}) => colour)),
      target: pieceKey(stickers.map(({face}) => centres[face])),
    }));
};

const geometryPosition = (size: number, position: GridPosition): [number, number, number] => {
  const cell = 3 / size;
  const offset = (size - 1) / 2;
  return position.map((value) => (value - offset) * cell) as [number, number, number];
};

const contains = (piece: string, colour: Face): boolean => piece.includes(colour);
const candidatesForPhase = (all: Cubie[], phaseNumber: number): Cubie[] => all.filter((cubie) => {
  const corner = cubie.stickers.length === 3;
  switch (phaseNumber) {
    case 1: return !corner && contains(cubie.piece, "U");
    case 2: return corner && contains(cubie.piece, "U");
    case 3: return !corner && !contains(cubie.piece, "U") && !contains(cubie.piece, "D");
    case 4:
    case 7:
      return !corner && contains(cubie.piece, "D");
    case 5:
    case 6:
      return corner && contains(cubie.piece, "D");
    default:
      return false;
  }
});

const exactScore = (cubie: Cubie, target: Cubie, centres: Record<Face, Face>): number => {
  if (positionKey(cubie.position) !== positionKey(target.position)) return 0;
  return cubie.stickers.every(({face, colour}) => centres[face] === colour) ? 1 : 0;
};

const orientationScore = (cubie: Cubie, centres: Record<Face, Face>): number =>
  cubie.stickers.some(({face, colour}) => colour === "D" && centres[face] === "D") ? 1 : 0;

const distance = (left: GridPosition, right: GridPosition): number =>
  Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);

const phaseScore = (
  cubie: Cubie,
  target: Cubie,
  centres: Record<Face, Face>,
  phaseNumber: number,
): number => {
  if (phaseNumber === 4 || phaseNumber === 5) return orientationScore(cubie, centres) * 100;
  return exactScore(cubie, target, centres) * 100 - distance(cubie.position, target.position);
};

export const selectTutorialPiece = (
  before: CubeState,
  after: CubeState,
  phaseNumber: number,
): string | null => {
  if (before.size !== 3 || after.size !== 3) return null;
  const beforeCubies = cubies(before);
  const afterCubies = cubies(after);
  const beforeCentres = centreColours(before);
  const afterCentres = centreColours(after);
  const candidates = candidatesForPhase(beforeCubies, phaseNumber);
  const ranked = candidates.flatMap((current) => {
    const next = afterCubies.find(({piece}) => piece === current.piece);
    const beforeTarget = beforeCubies.find(({target}) => target === current.piece);
    const afterTarget = afterCubies.find(({target}) => target === current.piece);
    if (!next || !beforeTarget || !afterTarget) return [];
    const beforeScore = phaseScore(current, beforeTarget, beforeCentres, phaseNumber);
    const afterScore = phaseScore(next, afterTarget, afterCentres, phaseNumber);
    const changed = current.stickers.some(({face, colour}) =>
      !next.stickers.some((sticker) => sticker.face === face && sticker.colour === colour)
    );
    return [{piece: current.piece, improvement: afterScore - beforeScore, changed, beforeScore}];
  }).filter(({changed, beforeScore}) => changed && beforeScore < 100);
  ranked.sort((left, right) =>
    right.improvement - left.improvement || left.piece.localeCompare(right.piece)
  );
  return ranked[0]?.piece ?? null;
};

export const selectPhasePiece = (state: CubeState, phaseNumber: number): string | null => {
  if (state.size !== 3) return null;
  const all = cubies(state);
  const centres = centreColours(state);
  const ranked = candidatesForPhase(all, phaseNumber).flatMap((current) => {
    const target = all.find((cubie) => cubie.target === current.piece);
    if (!target) return [];
    return [{piece: current.piece, score: phaseScore(current, target, centres, phaseNumber)}];
  }).sort((left, right) => left.score - right.score || left.piece.localeCompare(right.piece));
  return ranked.find(({score}) => score < 100)?.piece ?? ranked[0]?.piece ?? null;
};

export const phaseMilestonePositions = (
  state: CubeState,
  phaseNumber: number,
): Array<[number, number, number]> => {
  if (state.size !== 3) return [];
  return cubies(state).filter((cubie) => {
    const corner = cubie.stickers.length === 3;
    const white = contains(cubie.piece, "U");
    const yellow = contains(cubie.piece, "D");
    switch (phaseNumber) {
      case 1: return !corner && white;
      case 2: return white;
      case 3: return white || (!corner && !yellow);
      case 4: return !corner && yellow;
      case 5: return yellow;
      case 6: return corner && yellow;
      case 7: return true;
      default: return false;
    }
  }).map(({position}) => geometryPosition(state.size, position));
};

export const focusForPiece = (state: CubeState, piece: string): CubieFocus | null => {
  const all = cubies(state);
  const source = all.find((cubie) => cubie.piece === piece);
  const target = all.find((cubie) => cubie.target === piece);
  if (!source || !target) return null;
  return {
    piece,
    source: geometryPosition(state.size, source.position),
    target: geometryPosition(state.size, target.position),
  };
};
