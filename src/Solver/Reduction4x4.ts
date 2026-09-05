import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";
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
export type OLLParityRepair4x4 = {alg: unknown[]; algorithm: string};
export type CentreGuide4x4 = {
  alg: unknown[];
  algorithm: string;
  beforeBlocks: number;
  afterBlocks: number;
  beforeScore: number;
  afterScore: number;
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

const edgeFlipSlots = (error: unknown): number[] | null => {
  if (typeof error !== "object" || error === null) return null;
  const outer = error as {TAG?: unknown; _0?: unknown};
  if (outer.TAG !== "SolvabilityViolation" || typeof outer._0 !== "object" || outer._0 === null) return null;
  const violation = outer._0 as {TAG?: unknown; affectedSlots?: unknown};
  return violation.TAG === "EdgeFlip" && Array.isArray(violation.affectedSlots)
    ? violation.affectedSlots.filter((slot): slot is number => typeof slot === "number")
    : null;
};

const pairingSeedNotations = [
  "2R U R' U' 2R'",
  "2R U R U' 2R'",
  "u' R U R' F R' F' R u",
];

// This standard 4×4 OLL-parity repair toggles reduced edge-orientation parity
// while retaining paired wings and completed 2×2 centres.
const ollParityNotation = "r U2 x r U2 r U2 r' U2 l U2 r' U2 r U2 r' U2 r'";

// Outer turns preserve every 2×2 centre block.  Conjugating a pairing seed by
// one gives the guide a small, deterministic way to bring an unpaired wing
// into its working slots and then put the surrounding reduction back exactly.
// This is deliberately finite: it is a responsive Academy hint, not a hidden
// exhaustive 4×4 solver.
const outerSetupNotations = [
  "",
  "U", "U'", "U2",
  "R", "R'", "R2",
  "F", "F'", "F2",
  "D", "D'", "D2",
  "L", "L'", "L2",
  "B", "B'", "B2",
];

// A second setup turn is only tried when the single-turn search has no
// verified improvement. With the seed viewed in every cube frame, U/R/F are a
// sufficient compact basis for that fallback and keep the hint responsive.
const secondSetupNotations = ["", "U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2"];

const centreMoveNotations = faces.flatMap((face) => [
  face, `${face}'`, `${face}2`,
  `2${face}`, `2${face}'`, `2${face}2`,
]);

const centreValues = (state: unknown): string | null => {
  const compact = compactFacelets(state);
  if (compact === null) return null;
  return faces.flatMap((_, faceIndex) => centreIndices.map((index) => compact[faceIndex * 16 + index]!)).join("");
};

const centreProgressFor = (values: string): {blocks: number; score: number} => {
  let blocks = 0;
  let score = 0;
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const centre = [...values.slice(faceIndex * 4, faceIndex * 4 + 4)];
    const largestGroup = Math.max(...[...new Set(centre)].map((colour) => centre.filter((value) => value === colour).length));
    score += largestGroup;
    if (largestGroup === 4) blocks += 1;
  }
  return {blocks, score};
};

type CentreMove = {notation: string; alg: unknown[]; permutation: number[]};

// Centre search does not need to replay all 96 stickers for every candidate.
// Derive each move's exact 24-centre permutation once from the move executor,
// then search that compact coordinate and replay only the winning sequence.
const centreMoves: CentreMove[] = (() => {
  const locations = faces.flatMap((face) => centreIndices.map((index) => StateTypes.storageIndex(face) * 16 + index));
  const locationToSlot = new Map(locations.map((location, slot) => [location, slot]));
  const markerState = {
    size: 4,
    facelets: StateTypes.storageOrder.map((_, faceIndex) => Array.from({length: 16}, (_, index) => `${faceIndex * 16 + index}`)),
  };
  return centreMoveNotations.flatMap((notation) => {
    const alg = parseGuide(notation);
    if (alg === null) return [];
    const replay = MoveExecutor.applyAlg(markerState, alg) as ReScriptResult<{facelets: string[][]}>;
    if (replay.TAG === "Error") return [];
    const permutation = faces.flatMap((face) => centreIndices.map((index) =>
      locationToSlot.get(Number(replay._0.facelets[StateTypes.storageIndex(face)]![index]!))
    ));
    return permutation.every((slot) => slot !== undefined)
      ? [{notation, alg, permutation: permutation as number[]}]
      : [];
  });
})();

const applyCentreMove = (values: string, move: CentreMove): string =>
  move.permutation.map((source) => values[source]!).join("");

const centreSearchScore = (progress: {blocks: number; score: number}): number =>
  progress.blocks * 100 + progress.score;

/**
 * A bounded beam search for the next centre improvement. It intentionally
 * returns one short, replay-verified setup rather than claiming to automate a
 * full 4×4 solve. The Academy can therefore teach a real move on every step.
 */
export const planNextCentreBlock4x4 = (state: unknown): ReScriptResult<CentreGuide4x4> => {
  const start = centreValues(state);
  if (start === null) return {TAG: "Error", _0: {message: "The centre guide supports only complete 4×4 states."}};
  const initial = centreProgressFor(start);
  if (initial.blocks === 6) return {TAG: "Error", _0: {message: "All six centre blocks are complete."}};
  type Candidate = {values: string; alg: unknown[]; lastFace: string; score: number; blocks: number};
  let frontier: Candidate[] = [{values: start, alg: [], lastFace: "", ...initial}];
  let best: Candidate | null = null;
  for (let depth = 0; depth < 10; depth += 1) {
    const next: Candidate[] = [];
    const seen = new Set<string>();
    frontier.forEach((candidate) => {
      centreMoves.forEach((move) => {
        const face = move.notation.replace(/^2/, "")[0]!;
        if (face === candidate.lastFace) return;
        const values = applyCentreMove(candidate.values, move);
        if (seen.has(values)) return;
        seen.add(values);
        const progress = centreProgressFor(values);
        const expanded = {...candidate, values, alg: [...candidate.alg, ...move.alg], lastFace: face, ...progress};
        next.push(expanded);
        if (progress.blocks > initial.blocks || (progress.blocks === initial.blocks && progress.score > initial.score)) {
          if (best === null || progress.blocks > best.blocks || (progress.blocks === best.blocks && progress.score > best.score)) best = expanded;
        }
      });
    });
    next.sort((left, right) => centreSearchScore(right) - centreSearchScore(left) || left.alg.length - right.alg.length);
    frontier = next.slice(0, 1600);
    if (frontier.length === 0) break;
  }
  if (best === null) return {TAG: "Error", _0: {message: "No centre improvement was found in the local search. Make one centre setup move, then request the next guide."}};
  return {
    TAG: "Ok",
    _0: {
      alg: best.alg,
      algorithm: MoveTransform.serialize(best.alg) as string,
      beforeBlocks: initial.blocks,
      afterBlocks: best.blocks,
      beforeScore: initial.score,
      afterScore: best.score,
    },
  };
};

/**
 * Finds one small, replay-verified edge-pairing improvement. This is a
 * deliberately bounded guide, not a claim to be a complete reduction search:
 * it tries each slice-pair-restore seed in all viewing frames, with an optional
 * outer-turn setup and exact restore. It returns only a move that preserves all
 * six completed centre blocks while increasing the observable paired-wing
 * score.
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
  const setups = outerSetupNotations
    .map((notation) => parseGuide(notation))
    .filter((setup): setup is unknown[] => setup !== null);
  const rotatedSeeds = new Map<string, unknown[]>();
  pairingSeedNotations.forEach((notation) => {
    const seed = parseGuide(notation);
    if (seed === null) return;
    for (let x = 0; x < 4; x += 1) {
      for (let y = 0; y < 4; y += 1) {
        for (let z = 0; z < 4; z += 1) {
          const rotated = MoveTransform.rotate(MoveTransform.rotate(MoveTransform.rotate(seed, "X", x), "Y", y), "Z", z);
          rotatedSeeds.set(MoveTransform.serialize(rotated) as string, rotated);
        }
      }
    }
  });
  let best: WingPairGuide4x4 | null = null;
  const evaluate = (candidateSetups: unknown[][]): void => {
    candidateSetups.forEach((setup) => {
      rotatedSeeds.forEach((seed) => {
        const alg = [...setup, ...seed, ...MoveTransform.invert(setup)];
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
    });
  };
  evaluate(setups);
  if (best === null) {
    const secondTurns = secondSetupNotations
      .map((notation) => parseGuide(notation))
      .filter((setup): setup is unknown[] => setup !== null);
    evaluate(secondTurns.flatMap((first) => secondTurns.map((second) => [...first, ...second])));
  }
  return best === null
    ? {TAG: "Error", _0: {message: "No verified pairing move was found in the local setup search. Make one manual wing setup, then request the next guide."}}
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
    const flipped = edgeFlipSlots(pieces._0);
    if (flipped !== null) {
      return {
        TAG: "Error",
        _0: {
          message: `4×4 OLL parity detected: ${flipped.length.toString()} reduced dedge orientation${flipped.length === 1 ? " is" : "s are"} flipped. Apply the OLL-parity repair before the 3×3 finish.`,
        },
      };
    }
    return {TAG: "Error", _0: {message: `The reduced 3×3 state is not physically reachable: ${PieceReducer.describeError(pieces._0)}.`}};
  }
  return {TAG: "Ok", _0: {state: parsed._0, compact: reducedCompact}};
};

/**
 * Returns the verified OLL-parity repair for a fully paired 4×4.  The repair
 * is only offered when its replay makes the projected 3×3 physically legal.
 */
export const planOLLParityRepair4x4 = (state: unknown): ReScriptResult<OLLParityRepair4x4> => {
  const projected = reduce4x4(state);
  if (projected.TAG === "Ok") return {TAG: "Error", _0: {message: "No OLL parity repair is needed."}};
  if (!projected._0.message.startsWith("4×4 OLL parity detected:")) return {TAG: "Error", _0: projected._0};
  const alg = parseGuide(ollParityNotation);
  if (alg === null) return {TAG: "Error", _0: {message: "The OLL-parity repair could not be parsed."}};
  const replay = MoveExecutor.applyAlg(state, alg) as ReScriptResult<unknown>;
  if (replay.TAG === "Error" || reduce4x4(replay._0).TAG === "Error") {
    return {TAG: "Error", _0: {message: "The OLL-parity repair did not produce a legal reduced 3×3 state."}};
  }
  return {TAG: "Ok", _0: {alg, algorithm: MoveTransform.serialize(alg) as string}};
};

/** A 4×4 is solved in its current orientation when every visible face is monochrome. */
export const isMonochromeSolved4x4 = (state: unknown): boolean => {
  const compact = compactFacelets(state);
  return compact !== null && faces.every((_, faceIndex) => {
    const face = compact.slice(faceIndex * 16, (faceIndex + 1) * 16);
    return [...face].every((colour) => colour === face[0]);
  });
};
