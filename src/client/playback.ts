import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";
import type {CubeState, MoveStep} from "./cube-gl";
import type {LowercaseMode, NotationDialect} from "./store";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};
type ParseError = {message: string};
type ExpansionError = {TAG: "InvalidState"; _0: string} | {TAG: "ExpansionLimitExceeded"; _0: number};
type ExpandedEntry = {
  step?: MoveStep;
  pause: boolean;
  durationMs?: number;
  comment?: string;
  groupId?: number;
};
export type TimelineEntry = {step?: MoveStep; durationMs?: number; groupId?: number};

export const MAX_PLAYBACK_STEPS = 500;

export type AlgorithmTimeline = {
  alg: unknown[];
  finalState: CubeState;
  steps: TimelineEntry[];
  labels: string[];
  states: CubeState[] | null;
};

const normalizedTurns = (turns: number): number => ((turns % 4) + 4) % 4;

export const formatStep = (step: MoveStep): string => {
  let family: string;
  if (step.move.TAG === "FaceTurn") {
    const {from_, to_} = step.move._1;
    family = from_ === 1 && to_ === 1
      ? step.move._0
      : from_ === 1 && to_ === 2
        ? `${step.move._0}w`
        : from_ === 1
          ? `${to_}${step.move._0}w`
          : from_ === to_
            ? `${from_}${step.move._0}`
            : `${from_}-${to_}${step.move._0}w`;
  } else if (step.move.TAG === "Rotation") {
    family = step.move._0.toLowerCase();
  } else {
    family = step.move._0;
  }
  const turns = normalizedTurns(step.turns);
  return `${family}${turns === 2 ? "2" : turns === 3 ? "'" : ""}`;
};

export const stepSignature = (entry: TimelineEntry): string => JSON.stringify(entry);

export const isSingleStepExtension = (
  previous: AlgorithmTimeline | null,
  next: AlgorithmTimeline,
): boolean => previous !== null
  && previous.states !== null
  && next.states !== null
  && next.steps.length === previous.steps.length + 1
  && next.steps.at(-1)?.step !== undefined
  && previous.steps.every((step, index) => stepSignature(step) === stepSignature(next.steps[index]));

export const buildTimeline = (
  initialState: CubeState,
  alg: unknown[],
): Result<AlgorithmTimeline, string> => {
  const expanded = MoveExecutor.expandTimeline(alg) as Result<ExpandedEntry[], ExpansionError>;
  if (expanded.TAG === "Error") {
    return expanded._0.TAG === "ExpansionLimitExceeded"
      ? {TAG: "Error", _0: `Expanded algorithms may not exceed ${expanded._0._0} moves.`}
      : {TAG: "Error", _0: expanded._0._0};
  }
  const playbackEntries = expanded._0.filter((entry) => entry.comment === undefined);
  let state = initialState;
  const states = playbackEntries.length <= MAX_PLAYBACK_STEPS ? [state] : null;
  for (const entry of playbackEntries) {
    if (entry.step) state = MoveExecutor.applyStep(state, entry.step) as CubeState;
    states?.push(state);
  }
  return {
    TAG: "Ok",
    _0: {
      alg,
      finalState: state,
      steps: playbackEntries,
      labels: playbackEntries.map((entry) =>
        entry.step
          ? formatStep(entry.step)
          : "│"
      ),
      states,
    },
  };
};

export const evaluateAlgorithm = (
  size: number,
  lowercaseMode: LowercaseMode,
  notationDialect: NotationDialect,
  input: string,
): Result<AlgorithmTimeline, string> => {
  const parsed = MoveParser.parseWithOptions(size, lowercaseMode, notationDialect, input) as Result<
    unknown[],
    ParseError
  >;
  if (parsed.TAG === "Error") return {TAG: "Error", _0: parsed._0.message};

  const solved = StateTypes.solved(size) as Result<CubeState, unknown>;
  if (solved.TAG === "Error") return {TAG: "Error", _0: "Cube size must be between 2 and 5."};
  return buildTimeline(solved._0, parsed._0);
};
