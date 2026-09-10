/**
 * Apply one physical-mirror input in transport order.
 *
 * A full facelet packet is an authoritative body-frame snapshot.  It must be
 * reduced at its place in the packet stream, rather than attached later to an
 * arbitrary in-flight turn animation.
 */
export type SmartCubeMirrorInput<State> =
  | {kind: "move"; move: string}
  | {kind: "snapshot"; state: State};

export const reduceSmartCubeMirrorInput = <State>(
  previous: State | null,
  input: SmartCubeMirrorInput<State>,
  applyMove: (state: State, move: string) => State,
): State | null => {
  if (input.kind === "snapshot") return input.state;
  return previous === null ? null : applyMove(previous, input.move);
};
