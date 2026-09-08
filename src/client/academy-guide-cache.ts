/** Retain one visible lesson's result; never keep obsolete searches alive. */
export const createAcademyGuideCache = <T>(changed: () => void, cancel: () => void, failed: (error: unknown) => T) => {
  let current: {key: string; value: T | null; pending: boolean} | null = null;
  const clear = () => {
    const previous = current;
    current = null;
    if (previous?.pending) cancel();
  };
  return {
    clear,
    peek(key: string): T | null {
      return current?.key === key ? current.value : null;
    },
    get(key: string, solve: () => Promise<T>): T | null {
      if (current?.key === key) return current.value;
      clear();
      const entry = {key, value: null as T | null, pending: true};
      current = entry;
      const complete = (value: T) => {
        if (current !== entry) return;
        entry.value = value;
        entry.pending = false;
        changed();
      };
      try {
        void solve().then(complete, (error) => complete(failed(error)));
      } catch (error) {
        complete(failed(error));
      }
      return null;
    },
  };
};
