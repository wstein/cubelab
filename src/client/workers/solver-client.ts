export type TutorialSolverMethod = "beginner" | "advancedLbl" | "beginnerCfop" | "fullCfop" | "advancedCfop" | "petrus" | "enhancedPetrus";
type WorkerSuccess<T> = {id: number; ok: true; solution: T};
type WorkerFailure = {id: number; ok: false; error: string};
type WorkerResponse<T> = WorkerSuccess<T> | WorkerFailure;
type TwoPhaseProgress = {id: number; type: "twoPhaseProgress"; stage: string};

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

/** Dedicated request contract for full-cube two-phase searches. */
export const createTwoPhaseSolverClient = <TState, TSolution>(
  worker: Worker,
  onProgress?: (stage: string) => void,
) => {
  let nextId = 0;
  const pending = new Map<number, {resolve: (value: TSolution) => void; reject: (reason: Error) => void}>();
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse<TSolution> | TwoPhaseProgress>) => {
    const response = event.data;
    if ("type" in response && response.type === "twoPhaseProgress") {
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
    pending.forEach(({reject}) => reject(new Error("The two-phase solver worker could not start.")));
    pending.clear();
  });
  return {
    solve(state: TState): Promise<TSolution> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject});
        worker.postMessage({id, type: "solveTwoPhase", state});
      });
    },
    terminate(): void {
      pending.forEach(({reject}) => reject(new Error("The two-phase solver was stopped.")));
      pending.clear();
      worker.terminate();
    },
  };
};
