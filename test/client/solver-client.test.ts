import {describe, expect, test} from "vitest";

import {createSolverClient, createTwoPhaseSolverClient} from "../../src/client/workers/solver-client";

type Listener = (event: MessageEvent<unknown>) => void;

class FakeWorker {
  readonly requests: unknown[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(request: unknown): void {
    this.requests.push(request);
  }

  terminate(): void {}

  respond(response: unknown): void {
    this.listeners.get("message")?.forEach((listener) => listener({data: response} as MessageEvent));
  }

  fail(): void {
    this.listeners.get("error")?.forEach((listener) => listener({} as MessageEvent));
  }
}

describe("solver worker client", () => {
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

  test("uses a dedicated request type for full two-phase solutions", async () => {
    const worker = new FakeWorker();
    const stages: string[] = [];
    const client = createTwoPhaseSolverClient<{id: string}, {moveCount: number}>(
      worker as unknown as Worker,
      (stage) => stages.push(stage),
    );
    const solution = client.solve({id: "cube"});

    expect(worker.requests).toEqual([{id: 0, type: "solveTwoPhase", state: {id: "cube"}}]);
    worker.respond({id: 0, type: "twoPhaseProgress", stage: "Preparing tables"});
    expect(stages).toEqual(["Preparing tables"]);
    worker.respond({id: 0, ok: true, solution: {moveCount: 21}});
    await expect(solution).resolves.toEqual({moveCount: 21});
  });
});
