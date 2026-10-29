import type {SolverWorker} from "./solver-client";

/** Full physical orientations in fixed U/L/F/R/B/D frame; periods are 1, 2, 4. */
export type PictureSearch<TCube> = {
  cube: TCube;
  orientations: number[];
  symmetry: number[];
  maximumDepth: number;
  maximumNodes: number;
};

/** Dedicated worker, one request, bounded runtime. Cancellation terminates search.
 * A terminated client must be replaced; no color-only result is substituted. */
export const createPictureSolverClient = <TCube, TSolution>(
  worker: SolverWorker,
  timeoutMs = 10000,
) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error("A positive picture-solver deadline is required.");
  let serial = 0;
  let stopped = false;
  let pending: {id: number; resolve: (solution: TSolution) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>} | undefined;
  const stop = (message: string) => {
    stopped = true;
    worker.terminate();
    if (pending) {
      clearTimeout(pending.timer);
      const request = pending;
      pending = undefined;
      request.reject(new Error(message));
    }
  };
  worker.addEventListener("message", (event: MessageEvent<{id: number; ok: boolean; solution?: TSolution; error?: string}>) => {
    const result = event.data;
    if (!pending || result.id !== pending.id) return;
    const request = pending;
    pending = undefined;
    clearTimeout(request.timer);
    if (result.ok && result.solution !== undefined) request.resolve(result.solution as TSolution);
    else request.reject(new Error(result.error ?? "The center-aware search failed."));
  });
  worker.addEventListener("error", () => stop("The center-aware worker failed."));
  worker.addEventListener("messageerror", () => stop("The center-aware worker message could not be decoded."));
  return {
    solve(state: PictureSearch<TCube>): Promise<TSolution> {
      if (stopped) return Promise.reject(new Error("The center-aware worker was stopped."));
      if (pending) return Promise.reject(new Error("A center-aware search is already running."));
      const id = ++serial;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => stop("The center-aware search exceeded its deadline; no solvability conclusion was made."), timeoutMs);
        pending = {id, resolve, reject, timer};
        try {worker.postMessage({id, type: "solvePicture", state});}
        catch {stop("The center-aware worker could not start.");}
      });
    },
    cancel: () => stop("The center-aware search was cancelled."),
    terminate: () => stop("The center-aware worker was stopped."),
  };
};
