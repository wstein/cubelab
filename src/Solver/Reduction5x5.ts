import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as MoveTransform from "../Move/MoveTransform.res.mjs";

type Result<T> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: {message: string}};
const faces = ["U", "R", "F", "D", "L", "B"] as const;
const xCentres = [6, 8, 16, 18] as const;
const plusCentres = [7, 11, 13, 17] as const;
const centres = [...xCentres, ...plusCentres];
const wingPairs = [[1, 3], [9, 19], [21, 23], [5, 15]] as const;

export type Reduction5x5Inspection = {
  xCentresComplete: number;
  plusCentresComplete: number;
  centreFacesComplete: number;
  wingPairsMatched: number;
  stage: "centres" | "wings" | "handoff";
  nextGoal: string;
};
export type CentreGuide5x5 = {alg: unknown[]; algorithm: string; before: number; after: number};

const compact = (state: unknown): string | null => {
  if ((state as {size?: unknown}).size !== 5) return null;
  const value = FaceletCodec.render(state);
  return typeof value === "string" && value.length === 150 ? value : null;
};

const faceAt = (value: string, index: number): string => value.slice(index * 25, index * 25 + 25);
const centreScore = (face: string, indices: readonly number[], core: string): number => indices.filter((index) => face[index] === core).length;
const progress = (state: unknown): {x: number; plus: number; faces: number; wings: number; score: number} | null => {
  const value = compact(state);
  if (value === null) return null;
  let x = 0; let plus = 0; let complete = 0; let wings = 0; let score = 0;
  for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
    const face = faceAt(value, faceIndex); const core = face[12]!;
    const xScore = centreScore(face, xCentres, core); const plusScore = centreScore(face, plusCentres, core);
    x += xScore === 4 ? 1 : 0; plus += plusScore === 4 ? 1 : 0;
    complete += xScore + plusScore === 8 ? 1 : 0; score += xScore + plusScore;
    wingPairs.forEach(([left, right]) => { wings += face[left] === face[right] ? 1 : 0; });
  }
  return {x, plus, faces: complete, wings, score};
};

export const inspectReduction5x5 = (state: unknown): Result<Reduction5x5Inspection> => {
  const value = progress(state);
  if (value === null) return {TAG: "Error", _0: {message: "The 5×5 Academy requires a complete 5×5 state."}};
  const stage = value.faces < 6 ? "centres" : value.wings < 24 ? "wings" : "handoff";
  return {TAG: "Ok", _0: {
    xCentresComplete: value.x, plusCentresComplete: value.plus, centreFacesComplete: value.faces, wingPairsMatched: value.wings, stage,
    nextGoal: stage === "centres"
      ? `Build the 3×3 centres around their fixed cores (${value.faces}/6 complete).`
      : stage === "wings"
        ? `Pair both wings around each fixed middle edge (${value.wings}/24 matched).`
        : "Centre and wing milestones are complete. A 5×5 reduced-state finisher is the next Academy increment.",
  }};
};

const parse = (notation: string): unknown[] | null => {
  const parsed = MoveParser.parseWithOptions(5, "Wide", "Modern", notation) as Result<unknown[]>;
  return parsed.TAG === "Ok" ? parsed._0 : null;
};
const centreMoves = faces.flatMap((face) => [`2${face}`, `2${face}'`, `2${face}2`]);

/** A deliberately bounded, replay-verified next-centre hint, never a claimed full 5×5 solver. */
export const planNextCentre5x5 = (state: unknown): Result<CentreGuide5x5> => {
  const initial = progress(state);
  if (initial === null) return {TAG: "Error", _0: {message: "The 5×5 centre guide requires a complete state."}};
  if (initial.faces === 6) return {TAG: "Error", _0: {message: "All six 3×3 centre faces are complete."}};
  let best: CentreGuide5x5 | null = null;
  centreMoves.forEach((notation) => {
    const alg = parse(notation); if (alg === null) return;
    const replay = MoveExecutor.applyAlg(state, alg) as Result<unknown>;
    const after = replay.TAG === "Ok" ? progress(replay._0) : null;
    if (after === null || after.score <= initial.score) return;
    const guide = {alg, algorithm: MoveTransform.serialize(alg) as string, before: initial.score, after: after.score};
    if (best === null || guide.after > best.after) best = guide;
  });
  return best === null
    ? {TAG: "Error", _0: {message: "No one-turn centre improvement is available. Make a bar setup, then request the next guide."}}
    : {TAG: "Ok", _0: best};
};
