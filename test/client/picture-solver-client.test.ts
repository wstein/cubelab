import {expect, test, vi} from "vitest";
import {createPictureSolverClient} from "../../src/client/workers/picture-solver-client";
class Worker {
  requests: any[] = [];
  dead = false;
  listeners: Record<string, ((event: any) => void)[]> = {};
  addEventListener(type: string, listener: (event: any) => void) {(this.listeners[type] ??= []).push(listener);}
  postMessage(value: unknown) {this.requests.push(value);}
  terminate() {this.dead = true;}
  reply(value: unknown) {this.listeners.message.forEach(listener => listener({data: value}));}
}
const state = {cube: {}, orientations: [0,0,0,0,0,0], symmetry: [4,4,4,4,4,4], maximumDepth: 20, maximumNodes: 10000};
test("picture client sends explicit center goals and rejects concurrent searches", async () => {
  const w = new Worker(), client = createPictureSolverClient(w);
  const result = client.solve(state);
  expect(w.requests).toEqual([{id: 1, type: "solvePicture", state}]);
  await expect(client.solve(state)).rejects.toThrow("already running");
  w.reply({id: 0, ok: true, solution: "stale"});
  w.reply({id: 1, ok: true, solution: "verified"});
  await expect(result).resolves.toBe("verified");
  const failure = client.solve(state);
  w.reply({id: 2, ok: false, error: "node budget reached"});
  await expect(failure).rejects.toThrow("node budget reached");
  client.terminate();
});
test("deadline and cancellation terminate the dedicated worker and reject pending work", async () => {
  vi.useFakeTimers();
  try {
    const w = new Worker(), client = createPictureSolverClient(w, 20);
    const result = expect(client.solve(state)).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(21);
    await result;
    expect(w.dead).toBe(true);
    await expect(client.solve(state)).rejects.toThrow("stopped");
    const w2 = new Worker(), c2 = createPictureSolverClient(w2);
    const cancelled = expect(c2.solve(state)).rejects.toThrow("cancelled");
    c2.cancel();
    await cancelled;
    expect(w2.dead).toBe(true);
  } finally {vi.useRealTimers();}
});

test("an incomplete success message cannot resolve an unverified undefined solution", async () => {
  const w = new Worker(), client = createPictureSolverClient(w);
  const result = client.solve(state);
  w.reply({id: 1, ok: true});
  await expect(result).rejects.toThrow("failed");
  client.terminate();
});
