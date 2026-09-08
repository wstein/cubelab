import {describe, expect, test} from "vitest";

import {
  createLazyWorker,
  createReductionGuideClient,
  createOptimal2x2SolverClient,
  createRandom2x2ScrambleClient,
  createReduction4x4SolverClient,
  createSolverClient,
  createTwoPhaseSolverClient,
  createManualStateVerifierClient,
} from "../../src/client/workers/solver-client";

type Listener = (event: MessageEvent<unknown>) => void;

class FakeWorker {
  readonly requests: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(request: unknown): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: unknown): void {
    this.listeners.get("message")?.forEach((listener) => listener({data: response} as MessageEvent));
  }

  fail(): void {
    this.listeners.get("error")?.forEach((listener) => listener({} as MessageEvent));
  }
}

describe("solver worker client", () => {
  test("starts a lazy worker only for the first request and reuses it", async () => {
    const worker = new FakeWorker();
    let starts = 0;
    const lazy = createLazyWorker(() => { starts++; return worker as unknown as Worker; });
    const client = createSolverClient(lazy);
    expect(starts).toBe(0);
    const first = client.solve("beginner", {});
    const second = client.solve("petrus", {});
    expect(starts).toBe(1);
    worker.respond({id: 0, ok: true, solution: "first"});
    worker.respond({id: 1, ok: true, solution: "second"});
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    client.terminate();
    expect(worker.terminated).toBe(true);
  });

  test("terminating an unused lazy worker avoids startup and prevents later requests", async () => {
    let starts = 0;
    const lazy = createLazyWorker(() => { starts++; return new FakeWorker() as unknown as Worker; });
    const client = createSolverClient(lazy);
    client.terminate();
    expect(starts).toBe(0);
    await expect(client.solve("beginner", {})).rejects.toThrow("stopped");
    expect(starts).toBe(0);
  });

  test("reports lazy worker startup failures to every pending request", async () => {
    const client = createSolverClient(createLazyWorker(() => { throw new Error("startup denied"); }));
    await expect(client.solve("beginner", {})).rejects.toThrow("could not start");
    await expect(client.solve("beginner", {})).rejects.toThrow("could not start");
    client.terminate();
  });

  test("does not retain requests rejected after termination for later cancellation", async () => {
    const client = createTwoPhaseSolverClient(createLazyWorker(() => new FakeWorker() as unknown as Worker));
    client.terminate();
    await expect(client.solve({})).rejects.toThrow("stopped");
    expect(() => client.cancel()).not.toThrow();
  });

  test("correlates background reduction guide results including unavailable guides", async () => {
    const worker = new FakeWorker();
    const client = createReductionGuideClient(worker as unknown as Worker);
    const result = client.solve({size: 5, kind: "centre", state: {cube: "five"}});
    expect(worker.requests).toEqual([{id: 0, type: "planReductionGuide", state: {size: 5, kind: "centre", state: {cube: "five"}}}]);
    const unavailable = {TAG: "Error", _0: {message: "No bounded guide"}};
    worker.respond({id: 0, ok: true, solution: unavailable});
    await expect(result).resolves.toEqual(unavailable);
  });
  test("correlates manual-state verification responses without blocking the caller", async () => {
    const worker = new FakeWorker();
    const client = createManualStateVerifierClient(worker as unknown as Worker);
    const verification = client.verify(4, [null], 0);
    expect(worker.requests).toEqual([{id: 0, type: "verifyManualStateColours", size: 4, draft: [null], index: 0}]);
    worker.respond({id: 0, ok: true, solution: ["U", "F"]});
    await expect(verification).resolves.toEqual(["U", "F"]);
  });

  test("correlates asynchronous solver responses to their requests", async () => {
    const worker = new FakeWorker();
    const client = createSolverClient<{id: string}, {moves: string}>(worker as unknown as Worker);
    const solution = client.solve("beginner", {id: "first"});

    expect(worker.requests).toEqual([
      {id: 0, type: "solveTutorial", method: "beginner", state: {id: "first"}},
    ]);
    worker.respond({id: 0, ok: true, solution: {moves: "R U R'"}});
    await expect(solution).resolves.toEqual({moves: "R U R'"});
  });

  test("rejects all pending requests when the worker fails", async () => {
    const worker = new FakeWorker();
    const client = createSolverClient<{id: string}, {moves: string}>(worker as unknown as Worker);
    const first = client.solve("beginner", {id: "first"});
    const second = client.solve("fullCfop", {id: "second"});

    worker.fail();
    await expect(first).rejects.toThrow("could not start");
    await expect(second).rejects.toThrow("could not start");
  });

  test("forwards a tutorial worker diagnostic", async () => {
    const worker = new FakeWorker();
    const client = createSolverClient<{id: string}, {moves: string}>(worker as unknown as Worker);
    const solution = client.solve("beginner", {id: "invalid"});
    worker.respond({id: 0, ok: false, error: "The target centre frame is rotated."});
    await expect(solution).rejects.toThrow("target centre frame is rotated");
  });

  test("uses a dedicated request type for full two-phase solutions", async () => {
    const worker = new FakeWorker();
    const stages: string[] = [];
    const candidates: number[] = [];
    const client = createTwoPhaseSolverClient<{id: string}, {moveCount: number}>(
      worker as unknown as Worker,
      (stage) => stages.push(stage),
      (solution) => candidates.push(solution.moveCount),
    );
    const solution = client.solve({id: "cube"});

    expect(worker.requests).toEqual([{id: 0, type: "solveTwoPhase", state: {id: "cube"}}]);
    worker.respond({id: 0, type: "twoPhaseProgress", stage: "Preparing tables"});
    expect(stages).toEqual(["Preparing tables"]);
    worker.respond({id: 0, type: "twoPhaseCandidate", solution: {moveCount: 21}});
    expect(candidates).toEqual([21]);
    worker.respond({id: 0, ok: true, solution: {moveCount: 21}});
    await expect(solution).resolves.toEqual({moveCount: 21});
  });

  test("passes an explicit lower bound only for a two-phase refinement request", async () => {
    const worker = new FakeWorker();
    const client = createTwoPhaseSolverClient<{state: string}, {moveCount: number}>(worker as unknown as Worker);
    const pending = client.solve({state: "relative"}, {refine: true, maximumDepth: 18});
    expect(worker.requests).toEqual([
      {id: 0, type: "solveTwoPhase", state: {state: "relative"}, refine: true, maximumDepth: 18},
    ]);
    worker.respond({id: 0, ok: true, solution: {moveCount: 18}});
    await expect(pending).resolves.toEqual({moveCount: 18});
  });

  test("can immediately terminate a dedicated two-phase worker", async () => {
    const worker = new FakeWorker();
    const client = createTwoPhaseSolverClient<{id: string}, {moveCount: number}>(
      worker as unknown as Worker,
    );
    const solution = client.solve({id: "cube"});

    client.terminate();

    expect(worker.terminated).toBe(true);
    await expect(solution).rejects.toThrow("was stopped");
  });

  test("uses a dedicated request and preparation stages for optimal 2×2 solutions", async () => {
    const worker = new FakeWorker();
    const stages: string[] = [];
    const client = createOptimal2x2SolverClient<{id: string}, {moveCount: number}>(
      worker as unknown as Worker,
      (stage) => stages.push(stage),
    );
    const solution = client.solve({id: "cube"});
    expect(worker.requests).toEqual([{id: 0, type: "solveOptimal2x2", state: {id: "cube"}}]);
    worker.respond({id: 0, type: "optimal2x2Progress", stage: "Preparing optimal 2×2 solver…"});
    worker.respond({id: 0, ok: true, solution: {moveCount: 11}});
    expect(stages).toEqual(["Preparing optimal 2×2 solver…"]);
    await expect(solution).resolves.toEqual({moveCount: 11});
  });

  test("uses a dedicated request for uniform random 2×2 states", async () => {
    const worker = new FakeWorker();
    const client = createRandom2x2ScrambleClient<{alg: unknown[]; moveCount: number}>(worker as unknown as Worker);
    const generated = client.generate();
    expect(worker.requests).toEqual([{id: 0, type: "generateRandom2x2", difficulty: "5+"}]);
    worker.respond({id: 0, ok: true, solution: {alg: [], moveCount: 8}});
    await expect(generated).resolves.toEqual({alg: [], moveCount: 8});
  });

  test("passes an exact 2×2 drill bucket to the random-state worker", async () => {
    const worker = new FakeWorker();
    const client = createRandom2x2ScrambleClient<{alg: unknown[]}>(worker as unknown as Worker);
    const generated = client.generate("3");
    expect(worker.requests).toEqual([{id: 0, type: "generateRandom2x2", difficulty: "3"}]);
    worker.respond({id: 0, ok: true, solution: {alg: []}});
    await expect(generated).resolves.toEqual({alg: []});
  });

  test("uses a dedicated request and progress stages for reduced 4×4 finishes", async () => {
    const worker = new FakeWorker();
    const stages: string[] = [];
    const client = createReduction4x4SolverClient<{id: string}, {moveCount: number}>(
      worker as unknown as Worker,
      (stage) => stages.push(stage),
    );
    const solution = client.solve({id: "reduced"});
    expect(worker.requests).toEqual([{id: 0, type: "solveReduced4x4", state: {id: "reduced"}}]);
    worker.respond({id: 0, type: "reduction4x4Progress", stage: "Checking centre blocks and wing pairs…"});
    worker.respond({id: 0, ok: true, solution: {moveCount: 19}});
    expect(stages).toEqual(["Checking centre blocks and wing pairs…"]);
    await expect(solution).resolves.toEqual({moveCount: 19});
  });
});
