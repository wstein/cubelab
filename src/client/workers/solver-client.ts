export type TutorialSolverMethod = "beginner" | "advancedLbl" | "beginnerCfop" | "fullCfop" | "advancedCfop" | "petrus" | "enhancedPetrus";
type WorkerSuccess<T> = {id: number; ok: true; solution: T};
type WorkerFailure = {id: number; ok: false; error: string};
type WorkerResponse<T> = WorkerSuccess<T> | WorkerFailure;
type TwoPhaseProgress = {id: number; type: "twoPhaseProgress"; stage: string};
type TwoPhaseCandidate<T> = {id: number; type: "twoPhaseCandidate"; solution: T};
type Optimal2x2Progress = {id: number; type: "optimal2x2Progress"; stage: string};
type Random2x2Progress = {id: number; type: "random2x2Progress"; stage: string};
type TwoByTwoAcademyProgress = {id: number; type: "twoByTwoAcademyProgress"; stage: string};
type TwoByTwoPetrusProgress = {id: number; type: "twoByTwoPetrusProgress"; stage: string};
type Reduction4x4Progress = {id: number; type: "reduction4x4Progress"; stage: string};
type FullReduction4x4Progress = {id: number; type: "fullReduction4x4Progress"; stage: string};
type Reduction5x5CycleProgress = {id: number; type: "reduction5x5CycleProgress"; stage: string};
type Reduction5x5BarProgress = {id: number; type: "reduction5x5BarProgress"; stage: string};
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

export type BatchVerifyProgress = {index: number; choices: string[]};

/** Exact manual-state dot checks run off the interaction thread. */
export const createManualStateVerifierClient = (worker: Worker) => {
  let nextId = 0;
  const pending = new Map<number, {resolve: (value: string[]) => void; reject: (reason: Error) => void}>();
  const batchPending = new Map<number, {
    onProgress: (progress: BatchVerifyProgress) => void;
    resolve: () => void;
    reject: (reason: Error) => void;
  }>();

  worker.addEventListener("message", (event: MessageEvent<any>) => {
    const response = event.data;
    if (batchPending.has(response.id)) {
      const entry = batchPending.get(response.id)!;
      if (!response.ok) {
        batchPending.delete(response.id);
        entry.reject(new Error(response.error));
        return;
      }
      if (response.type === "progress") {
        entry.onProgress({index: response.index, choices: response.solution});
      } else if (response.type === "done") {
        batchPending.delete(response.id);
        entry.resolve();
      }
      return;
    }
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.solution);
    else request.reject(new Error(response.error));
  });
  worker.addEventListener("error", () => {
    pending.forEach(({reject}) => reject(new Error("The manual-state verifier worker could not start.")));
    pending.clear();
    batchPending.forEach(({reject}) => reject(new Error("The manual-state verifier worker could not start.")));
    batchPending.clear();
  });
  return {
    verify(size: number, draft: Array<string | null>, index: number): Promise<string[]> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject});
        worker.postMessage({id, type: "verifyManualStateColours", size, draft, index});
      });
    },
    verifyBatch(
      size: number,
      draft: Array<string | null>,
      indices: number[],
      onProgress: (progress: BatchVerifyProgress) => void,
    ): {promise: Promise<void>; cancel: () => void} {
      const id = nextId++;
      let cancelled = false;
      const promise = new Promise<void>((resolve, reject) => {
        batchPending.set(id, {
          onProgress: (res) => {
            if (!cancelled) onProgress(res);
          },
          resolve: () => {
            batchPending.delete(id);
            resolve();
          },
          reject: (err) => {
            batchPending.delete(id);
            reject(err);
          },
        });
        worker.postMessage({id, type: "verifyManualStateBatch", size, draft, indices});
      });
      return {
        promise,
        cancel: () => {
          cancelled = true;
          batchPending.delete(id);
        },
      };
    },
    terminate(): void {
      pending.forEach(({reject}) => reject(new Error("The manual-state verifier was stopped.")));
      pending.clear();
      batchPending.forEach(({reject}) => reject(new Error("The manual-state verifier was stopped.")));
      batchPending.clear();
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
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse<TSolution> | Optimal2x2Progress | Random2x2Progress | TwoByTwoAcademyProgress | TwoByTwoPetrusProgress | Reduction4x4Progress | FullReduction4x4Progress | Reduction5x5CycleProgress | Reduction5x5BarProgress>) => {
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

/** Dedicated request contract for uniformly sampled, table-backed 2×2 practice states. */
export const createRandom2x2ScrambleClient = <TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
) => {
  let nextId = 0;
  const pending = new Map<number, {resolve: (value: TSolution) => void; reject: (reason: Error) => void}>();
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse<TSolution> | Random2x2Progress>) => {
    const response = event.data;
    if ("type" in response && response.type === "random2x2Progress") {
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
    pending.forEach(({reject}) => reject(new Error("The random 2×2 worker could not start.")));
    pending.clear();
  });
  return {
    generate(difficulty: "any" | "3" | "4" | "5+" = "5+"): Promise<TSolution> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject});
        worker.postMessage({id, type: "generateRandom2x2", difficulty});
      });
    },
    terminate(): void {
      pending.forEach(({reject}) => reject(new Error("The random 2×2 worker was stopped.")));
      pending.clear();
      worker.terminate();
    },
  };
};

/** Dedicated request contract for the staged 2×2 Beginner/Ortega Academy. */
export const createTwoByTwoAcademySolverClient = <TState, TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
) => createProgressSolverClient<TState, TSolution>(
  worker,
  "solveTwoByTwoAcademy",
  "twoByTwoAcademyProgress",
  "The 2×2 Academy solver worker could not start.",
  "The 2×2 Academy solver was stopped.",
  onProgress,
);

/** Dedicated request contract for the staged, frame-locked 2×2 Petrus-inspired Academy. */
export const createTwoByTwoPetrusSolverClient = <TState, TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
) => createProgressSolverClient<TState, TSolution>(
  worker,
  "solveTwoByTwoPetrus",
  "twoByTwoPetrusProgress",
  "The 2×2 Petrus-inspired Academy solver worker could not start.",
  "The 2×2 Petrus-inspired Academy solver was stopped.",
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

/** Bounded full 4×4 reduction; success is always replay-verified in the worker. */
export const createFullReduction4x4SolverClient = <TState, TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
) => createProgressSolverClient<TState, TSolution>(
  worker,
  "solveFullReduction4x4",
  "fullReduction4x4Progress",
  "The full 4×4 reduction worker could not start.",
  "The full 4×4 reduction worker was stopped.",
  onProgress,
);

/** Exact 5×5 X-centre cycles run only in a dedicated worker, so table setup
 * can be cancelled by terminating that worker without blocking the page. */
export const createReduction5x5CycleSolverClient = <TState, TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
) => createProgressSolverClient<TState, TSolution>(
  worker,
  "solve5x5CentreCycle",
  "reduction5x5CycleProgress",
  "The 5×5 centre-cycle worker could not start.",
  "The 5×5 centre-cycle worker was stopped.",
  onProgress,
);

/** Broader 1×3 centre-bar commutator setups are cancellable worker work. */
export const createReduction5x5BarSolverClient = <TState, TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
) => createProgressSolverClient<TState, TSolution>(
  worker,
  "solve5x5CentreBar",
  "reduction5x5BarProgress",
  "The 5×5 centre-bar worker could not start.",
  "The 5×5 centre-bar worker was stopped.",
  onProgress,
);
