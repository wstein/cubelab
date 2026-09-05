import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";

type ReScriptResult<T> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: unknown};

const faces = ["U", "R", "F", "D", "L", "B"] as const;
const centreIndices = [5, 6, 9, 10];
const edgePairs = [
  [1, 2], // top
  [7, 11], // right
  [13, 14], // bottom
  [4, 8], // left
] as const;
const edgeNames = ["top", "right", "bottom", "left"] as const;
const reducedFacelets = [0, 1, 3, 4, 5, 7, 12, 13, 15] as const;

export type Reduced4x4 = {state: unknown; compact: string};
export type Reduction4x4Error = {message: string};
export type Reduction4x4Milestone = {
  face: typeof faces[number];
  complete: boolean;
};
export type Reduction4x4Inspection = {
  centres: Reduction4x4Milestone[];
  wingRows: Reduction4x4Milestone[];
  centreBlocksComplete: number;
  wingRowsPaired: number;
  stage: "centres" | "wings" | "reduced";
  nextGoal: string;
};

const compactFacelets = (state: unknown): string | null => {
  if ((state as {size?: unknown}).size !== 4) return null;
  const compact = FaceletCodec.render(state);
  return typeof compact === "string" && compact.length === 96 ? compact : null;
};

/**
 * Reports reduction facts without pretending that a partly reduced 4×4 has
 * become a legal 3×3. The planned search and Academy both consume these same
 * milestones: centre blocks first, then the 24 visible wing rows, then the
 * strict `reduce4x4` handoff below.
 */
export const inspectReduction4x4 = (state: unknown): ReScriptResult<Reduction4x4Inspection> => {
  const compact = compactFacelets(state);
  if (compact === null) return {TAG: "Error", _0: {message: "The reduction solver supports only complete 4×4 states."}};

  const centres: Reduction4x4Milestone[] = [];
  const wingRows: Reduction4x4Milestone[] = [];
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const face = compact.slice(faceIndex * 16, (faceIndex + 1) * 16);
    const centre = centreIndices.map((index) => face[index]!);
    centres.push({face: faces[faceIndex]!, complete: centre.every((colour) => colour === centre[0])});
    for (let edgeIndex = 0; edgeIndex < edgePairs.length; edgeIndex += 1) {
      const pair = edgePairs[edgeIndex]!;
      wingRows.push({
        face: faces[faceIndex]!,
        complete: face[pair[0]] === face[pair[1]],
      });
    }
  }
  const centreBlocksComplete = centres.filter(({complete}) => complete).length;
  const wingRowsPaired = wingRows.filter(({complete}) => complete).length;
  const stage = centreBlocksComplete < faces.length
    ? "centres"
    : wingRowsPaired < wingRows.length
    ? "wings"
    : "reduced";
  const nextGoal = stage === "centres"
    ? `Build centre blocks (${centreBlocksComplete}/6 complete).`
    : stage === "wings"
    ? `Pair wing rows (${wingRowsPaired}/24 matched).`
    : "Reduction complete — ready for the 3×3 finish.";
  return {TAG: "Ok", _0: {centres, wingRows, centreBlocksComplete, wingRowsPaired, stage, nextGoal}};
};

/**
 * Converts a genuinely reduced 4×4 into its 3×3 representation.
 *
 * A reduction-stage solver may only hand off after each 2×2 centre block is
 * monochrome and the two wing stickers occupying each visible edge agree.
 * Keeping this gate separate prevents a 3×3 algorithm from being presented
 * as a solution for a 4×4 whose centres or wings it cannot possibly repair.
 */
export const reduce4x4 = (state: unknown): ReScriptResult<Reduced4x4> => {
  const compact = compactFacelets(state);
  if (compact === null) return {TAG: "Error", _0: {message: "The reduction solver supports only complete 4×4 states."}};

  const inspection = inspectReduction4x4(state);
  if (inspection.TAG === "Error") return {TAG: "Error", _0: inspection._0};
  if (inspection._0.stage !== "reduced") {
    return {TAG: "Error", _0: {message: inspection._0.nextGoal}};
  }

  const reduced: string[] = [];
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const face = compact.slice(faceIndex * 16, (faceIndex + 1) * 16);
    const centres = centreIndices.map((index) => face[index]!);
    if (!centres.every((colour) => colour === centres[0])) {
      return {TAG: "Error", _0: {message: `${faces[faceIndex]} centres are not reduced yet.`}};
    }
    for (let edgeIndex = 0; edgeIndex < edgePairs.length; edgeIndex += 1) {
      const pair = edgePairs[edgeIndex]!;
      if (face[pair[0]] !== face[pair[1]]) {
        return {TAG: "Error", _0: {message: `${faces[faceIndex]} ${edgeNames[edgeIndex]} wings are not paired yet.`}};
      }
    }
    reduced.push(...reducedFacelets.map((index) => face[index]!));
  }
  const reducedCompact = reduced.join("");
  const parsed = FaceletCodec.parse(3, reducedCompact) as ReScriptResult<unknown>;
  if (parsed.TAG === "Error") {
    return {TAG: "Error", _0: {message: "The reduced 3×3 facelets do not have one of each colour."}};
  }
  const pieces = PieceReducer.reduce(parsed._0) as ReScriptResult<unknown>;
  if (pieces.TAG === "Error") {
    return {TAG: "Error", _0: {message: `The reduced 3×3 state is not physically reachable: ${PieceReducer.describeError(pieces._0)}.`}};
  }
  return {TAG: "Ok", _0: {state: parsed._0, compact: reducedCompact}};
};

/** A 4×4 is solved in its current orientation when every visible face is monochrome. */
export const isMonochromeSolved4x4 = (state: unknown): boolean => {
  const compact = compactFacelets(state);
  return compact !== null && faces.every((_, faceIndex) => {
    const face = compact.slice(faceIndex * 16, (faceIndex + 1) * 16);
    return [...face].every((colour) => colour === face[0]);
  });
};
