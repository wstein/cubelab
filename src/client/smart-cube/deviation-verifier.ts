import {
  canonicalSmartCubeMove,
  type ExpectedSmartCubeMove,
} from "./live-sync";

export type SmartCubeRecoveryState = {
  expected: ExpectedSmartCubeMove;
  /** Moves required next, in execution order, to return to the tutorial state. */
  undoMoves: string[];
  /** Physical deviations, retained for the session mistake log. */
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

export const beginSmartCubeRecovery = (
  expected: ExpectedSmartCubeMove,
  received: string,
): SmartCubeRecoveryState | null => {
  const actual = canonicalSmartCubeMove(received);
  const undo = inverseSmartCubeMove(actual);
  if (!undo) return null;
  return {expected, undoMoves: [undo], deviations: [actual]};
};

export const assessSmartCubeRecovery = (
  state: SmartCubeRecoveryState,
  received: string,
): SmartCubeRecoveryAssessment => {
  const actual = canonicalSmartCubeMove(received);
  const required = state.undoMoves[0];
  if (actual === required) {
    const undoMoves = state.undoMoves.slice(1);
    if (undoMoves.length === 0) return {status: "realigned", received: actual};
    return {
      status: "recovering",
      received: actual,
      state: {...state, undoMoves, deviations: state.deviations.slice(0, -1)},
    };
  }

  const undo = inverseSmartCubeMove(actual);
  if (!undo) return {status: "unsupported", received: actual, state};
  return {
    status: "extended",
    received: actual,
    state: {
      ...state,
      undoMoves: [undo, ...state.undoMoves],
      deviations: [...state.deviations, actual],
    },
  };
};

export const smartCubeRecoveryPrompt = (state: SmartCubeRecoveryState): string => {
  const [next, ...later] = state.undoMoves;
  const suffix = later.length > 0 ? `, then ${later.join(" ")}` : "";
  return `Slip detected: turn ${next}${suffix} to realign, then ${state.expected.token}.`;
};
