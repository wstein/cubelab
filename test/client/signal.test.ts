import {describe, expect, test} from "vitest";
import {computed, signal} from "../../src/client/signal";

describe("signals", () => {
  test("notifies only on a real change and updates computed values", () => {
    const draft = signal(1);
    const doubled = computed([draft], () => draft.get() * 2);
    const seen: number[] = [];
    const stop = doubled.subscribe((value) => seen.push(value));
    draft.set(1);
    draft.update((value) => value + 1);
    stop();
    draft.set(3);
    expect(doubled.get()).toBe(6);
    expect(seen).toEqual([4]);
  });
});
