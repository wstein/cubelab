import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as MoveTransform from "../Move/MoveTransform.res.mjs";

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
  edge?: typeof edgeNames[number];
  colours?: [string, string];
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
export type WingPairGuide4x4 = {
  alg: unknown[];
  algorithm: string;
  before: number;
  after: number;
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
        edge: edgeNames[edgeIndex]!,
        colours: [face[pair[0]]!, face[pair[1]]!],
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

const parseGuide = (notation: string): unknown[] | null => {
  const parsed = MoveParser.parseWithOptions(4, "Wide", "Modern", notation) as ReScriptResult<unknown[]>;
  return parsed.TAG === "Ok" ? parsed._0 : null;
};

const pairingSeedNotations = [
  "2R U R' U' 2R'",
  "2R U R U' 2R'",
  "u' R U R' F R' F' R u",
];

/**
 * Finds one small, replay-verified edge-pairing improvement. This is a
 * deliberately bounded guide, not a claim to be a complete reduction search:
 * it tries conjugated slice-pair-restore seeds and returns only a move that
 * preserves all six completed centre blocks while increasing the observable
 * paired-wing score.
 */
export const planNextWingPair4x4 = (state: unknown): ReScriptResult<WingPairGuide4x4> => {
  const initial = inspectReduction4x4(state);
  if (initial.TAG === "Error") return initial;
  if (initial._0.centreBlocksComplete !== 6) {
    return {TAG: "Error", _0: {message: "Complete all six centre blocks before requesting a wing-pair guide."}};
  }
  if (initial._0.wingRowsPaired === 24) {
    return {TAG: "Error", _0: {message: "All visible wing rows are already paired."}};
  }
  const candidates: unknown[][] = [];
  pairingSeedNotations.forEach((notation) => {
    const seed = parseGuide(notation);
    if (seed === null) return;
    for (let x = 0; x < 4; x += 1) {
      for (let y = 0; y < 4; y += 1) {
        candidates.push(MoveTransform.rotate(MoveTransform.rotate(seed, "X", x), "Y", y));
      }
    }
  });
  let best: WingPairGuide4x4 | null = null;
  candidates.forEach((alg) => {
    const replay = MoveExecutor.applyAlg(state, alg) as ReScriptResult<unknown>;
    if (replay.TAG === "Error") return;
    const after = inspectReduction4x4(replay._0);
    if (after.TAG === "Error" || after._0.centreBlocksComplete !== 6) return;
    if (after._0.wingRowsPaired <= initial._0.wingRowsPaired) return;
    const guide = {
      alg,
      algorithm: MoveTransform.serialize(alg) as string,
      before: initial._0.wingRowsPaired,
      after: after._0.wingRowsPaired,
    };
    if (best === null
      || guide.after > best.after
      || (guide.after === best.after && guide.algorithm.length < best.algorithm.length)) best = guide;
  });
  return best === null
    ? {TAG: "Error", _0: {message: "No centre-preserving pairing guide was found in the bounded seed set. Use the displayed manual setup steps, then request another guide."}}
    : {TAG: "Ok", _0: best};
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
