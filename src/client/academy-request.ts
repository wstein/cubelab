/**
 * Monotonic token for Academy worker requests. Any change to setup, target,
 * or method invalidates earlier responses before they can alter playback.
 */
export const createAcademyRequestGuard = () => {
  let generation = 0;
  return {
    begin: (): number => ++generation,
    invalidate: (): void => { generation += 1; },
    isCurrent: (request: number): boolean => request === generation,
  };
};
