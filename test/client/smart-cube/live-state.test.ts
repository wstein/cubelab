import {describe, expect, test} from "vitest";

import {
  reduceSmartCubeMirrorInput,
} from "../../../src/client/smart-cube/live-state";

describe("smart cube physical-mirror state", () => {
  test("reduces a facelet snapshot between the moves that surround it", () => {
    const apply = (state: string, move: string) => `${state} ${move}`;
    let state: string | null = "solved";

    state = reduceSmartCubeMirrorInput(state, {kind: "move", move: "U"}, apply);
    state = reduceSmartCubeMirrorInput(state, {kind: "snapshot", state: "after U"}, apply);
    state = reduceSmartCubeMirrorInput(state, {kind: "move", move: "D"}, apply);

    expect(state).toBe("after U D");
  });

  test("does not fabricate a state before the first facelet snapshot", () => {
    expect(reduceSmartCubeMirrorInput(null, {kind: "move", move: "U"}, (state) => state))
      .toBeNull();
  });
});
