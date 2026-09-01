import {
  canonicalSmartCubeMove,
  type ExpectedSmartCubeMove,
} from "./live-sync";

export type SmartCubeRecoveryState = {
  expected: ExpectedSmartCubeMove;
  /** Moves required next, in execution order, to return to the tutorial state. */
  undoMoves: string[];
  /** Canonical net deviations that are still active on the physical cube. */
  deviations: string[];
};

export type SmartCubeRecoveryAssessment =
  | {status: "realigned"; received: string}
  | {status: "recovering"; received: string; state: SmartCubeRecoveryState}
  | {status: "extended"; received: string; state: SmartCubeRecoveryState}
  | {status: "unsupported"; received: string; state: SmartCubeRecoveryState};

export const inverseSmartCubeMove = (token: string): string | null => {
  const move = canonicalSmartCubeMove(token);
  const match = move.match(/^([URFDLB])(?:(2)|('))?$/);
  if (!match) return null;
  if (match[2]) return `${match[1]}2`;
  return `${match[1]}${match[3] ? "" : "'"}`;
};

export const quarterTurnsCancel = (left: string, right: string): boolean => {
  const first = canonicalSmartCubeMove(left);
  const second = canonicalSmartCubeMove(right);
  return inverseSmartCubeMove(first) === second && !first.endsWith("2");
};

const parsedFaceTurn = (token: string): {face: string; turns: number} | null => {
  const move = canonicalSmartCubeMove(token);
  const match = move.match(/^([URFDLB])(?:(2)|('))?$/);
  if (!match) return null;
  return {face: match[1], turns: match[2] ? 2 : match[3] ? 3 : 1};
};

const renderedFaceTurn = (face: string, turns: number): string => {
  const normalized = ((turns % 4) + 4) % 4;
  return `${face}${normalized === 2 ? "2" : normalized === 3 ? "'" : ""}`;
};

export const normalizeSmartCubeMoves = (tokens: string[]): string[] => {
  const result: Array<{face: string; turns: number}> = [];
  for (const token of tokens) {
    const parsed = parsedFaceTurn(token);
    if (!parsed) continue;
    const previous = result.at(-1);
    if (!previous || previous.face !== parsed.face) {
      result.push(parsed);
      continue;
    }
    const turns = (previous.turns + parsed.turns) % 4;
    result.pop();
    if (turns !== 0) result.push({face: parsed.face, turns});
  }
  return result.map(({face, turns}) => renderedFaceTurn(face, turns));
};

const undoSequence = (deviations: string[]): string[] =>
  [...deviations].reverse().map((move) => inverseSmartCubeMove(move)!).filter(Boolean);

const recoveryCost = (deviations: string[]): number =>
  deviations.reduce((total, move) => total + (move.endsWith("2") ? 2 : 1), 0);

export const beginSmartCubeRecovery = (
  expected: ExpectedSmartCubeMove,
  received: string,
): SmartCubeRecoveryState | null => {
  const actual = canonicalSmartCubeMove(received);
  if (!inverseSmartCubeMove(actual)) return null;
  const deviations = normalizeSmartCubeMoves([actual]);
  return {expected, undoMoves: undoSequence(deviations), deviations};
};

export const assessSmartCubeRecovery = (
  state: SmartCubeRecoveryState,
  received: string,
): SmartCubeRecoveryAssessment => {
  const actual = canonicalSmartCubeMove(received);
  if (!inverseSmartCubeMove(actual)) return {status: "unsupported", received: actual, state};
  const deviations = normalizeSmartCubeMoves([...state.deviations, actual]);
  if (deviations.length === 0) return {status: "realigned", received: actual};
  const nextState = {...state, deviations, undoMoves: undoSequence(deviations)};
  return {
    status: recoveryCost(deviations) < recoveryCost(state.deviations)
      ? "recovering"
      : "extended",
    received: actual,
    state: nextState,
  };
};

export const smartCubeRecoveryPrompt = (state: SmartCubeRecoveryState): string => {
  const [next, ...later] = state.undoMoves;
  const suffix = later.length > 0 ? `, then ${later.join(" ")}` : "";
  return `Slip detected: turn ${next}${suffix} to realign, then ${state.expected.token}.`;
};
