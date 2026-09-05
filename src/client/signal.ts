export type ReadonlySignal<T> = {get: () => T; subscribe: (listener: (value: T) => void) => () => void};
export type Signal<T> = ReadonlySignal<T> & {set: (value: T) => void; update: (fn: (value: T) => T) => void};

export const signal = <T>(initial: T): Signal<T> => {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  const set = (next: T) => {
    if (Object.is(value, next)) return;
    value = next;
    listeners.forEach((listener) => listener(value));
  };
  return {get: () => value, set, update: (fn) => set(fn(value)), subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }};
};

export const computed = <T>(sources: ReadonlySignal<unknown>[], derive: () => T): ReadonlySignal<T> => {
  const result = signal(derive());
  sources.forEach((source) => source.subscribe(() => result.set(derive())));
  return {get: result.get, subscribe: result.subscribe};
};
