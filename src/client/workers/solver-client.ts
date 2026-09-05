export type TutorialSolverMethod = "beginner" | "advancedLbl" | "beginnerCfop" | "fullCfop" | "advancedCfop" | "petrus" | "enhancedPetrus";
type WorkerSuccess<T> = {id: number; ok: true; solution: T};
type WorkerFailure = {id: number; ok: false; error: string};
type WorkerResponse<T> = WorkerSuccess<T> | WorkerFailure;
type TwoPhaseProgress = {id: number; type: "twoPhaseProgress"; stage: string};
type TwoPhaseCandidate<T> = {id: number; type: "twoPhaseCandidate"; solution: T};
type Optimal2x2Progress = {id: number; type: "optimal2x2Progress"; stage: string};
type Reduction4x4Progress = {id: number; type: "reduction4x4Progress"; stage: string};
export type TwoPhaseSearchOptions = {refine?: boolean; maximumDepth?: number};

/** Request/response boundary for expensive searches; the UI thread never waits for them. */
export const createSolverClient = <TState, TSolution>(worker: Worker) => {
  let nextId = 0;
  const pending = new Map<number, {resolve: (value: TSolution) => void; reject: (reason: Error) => void}>();
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse<TSolution>>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.solution);
    else request.reject(new Error(response.error));
  });
  worker.addEventListener("error", () => {
    pending.forEach(({reject}) => reject(new Error("The background solver worker could not start.")));
    pending.clear();
  });
  return {
    solve(method: TutorialSolverMethod, state: TState): Promise<TSolution> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject});
        worker.postMessage({id, type: "solveTutorial", method, state});
      });
    },
    terminate(): void {
      pending.forEach(({reject}) => reject(new Error("The background solver was stopped.")));
      pending.clear();
      worker.terminate();
    },
  };
};

/** Exact manual-state dot checks run off the interaction thread. */
export const createManualStateVerifierClient = (worker: Worker) => {
  let nextId = 0;
  const pending = new Map<number, {resolve: (value: string[]) => void; reject: (reason: Error) => void}>();
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse<string[]>>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.solution);
    else request.reject(new Error(response.error));
  });
  worker.addEventListener("error", () => {
    pending.forEach(({reject}) => reject(new Error("The manual-state verifier worker could not start.")));
    pending.clear();
  });
  return {
    verify(size: number, draft: Array<string | null>, index: number): Promise<string[]> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject});
        worker.postMessage({id, type: "verifyManualStateColours", size, draft, index});
      });
    },
    terminate(): void {
      pending.forEach(({reject}) => reject(new Error("The manual-state verifier was stopped.")));
      pending.clear();
      worker.terminate();
    },
  };
};

/** Dedicated request contract for full-cube two-phase searches. */
export const createTwoPhaseSolverClient = <TState, TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
  onCandidate?: (solution: TSolution) => void,
) => {
  let nextId = 0;
  const pending = new Map<number, {resolve: (value: TSolution) => void; reject: (reason: Error) => void}>();
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse<TSolution> | TwoPhaseProgress | TwoPhaseCandidate<TSolution>>) => {
    const response = event.data;
    if ("type" in response && response.type === "twoPhaseProgress") {
      onProgress?.(response.stage);
      return;
    }
    if ("type" in response && response.type === "twoPhaseCandidate") {
      onCandidate?.(response.solution);
      return;
    }
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.solution);
    else request.reject(new Error(response.error));
  });
  worker.addEventListener("error", () => {
    pending.forEach(({reject}) => reject(new Error("The two-phase solver worker could not start.")));
    pending.clear();
  });
  return {
    solve(state: TState, options: TwoPhaseSearchOptions = {}): Promise<TSolution> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject});
        worker.postMessage({id, type: "solveTwoPhase", state, ...options});
      });
    },
    cancel(): void {
      pending.forEach((_request, id) => worker.postMessage({id, type: "cancelTwoPhase"}));
    },
    terminate(): void {
      pending.forEach(({reject}) => reject(new Error("The two-phase solver was stopped.")));
      pending.clear();
      worker.terminate();
    },
  };
};

/** Common client for worker solvers that report named preparation stages. */
const createProgressSolverClient = <TState, TSolution, TRequest extends string, TProgress extends string>(
  worker: Worker,
  requestType: TRequest,
  progressType: TProgress,
  startError: string,
  stoppedError: string,
  onProgress?: (stage: string) => void,
) => {
  let nextId = 0;
  const pending = new Map<number, {resolve: (value: TSolution) => void; reject: (reason: Error) => void}>();
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse<TSolution> | Optimal2x2Progress | Reduction4x4Progress>) => {
    const response = event.data;
    if ("type" in response && response.type === progressType) {
      onProgress?.(response.stage);
      return;
    }
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.solution);
    else request.reject(new Error(response.error));
  });
  worker.addEventListener("error", () => {
    pending.forEach(({reject}) => reject(new Error(startError)));
    pending.clear();
  });
  return {
    solve(state: TState): Promise<TSolution> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject});
        worker.postMessage({id, type: requestType, state});
      });
    },
    terminate(): void {
      pending.forEach(({reject}) => reject(new Error(stoppedError)));
      pending.clear();
      worker.terminate();
    },
  };
};

/** Dedicated request contract for table-backed optimal 2×2 searches. */
export const createOptimal2x2SolverClient = <TState, TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
) => createProgressSolverClient<TState, TSolution>(
  worker,
  "solveOptimal2x2",
  "optimal2x2Progress",
  "The optimal 2×2 solver worker could not start.",
  "The optimal 2×2 solver was stopped.",
  onProgress,
);

/** Dedicated request contract for a reduced 4×4's 3×3 finishing stage. */
export const createReduction4x4SolverClient = <TState, TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
) => createProgressSolverClient<TState, TSolution>(
  worker,
  "solveReduced4x4",
  "reduction4x4Progress",
  "The 4×4 reduction solver worker could not start.",
  "The 4×4 reduction solver was stopped.",
  onProgress,
);
