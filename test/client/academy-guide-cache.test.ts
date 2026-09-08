import {expect, test, vi} from "vitest";
import {createAcademyGuideCache} from "../../src/client/academy-guide-cache";

test("shares a pending request and caches only the current state", async () => {
  const changed = vi.fn();
  const cancel = vi.fn();
  const cache = createAcademyGuideCache<number>(changed, cancel, () => -1);
  let finish!: (value: number) => void;
  const solve = vi.fn(() => new Promise<number>((resolve) => { finish = resolve; }));
  expect(cache.get("a", solve)).toBeNull();
  expect(cache.get("a", solve)).toBeNull();
  expect(solve).toHaveBeenCalledTimes(1);
  finish(3);
  await Promise.resolve();
  expect(cache.get("a", solve)).toBe(3);
  expect(changed).toHaveBeenCalledTimes(1);
  cache.clear();
  expect(cache.get("a", solve)).toBeNull();
  expect(solve).toHaveBeenCalledTimes(2);
});

test("cancels obsolete pending work and ignores its late response", async () => {
  const changed = vi.fn();
  const cancel = vi.fn();
  const cache = createAcademyGuideCache<number>(changed, cancel, () => -1);
  let finish!: (value: number) => void;
  cache.get("a", () => new Promise<number>((resolve) => { finish = resolve; }));
  cache.clear();
  expect(cancel).toHaveBeenCalledTimes(1);
  finish(4);
  await Promise.resolve();
  expect(changed).not.toHaveBeenCalled();
  expect(cache.get("b", () => Promise.resolve(9))).toBeNull();
  await Promise.resolve();
  expect(cache.get("b", () => Promise.resolve(0))).toBe(9);
});

test("replacing the state cancels its pending request and releases the old result", async () => {
  const changed = vi.fn();
  const cancel = vi.fn();
  const cache = createAcademyGuideCache<number>(changed, cancel, () => -1);
  let finishOld!: (value: number) => void;
  cache.get("a", () => new Promise<number>((resolve) => { finishOld = resolve; }));
  cache.get("b", () => Promise.resolve(8));
  expect(cancel).toHaveBeenCalledTimes(1);
  finishOld(1);
  await Promise.resolve();
  expect(changed).toHaveBeenCalledTimes(1);
  expect(cache.get("b", () => Promise.resolve(0))).toBe(8);
  expect(cache.get("a", () => Promise.resolve(2))).toBeNull();
  await Promise.resolve();
  expect(cache.get("a", () => Promise.resolve(0))).toBe(2);
});

test("caches failures and lets Apply read without starting work", async () => {
  const changed = vi.fn();
  const failed = vi.fn(() => -1);
  const cache = createAcademyGuideCache<number>(changed, vi.fn(), failed);
  expect(cache.peek("a")).toBeNull();
  const error = new Error("worker failed");
  cache.get("a", () => Promise.reject(error));
  await Promise.resolve();
  expect(failed).toHaveBeenCalledWith(error);
  expect(cache.peek("a")).toBe(-1);
  expect(cache.peek("b")).toBeNull();
  expect(changed).toHaveBeenCalledTimes(1);
});
