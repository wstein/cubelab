import type {TimelineEntry} from "../playback";

export type ExpectedSmartCubeMove = {
  timelineIndex: number;
  token: string;
};

/** Whether incoming smart-cube packets mirror hardware state or drive a virtual cube. */
export type SyncMode = "PhysicalMirror" | "VirtualController";

export type ExpectedSmartCubeAction = ExpectedSmartCubeMove & {
  kind: "rotation" | "move";
};

/** Progress through the outer-face packets that represent one logical move. */
export type SmartCubeHalfTurnProgress = {
  timelineIndex: number;
  receivedMoves: string[];
  remainingSequences: string[][];
};

export type SmartCubeMoveAssessment =
  | {status: "matched"; expected: ExpectedSmartCubeMove; completedHalfTurn: boolean}
  | {
    status: "partial";
    expected: ExpectedSmartCubeMove;
    received: string;
    progress: SmartCubeHalfTurnProgress;
  }
  | {status: "mismatch"; expected: ExpectedSmartCubeMove; received: string}
  | {status: "complete"}
  | {status: "unsupported"; expected: ExpectedSmartCubeMove; received: string};

export const canonicalSmartCubeMove = (token: string): string => {
  const match = token.trim().match(/^([URFDLB])(?:(2)|('))?$/i);
  if (!match) return token.trim();
  return `${match[1].toUpperCase()}${match[2] ? "2" : match[3] ? "'" : ""}`;
};

/**
 * Projects a hardware face packet into the viewport's discrete orientation
 * frame. Gyro samples move the camera only; this conversion keeps a physical
 * right-hand turn attached to the corresponding virtual face after regrips.
 */
export const controllerMoveInViewportFrame = (
  token: string,
  rotations: RotationStep[] = [],
): string => {
  const move = canonicalSmartCubeMove(token);
  const match = move.match(/^([URFDLB])(2|')?$/);
  if (!match) return move;
  let face = match[1];
  for (const rotation of rotations) {
    const turns = normalizedTurns(rotation.turns);
    for (let turn = 0; turn < turns; turn += 1) face = rotateFaceOnce(rotation.axis, face);
  }
  return `${face}${match[2] ?? ""}`;
};

export const appendRecordedMove = (source: string, move: string): string => {
  const token = canonicalSmartCubeMove(move);
  const trimmed = source.trimEnd();
  if (trimmed === "") return token;
  const lastLine = trimmed.slice(trimmed.lastIndexOf("\n") + 1);
  const afterLineComment = lastLine.includes("//") || /(^|\s)#/.test(lastLine);
  return `${trimmed}${afterLineComment ? "\n" : " "}${token}`;
};

type RotationStep = {axis: "X" | "Y" | "Z"; turns: number};
type PhysicalComponent = {face: string; turns: number};
type PhysicalMovePlan = ExpectedSmartCubeMove & {
  sequences: string[][];
  implicitRotation: RotationStep | null;
  skip: boolean;
};

const normalizedTurns = (turns: number): number => ((turns % 4) + 4) % 4;

const rotateFaceOnce = (axis: RotationStep["axis"], face: string): string => {
  if (axis === "X") {
    return ({U: "B", B: "D", D: "F", F: "U"} as Record<string, string>)[face] ?? face;
  }
  if (axis === "Y") {
    return ({R: "F", F: "L", L: "B", B: "R"} as Record<string, string>)[face] ?? face;
  }
  return ({U: "R", R: "D", D: "L", L: "U"} as Record<string, string>)[face] ?? face;
};

const physicalFaceInFixedFrame = (face: string, rotations: RotationStep[]): string => {
  let mapped = face;
  for (let index = rotations.length - 1; index >= 0; index -= 1) {
    const rotation = rotations[index];
    const inverseTurns = normalizedTurns(-rotation.turns);
    for (let turn = 0; turn < inverseTurns; turn += 1) {
      mapped = rotateFaceOnce(rotation.axis, mapped);
    }
  }
  return mapped;
};

const faceToken = (face: string, turns: number): string => {
  const normalized = normalizedTurns(turns);
  return `${face}${normalized === 2 ? "2" : normalized === 3 ? "'" : ""}`;
};

/** A half turn may be one `R2` packet or two quarter packets in either direction. */
const packetForms = (component: PhysicalComponent): string[][] => {
  const turns = normalizedTurns(component.turns);
  if (turns === 0) return [[]];
  if (turns === 2) {
    return [
      [`${component.face}2`],
      [component.face, component.face],
      [`${component.face}'`, `${component.face}'`],
    ];
  }
  return [[faceToken(component.face, turns)]];
};

const interleave = (left: string[], right: string[]): string[][] => {
  if (left.length === 0) return [[...right]];
  if (right.length === 0) return [[...left]];
  return [
    ...interleave(left.slice(1), right).map((tail) => [left[0], ...tail]),
    ...interleave(left, right.slice(1)).map((tail) => [right[0], ...tail]),
  ];
};

const uniqueSequences = (sequences: string[][]): string[][] => {
  const seen = new Set<string>();
  return sequences.filter((sequence) => {
    const key = sequence.join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const packetSequences = (components: PhysicalComponent[]): string[][] => {
  let sequences: string[][] = [[]];
  for (const component of components) {
    const forms = packetForms(component);
    sequences = sequences.flatMap((existing) =>
      forms.flatMap((form) => interleave(existing, form))
    );
  }
  return uniqueSequences(sequences);
};

const faceAxis = (face: string): RotationStep => {
  if (face === "R") return {axis: "X", turns: 1};
  if (face === "L") return {axis: "X", turns: -1};
  if (face === "U") return {axis: "Y", turns: 1};
  if (face === "D") return {axis: "Y", turns: -1};
  if (face === "F") return {axis: "Z", turns: 1};
  return {axis: "Z", turns: -1};
};

const oppositeFace = (face: string): string =>
  ({U: "D", R: "L", F: "B", D: "U", L: "R", B: "F"} as Record<string, string>)[face] ?? face;

const sliceDefinition = (slice: "M" | "E" | "S"): {
  components: PhysicalComponent[];
  rotation: RotationStep;
} => {
  if (slice === "M") {
    // M = x' R L'
    return {
      components: [{face: "R", turns: 1}, {face: "L", turns: -1}],
      rotation: {axis: "X", turns: -1},
    };
  }
  if (slice === "E") {
    // E = y' U D'
    return {
      components: [{face: "U", turns: 1}, {face: "D", turns: -1}],
      rotation: {axis: "Y", turns: -1},
    };
  }
  // S = z F' B
  return {
    components: [{face: "F", turns: -1}, {face: "B", turns: 1}],
    rotation: {axis: "Z", turns: 1},
  };
};

const physicalPlanForStep = (
  step: NonNullable<TimelineEntry["step"]>,
  rotations: RotationStep[],
  fallback: string,
  timelineIndex: number,
): PhysicalMovePlan => {
  const mapComponents = (components: PhysicalComponent[]): PhysicalComponent[] =>
    components.map((component) => ({
      face: physicalFaceInFixedFrame(component.face, rotations),
      turns: component.turns * step.turns,
    }));

  if (step.move.TAG === "SliceTurn") {
    const definition = sliceDefinition(step.move._0);
    return {
      timelineIndex,
      token: fallback,
      sequences: packetSequences(mapComponents(definition.components)),
      implicitRotation: {
        axis: definition.rotation.axis,
        turns: definition.rotation.turns * step.turns,
      },
      skip: false,
    };
  }

  if (step.move.TAG !== "FaceTurn") {
    return {timelineIndex, token: fallback, sequences: [], implicitRotation: null, skip: false};
  }

  const face = step.move._0;
  const {from_, to_} = step.move._1;
  if (from_ === 1 && to_ === 1) {
    const physicalFace = physicalFaceInFixedFrame(face, rotations);
    const token = faceToken(physicalFace, step.turns);
    return {
      timelineIndex,
      token,
      sequences: packetSequences([{face: physicalFace, turns: step.turns}]),
      implicitRotation: null,
      skip: false,
    };
  }

  const rotation = faceAxis(face);
  if (from_ === 1 && to_ === 2) {
    // Rw=x L (or R with slice), Lw=x' R (or L with slice), Uw=y D (or U), etc.
    const oppFace = physicalFaceInFixedFrame(oppositeFace(face), rotations);
    const primaryFace = physicalFaceInFixedFrame(face, rotations);
    return {
      timelineIndex,
      token: fallback,
      sequences: uniqueSequences([
        ...packetSequences([{face: oppFace, turns: step.turns}]),
        ...packetSequences([{face: primaryFace, turns: step.turns}]),
      ]),
      implicitRotation: {axis: rotation.axis, turns: rotation.turns * step.turns},
      skip: false,
    };
  }

  if (from_ === 2 && to_ === 2) {
    const definition = sliceDefinition(
      face === "R" || face === "L" ? "M" : face === "U" || face === "D" ? "E" : "S",
    );
    const direction = face === "R" || face === "U" || face === "B" ? -1 : 1;
    return {
      timelineIndex,
      token: fallback,
      sequences: packetSequences(mapComponents(definition.components.map((component) => ({
        ...component,
        turns: component.turns * direction,
      })))),
      implicitRotation: {
        axis: definition.rotation.axis,
        turns: definition.rotation.turns * direction * step.turns,
      },
      skip: false,
    };
  }

  if (from_ === 1 && to_ >= 3) {
    // A full-width turn is only a physical reorientation; no face encoder fires.
    return {
      timelineIndex,
      token: fallback,
      sequences: [],
      implicitRotation: {axis: rotation.axis, turns: rotation.turns * step.turns},
      skip: true,
    };
  }

  return {timelineIndex, token: fallback, sequences: [], implicitRotation: null, skip: false};
};

const completedRotations = (
  steps: TimelineEntry[],
  labels: string[],
  current: number,
): RotationStep[] => {
  const rotations: RotationStep[] = [];
  for (let index = 0; index < Math.min(Math.max(0, current), steps.length); index += 1) {
    const step = steps[index]?.step;
    if (!step) continue;
    if (step.move.TAG === "Rotation") {
      rotations.push({axis: step.move._0, turns: step.turns});
      continue;
    }
    const plan = physicalPlanForStep(step, rotations, labels[index] ?? "", index);
    if (plan.implicitRotation) rotations.push(plan.implicitRotation);
  }
  return rotations;
};

/** Project a logical x/y/z regrip onto the gyro's fixed physical frame. */
export const smartCubeRotationInPhysicalFrame = (
  steps: TimelineEntry[],
  labels: string[],
  current: number,
  axis: RotationStep["axis"],
  turns: number,
): RotationStep => {
  const logicalFace = axis === "X" ? "R" : axis === "Y" ? "U" : "F";
  const physicalFace = physicalFaceInFixedFrame(
    logicalFace,
    completedRotations(steps, labels, current),
  );
  const physicalAxis = faceAxis(physicalFace);
  return {axis: physicalAxis.axis, turns: turns * physicalAxis.turns};
};

/** Translate a fixed hardware-face packet into the rotation-aware lesson frame. */
export const smartCubeMoveInLessonFrame = (
  steps: TimelineEntry[],
  labels: string[],
  current: number,
  token: string,
): string => {
  const move = canonicalSmartCubeMove(token);
  const match = move.match(/^([URFDLB])(2|')?$/);
  if (!match) return move;
  let face = match[1];
  for (const rotation of completedRotations(steps, labels, current)) {
    const turns = normalizedTurns(rotation.turns);
    for (let turn = 0; turn < turns; turn += 1) face = rotateFaceOnce(rotation.axis, face);
  }
  return `${face}${match[2] ?? ""}`;
};

const nextExpectedSmartCubePlan = (
  steps: TimelineEntry[],
  labels: string[],
  current: number,
): PhysicalMovePlan | null => {
  const rotations: RotationStep[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]?.step;
    if (!step) continue;
    if (step.move.TAG === "Rotation") {
      rotations.push({axis: step.move._0, turns: step.turns});
      continue;
    }
    const plan = physicalPlanForStep(step, rotations, labels[index] ?? "", index);
    if (index < Math.max(0, current) || plan.skip) {
      if (plan.implicitRotation) rotations.push(plan.implicitRotation);
      continue;
    }
    return plan;
  }
  return null;
};

export const nextExpectedSmartCubeMove = (
  steps: TimelineEntry[],
  labels: string[],
  current: number,
): ExpectedSmartCubeMove | null => {
  const plan = nextExpectedSmartCubePlan(steps, labels, current);
  return plan ? {timelineIndex: plan.timelineIndex, token: plan.token} : null;
};

/**
 * Returns the next coaching action without hiding explicit whole-cube regrips.
 * Face encoders cannot normally report x/y/z, so the UI presents rotations as
 * confirmation checkpoints while `nextExpectedSmartCubeMove` remains the
 * fixed-frame packet projection used to validate reported face turns.
 */
export const nextExpectedSmartCubeAction = (
  steps: TimelineEntry[],
  labels: string[],
  current: number,
): ExpectedSmartCubeAction | null => {
  for (let index = Math.max(0, current); index < steps.length; index += 1) {
    const step = steps[index]?.step;
    if (!step) continue;
    if (step.move.TAG === "Rotation") {
      return {kind: "rotation", timelineIndex: index, token: labels[index] ?? ""};
    }
    const expected = nextExpectedSmartCubeMove(steps, labels, index);
    return expected ? {...expected, kind: "move"} : null;
  }
  return null;
};

export const assessSmartCubeMove = (
  steps: TimelineEntry[],
  labels: string[],
  current: number,
  received: string,
  halfTurnProgress: SmartCubeHalfTurnProgress | null = null,
): SmartCubeMoveAssessment => {
  const plan = nextExpectedSmartCubePlan(steps, labels, current);
  if (!plan) return {status: "complete"};
  const expected = {timelineIndex: plan.timelineIndex, token: plan.token};
  const actual = canonicalSmartCubeMove(received);
  if (plan.sequences.length === 0) {
    return {status: "unsupported", expected, received: actual};
  }

  const continuing = halfTurnProgress?.timelineIndex === plan.timelineIndex;
  const candidates = continuing ? halfTurnProgress.remainingSequences : plan.sequences;
  const remaining = uniqueSequences(
    candidates
      .filter((sequence) => sequence[0] === actual)
      .map((sequence) => sequence.slice(1)),
  );
  if (remaining.length === 0) return {status: "mismatch", expected, received: actual};
  if (remaining.some((sequence) => sequence.length === 0)) {
    return {status: "matched", expected, completedHalfTurn: continuing};
  }
  return {
    status: "partial",
    expected,
    received: actual,
    progress: {
      timelineIndex: plan.timelineIndex,
      receivedMoves: [...(continuing ? halfTurnProgress.receivedMoves : []), actual],
      remainingSequences: remaining,
    },
  };
};

export const nextSmartCubeProgressMoves = (
  progress: SmartCubeHalfTurnProgress,
): string[] => [...new Set(progress.remainingSequences.map((sequence) => sequence[0]).filter(Boolean))];

export const isLastPhysicalMoveInRange = (
  steps: TimelineEntry[],
  moveIndex: number,
  rangeEnd: number,
): boolean => {
  for (let index = moveIndex + 1; index < Math.min(rangeEnd, steps.length); index += 1) {
    const step = steps[index]?.step;
    if (step && step.move.TAG !== "Rotation") return false;
  }
  return true;
};
