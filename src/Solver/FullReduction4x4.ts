import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveTransform from "../Move/MoveTransform.res.mjs";
import * as TwoPhaseSolver from "./TwoPhaseSolver.res.mjs";
import {
  inspectReduction4x4,
  isMonochromeSolved4x4,
  planNextCentreBlock4x4,
  planNextWingPair4x4,
  planOLLParityRepair4x4,
  planPLLParityRepair4x4,
  reduce4x4,
} from "./Reduction4x4";

type ReScriptResult<T> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: unknown};

export type FullReduction4x4Solution = {
  alg: unknown[];
  algorithm: string;
  stm: number;
  obtm: number;
  centreSteps: number;
  wingSteps: number;
};

export type FullReduction4x4Error = {message: string; stage: "centres" | "wings" | "parity" | "finish"};

const errorMessage = (error: unknown, fallback: string): string =>
  typeof error === "object" && error !== null && typeof (error as {message?: unknown}).message === "string"
    ? (error as {message: string}).message
    : fallback;

const apply = (state: unknown, alg: unknown[]): ReScriptResult<unknown> =>
  MoveExecutor.applyAlg(state, alg) as ReScriptResult<unknown>;

/**
 * Canonicalize the joined centre, wing, parity, and 3×3 segments before a
 * solution crosses the worker boundary. This removes exact cancellations and
 * same-axis combinations introduced where independently planned segments meet.
 */
export const normalizeFullReductionAlgorithm = (alg: unknown[]): ReScriptResult<unknown[]> =>
  MoveTransform.simplify(alg) as ReScriptResult<unknown[]>;

export type Reduction4x4MoveMetrics = {stm: number; obtm: number};

/**
 * Slice Turn Metric prices every non-rotation turn at one. Outer Block Turn
 * Metric prices an outer block at one and an isolated inner slice at two.
 * These are the only metrics reported for a 4×4 solution; HTM is a 3×3 term.
 */
export const measureReduction4x4Moves = (alg: unknown[]): Reduction4x4MoveMetrics | null => {
  const expanded = MoveExecutor.expand(alg) as ReScriptResult<Array<{move?: {TAG?: string}}>>;
  if (expanded.TAG === "Error") return null;
  return expanded._0.reduce<Reduction4x4MoveMetrics>((metrics, step) => {
    const move = step.move as {TAG?: string; _1?: {from_?: number}} | undefined;
    if (move?.TAG === "Rotation") return metrics;
    metrics.stm += 1;
    metrics.obtm += move?.TAG === "FaceTurn" && move._1?.from_ === 1 ? 1 : 2;
    return metrics;
  }, {stm: 0, obtm: 0});
};

/**
 * Bounded, original reduction orchestrator. It composes CubeLab's verified
 * centre and wing planners and only returns a solution after the existing
 * 3x3 finish has replayed to a monochrome 4x4. It deliberately makes no
 * completeness or near-optimality claim: a failed local reduction is an
 * explicit result, never a partial algorithm presented as a solve.
 */
export const solveFullReduction4x4 = (input: unknown): ReScriptResult<FullReduction4x4Solution | FullReduction4x4Error> => {
  let state = input;
  const alg: unknown[] = [];
  let centreSteps = 0;
  let wingSteps = 0;

  for (; centreSteps < 24; centreSteps += 1) {
    const inspection = inspectReduction4x4(state);
    if (inspection.TAG === "Error") return {TAG: "Error", _0: {stage: "centres", message: errorMessage(inspection._0, "Invalid 4×4 state.")}};
    if (inspection._0.centreBlocksComplete === 6 && inspection._0.centreFrameValid) break;
    const next = planNextCentreBlock4x4(state);
    if (next.TAG === "Error") return {TAG: "Error", _0: {stage: "centres", message: errorMessage(next._0, "The centre search reached its bound.")}};
    const replay = apply(state, next._0.alg);
    if (replay.TAG === "Error") return {TAG: "Error", _0: {stage: "centres", message: "A centre candidate could not be replayed."}};
    state = replay._0;
    alg.push(...next._0.alg);
  }

  const afterCentres = inspectReduction4x4(state);
  if (afterCentres.TAG === "Error" || afterCentres._0.centreBlocksComplete !== 6 || !afterCentres._0.centreFrameValid) {
    return {TAG: "Error", _0: {stage: "centres", message: "The bounded centre search did not complete a valid six-centre frame."}};
  }

  for (; wingSteps < 24; wingSteps += 1) {
    const inspection = inspectReduction4x4(state);
    if (inspection.TAG === "Error") return {TAG: "Error", _0: {stage: "wings", message: errorMessage(inspection._0, "Invalid 4×4 state.")}};
    if (inspection._0.wingRowsPaired === 24) break;
    const next = planNextWingPair4x4(state);
    if (next.TAG === "Error") return {TAG: "Error", _0: {stage: "wings", message: errorMessage(next._0, "The wing search reached its bound.")}};
    const replay = apply(state, next._0.alg);
    if (replay.TAG === "Error") return {TAG: "Error", _0: {stage: "wings", message: "A wing candidate could not be replayed."}};
    state = replay._0;
    alg.push(...next._0.alg);
  }

  let projected = reduce4x4(state);
  if (projected.TAG === "Error" && projected._0.message.startsWith("4×4 OLL parity detected:")) {
    const repair = planOLLParityRepair4x4(state);
    if (repair.TAG === "Error") return {TAG: "Error", _0: {stage: "parity", message: errorMessage(repair._0, "OLL parity repair failed.")}};
    const replay = apply(state, repair._0.alg);
    if (replay.TAG === "Error") return {TAG: "Error", _0: {stage: "parity", message: "OLL parity repair could not be replayed."}};
    state = replay._0;
    alg.push(...repair._0.alg);
    projected = reduce4x4(state);
  }
  if (projected.TAG === "Error" && projected._0.message.startsWith("4×4 PLL parity detected:")) {
    const repair = planPLLParityRepair4x4(state);
    if (repair.TAG === "Error") return {TAG: "Error", _0: {stage: "parity", message: errorMessage(repair._0, "PLL parity repair failed.")}};
    const replay = apply(state, repair._0.alg);
    if (replay.TAG === "Error") return {TAG: "Error", _0: {stage: "parity", message: "PLL parity repair could not be replayed."}};
    state = replay._0;
    alg.push(...repair._0.alg);
    projected = reduce4x4(state);
  }
  if (projected.TAG === "Error") return {TAG: "Error", _0: {stage: "finish", message: errorMessage(projected._0, "The cube was not reduced.")}};

  TwoPhaseSolver.prepareTables();
  const finish = TwoPhaseSolver.solve(projected._0.state) as ReScriptResult<{alg: unknown[]}>;
  if (finish.TAG === "Error") return {TAG: "Error", _0: {stage: "finish", message: "The reduced 3×3 finish failed."}};
  const normalized = normalizeFullReductionAlgorithm([...alg, ...finish._0.alg]);
  if (normalized.TAG === "Error") {
    return {TAG: "Error", _0: {stage: "finish", message: "The full solution could not be normalized."}};
  }
  const solution = normalized._0;
  const replay = apply(input, solution);
  if (replay.TAG === "Error" || !isMonochromeSolved4x4(replay._0)) {
    return {TAG: "Error", _0: {stage: "finish", message: "The proposed full reduction did not replay to a solved 4×4."}};
  }
  const metrics = measureReduction4x4Moves(solution);
  if (metrics === null) {
    return {TAG: "Error", _0: {stage: "finish", message: "The normalized solution could not be expanded."}};
  }
  return {TAG: "Ok", _0: {
    alg: solution,
    algorithm: MoveTransform.serialize(solution) as string,
    ...metrics,
    centreSteps,
    wingSteps,
  }};
};
