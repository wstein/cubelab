import {afterAll, beforeAll, describe, expect, test, vi} from "vitest";

const planners = vi.hoisted(() => ({
  centre4: vi.fn(), wing4: vi.fn(), centre5: vi.fn(), wing5: vi.fn(),
}));
vi.mock("../../src/Solver/Reduction4x4.res.mjs", async (original) => ({
  ...await original<Record<string, unknown>>(),
  planNextCentreBlock4x4: planners.centre4,
  planNextWingPair4x4: planners.wing4,
}));
vi.mock("../../src/Solver/Reduction5x5.res.mjs", async (original) => ({
  ...await original<Record<string, unknown>>(),
  planNextCentre5x5: planners.centre5,
  planNextWingPair5x5: planners.wing5,
}));

describe("reduction guide worker", () => {
  let dispatch: (event: {data: unknown}) => void;
  const postMessage = vi.fn();
  beforeAll(async () => {
    vi.stubGlobal("self", {
      addEventListener: (_type: string, listener: typeof dispatch) => { dispatch = listener; },
      postMessage,
    });
    await import("../../src/client/workers/solver.worker");
  });
  afterAll(() => vi.unstubAllGlobals());

  test.each([
    [4, "centre", "centre4"], [4, "wing", "wing4"],
    [5, "centre", "centre5"], [5, "wing", "wing5"],
  ] as const)("dispatches %i %s work and preserves unavailable results", (size, kind, planner) => {
    const state = {size};
    const result = {TAG: "Error", _0: {message: "No improving bounded guide"}};
    planners[planner].mockReturnValue(result);
    dispatch({data: {id: 17, type: "planReductionGuide", state: {size, kind, state}}});
    expect(planners[planner]).toHaveBeenCalledWith(state);
    expect(postMessage).toHaveBeenLastCalledWith({id: 17, ok: true, solution: result});
  });
});
