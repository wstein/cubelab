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
export type TutorialGroupContext = {
  number: number;
  title: string;
  instruction: string;
  method?: "beginner" | "advancedLbl" | "beginnerCfop" | "fullCfop" | "advancedCfop";
  start?: number;
  sequences?: string[];
};
export type TimelineClickPlan = {
  jumpTo: number | null;
  targets: number[];
  speedMultiplier: number;
};
export type TimelineSequence = {start: number; end: number; moveIndices: number[]};
export type PhysicalMoveProgress = {current: number; total: number};
export type HoverPreviewTransition = {
  target: number;
  speedMultiplier: number;
  physicalMovesRemaining: number;
};

export type PlaybackDirection = -1 | 0 | 1;

/** Hover previews must never interrupt an active forward or reverse transport. */
export const timelineHoverEnabled = (direction: PlaybackDirection): boolean => direction === 0;

export const MAX_PLAYBACK_STEPS = 500;

const directedTargets = (from: number, to: number): number[] => {
  const direction = Math.sign(to - from);
  return Array.from({length: Math.abs(to - from)}, (_, index) =>
    from + direction * (index + 1)
  );
};

export const planTimelineClick = (
  steps: TimelineEntry[],
  current: number,
  requested: number,
): TimelineClickPlan => {
  const target = Math.max(0, Math.min(requested, steps.length));
  if (target === current) return {jumpTo: null, targets: [], speedMultiplier: 1};
  if (Math.abs(target - current) === 1) {
    return {jumpTo: null, targets: [target], speedMultiplier: 1};
  }

  const traversed = steps.slice(Math.min(current, target), Math.max(current, target));
  const groupId = traversed[0]?.groupId;
  const staysInSequence = groupId !== undefined
    && traversed.every((entry) => entry.groupId === groupId);
  if (staysInSequence) {
    return {
      jumpTo: null,
      targets: directedTargets(current, target),
      speedMultiplier: 2,
    };
  }

  return {
    jumpTo: Math.max(0, target - 1),
    targets: [target],
    speedMultiplier: 1,
  };
};

const sequenceAtMove = (steps: TimelineEntry[], moveIndex: number): TimelineSequence => {
  const groupId = steps[moveIndex]?.groupId;
  if (groupId === undefined) {
    return {start: moveIndex, end: moveIndex + 1, moveIndices: [moveIndex]};
  }
  let start = moveIndex;
  let end = moveIndex + 1;
  while (start > 0 && steps[start - 1]?.groupId === groupId) start -= 1;
  while (end < steps.length && steps[end]?.groupId === groupId) end += 1;
  const moveIndices = Array.from({length: end - start}, (_, index) => start + index)
    .filter((index) => steps[index]?.step !== undefined);
  return {start, end, moveIndices};
};

export const planSequenceStep = (
  steps: TimelineEntry[],
  current: number,
  direction: -1 | 1,
): TimelineSequence | null => {
  let moveIndex = direction > 0 ? Math.max(0, current) : Math.min(steps.length, current) - 1;
  while (moveIndex >= 0 && moveIndex < steps.length && !steps[moveIndex]?.step) {
    moveIndex += direction;
  }
  if (moveIndex < 0 || moveIndex >= steps.length) return null;
  const sequence = sequenceAtMove(steps, moveIndex);
  return {
    ...sequence,
    moveIndices: direction > 0
      ? sequence.moveIndices.filter((index) => index >= moveIndex)
      : sequence.moveIndices.filter((index) => index <= moveIndex).reverse(),
  };
};

export const nextSequence = (
  steps: TimelineEntry[],
  current: number,
): TimelineSequence | null => planSequenceStep(steps, current, 1);

const isPhysicalMove = (entry: TimelineEntry): boolean =>
  entry.step !== undefined && entry.step.move.TAG !== "Rotation";

export const planHoverPreview = (
  steps: TimelineEntry[],
  current: number,
  requested: number,
): HoverPreviewTransition[] => {
  const from = Math.max(0, Math.min(current, steps.length));
  const target = Math.max(0, Math.min(requested, steps.length));
  return directedTargets(from, target).map((next) => {
    const direction = Math.sign(target - from);
    const stepIndex = direction > 0 ? next - 1 : next;
    const remainingEntries = direction > 0
      ? steps.slice(stepIndex, target)
      : steps.slice(target, stepIndex + 1);
    const physicalMovesRemaining = remainingEntries.filter(isPhysicalMove).length;
    const speedMultiplier = physicalMovesRemaining > 3
      ? 10
      : physicalMovesRemaining === 3
        ? 6
        : physicalMovesRemaining === 2
          ? 4
          : 2;
    return {target: next, speedMultiplier, physicalMovesRemaining};
  });
};

export const physicalMoveProgress = (
  steps: TimelineEntry[],
  timelineIndex: number,
): PhysicalMoveProgress => {
  const bounded = Math.max(0, Math.min(timelineIndex, steps.length));
  return {
    current: steps.slice(0, bounded).filter(isPhysicalMove).length,
    total: steps.filter(isPhysicalMove).length,
  };
};

export const describeTimelineGroup = (
  entries: TimelineEntry[],
  phase?: TutorialGroupContext,
): string => {
  const moves = entries.flatMap((entry) => entry.step ? [entry.step] : []);
  const onlyRotations = moves.length > 0 && moves.every((step) => step.move.TAG === "Rotation");
  if (
    phase?.method === "beginnerCfop"
    || phase?.method === "fullCfop"
    || phase?.method === "advancedCfop"
  ) {
    const look = phase.method === "beginnerCfop" ? "two-look" : "one-look";
    if (onlyRotations) {
      return phase.number === 1
        ? "Regrip so the white cross is built on the bottom."
        : "Reorient the whole cube while preserving the CFOP frame.";
    }
    const singleTopTurn = moves.length === 1
      && moves[0].move.TAG === "FaceTurn"
      && moves[0].move._0 === "U";
    if (singleTopTurn) {
      if (phase.number === 2) return "Align the next F2L piece above its target slot.";
      if (phase.number === 3) return `AUF-align the recognized ${look} OLL case.`;
      if (phase.number === 4) return `AUF-align the recognized ${look} PLL case.`;
    }
    switch (phase.number) {
      case 1: return "Solve the next white cross edge on the bottom and align its side colour.";
      case 2: return "Advance the F2L foundation while preserving completed slots.";
      case 3: return `Apply the recognized ${look} OLL case to orient the last layer.`;
      case 4: return `Apply the recognized ${look} PLL case to permute the last layer.`;
    }
  }
  if (onlyRotations) {
    if (phase?.number === 1) return "Restore a consistent white-up starting orientation.";
    if (phase?.number === 3) return "Turn the whole cube so yellow faces up for the remaining layers.";
    if (phase?.number === 7) return "Restore the canonical white-up cube orientation.";
    return "Reorient the whole cube for the next algorithm.";
  }

  const singleTopTurn = moves.length === 1
    && moves[0].move.TAG === "FaceTurn"
    && moves[0].move._0 === "U";
  if (singleTopTurn) {
    switch (phase?.number) {
      case 3:
        return "Align the next middle-layer edge above its target slot.";
      case 4:
        return "Align the yellow-edge case before forming the yellow cross.";
      case 5:
        return "Align the yellow-corner orientation case.";
      case 6:
        return "Align the yellow-corner permutation case.";
      case 7:
        return "Align the final yellow-edge permutation case.";
    }
  }

  switch (phase?.number) {
    case 1:
      return "Solve the next white cross edge and align it with its side centre.";
    case 2:
      return "Insert the next white first-layer corner while preserving the cross.";
    case 3:
      return "Insert a middle-layer edge with a beginner left or right insertion.";
    case 4:
      return "Apply the yellow-cross algorithm to orient the top edges.";
    case 5:
      return "Apply Sune or anti-Sune to orient the yellow corners.";
    case 6:
      return "Position the yellow corners over their matching side colours.";
    case 7:
      return "Cycle the remaining yellow edges to solve the cube.";
    default:
      return phase
        ? `${phase.title}: ${phase.instruction}`
        : "Execute this parenthesized algorithm as one sequence.";
  }
};

export const tutorialSequenceDescription = (
  steps: TimelineEntry[],
  groupIndex: number,
  phase?: TutorialGroupContext,
): string | null => {
  if (phase?.start === undefined || !phase.sequences?.length) return null;
  const groupId = steps[groupIndex]?.groupId;
  if (groupId === undefined) return null;
  const groupIds = [...new Set(
    steps
      .slice(phase.start, groupIndex + 1)
      .flatMap((entry) => entry.groupId === undefined ? [] : [entry.groupId]),
  )];
  const sequenceIndex = groupIds.indexOf(groupId);
  return sequenceIndex < 0 ? null : phase.sequences[sequenceIndex] ?? null;
};

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
          : ""
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
