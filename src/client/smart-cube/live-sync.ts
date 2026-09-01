import type {TimelineEntry} from "../playback";

export type ExpectedSmartCubeMove = {
  timelineIndex: number;
  token: string;
};

export type SmartCubeHalfTurnProgress = {
  timelineIndex: number;
  quarterTurn: string;
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

export const appendRecordedMove = (source: string, move: string): string => {
  const token = canonicalSmartCubeMove(move);
  const trimmed = source.trimEnd();
  if (trimmed === "") return token;
  const lastLine = trimmed.slice(trimmed.lastIndexOf("\n") + 1);
  const afterLineComment = lastLine.includes("//") || /(^|\s)#/.test(lastLine);
  return `${trimmed}${afterLineComment ? "\n" : " "}${token}`;
};

export const nextExpectedSmartCubeMove = (
  steps: TimelineEntry[],
  labels: string[],
  current: number,
): ExpectedSmartCubeMove | null => {
  for (let index = Math.max(0, current); index < steps.length; index += 1) {
    const step = steps[index]?.step;
    if (!step || step.move.TAG === "Rotation") continue;
    return {timelineIndex: index, token: labels[index] ?? ""};
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
  const expected = nextExpectedSmartCubeMove(steps, labels, current);
  if (!expected) return {status: "complete"};
  const actual = canonicalSmartCubeMove(received);
  const expectedToken = canonicalSmartCubeMove(expected.token);
  if (!/^[URFDLB](?:2|')?$/.test(expectedToken)) {
    return {status: "unsupported", expected, received: actual};
  }
  if (actual === expectedToken) {
    return {status: "matched", expected, completedHalfTurn: false};
  }
  const expectedHalfTurn = expectedToken.match(/^([URFDLB])2$/);
  const receivedQuarterTurn = actual.match(/^([URFDLB])(')?$/);
  if (expectedHalfTurn && receivedQuarterTurn && expectedHalfTurn[1] === receivedQuarterTurn[1]) {
    const sameExpected = halfTurnProgress?.timelineIndex === expected.timelineIndex;
    if (sameExpected && halfTurnProgress.quarterTurn === actual) {
      return {status: "matched", expected, completedHalfTurn: true};
    }
    if (!sameExpected) {
      return {
        status: "partial",
        expected,
        received: actual,
        progress: {timelineIndex: expected.timelineIndex, quarterTurn: actual},
      };
    }
  }
  return {status: "mismatch", expected, received: actual};
};

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
