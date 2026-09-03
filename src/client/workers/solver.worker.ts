import * as BeginnerSolver from "../../Solver/BeginnerSolver.res.mjs";
import * as CfopSolver from "../../Solver/CfopSolver.res.mjs";
import * as PetrusSolver from "../../Solver/PetrusSolver.res.mjs";
import * as TwoPhaseSolver from "../../Solver/TwoPhaseSolver.res.mjs";
import * as Optimal2x2Solver from "../../Solver/Optimal2x2Solver";

type TutorialMethod = "beginner" | "advancedLbl" | "beginnerCfop" | "fullCfop" | "advancedCfop" | "petrus" | "enhancedPetrus";
type WorkerRequest =
  | {id: number; type: "solveTutorial"; method: TutorialMethod; state: unknown}
  | {id: number; type: "solveOptimal2x2"; state: unknown}
  | {id: number; type: "solveTwoPhase"; state: unknown; refine?: boolean; maximumDepth?: number}
  | {id: number; type: "cancelTwoPhase"};
type ReScriptResult = {TAG: "Ok"; _0: unknown} | {TAG: "Error"; _0: unknown};

const describeFailure = (method: TutorialMethod, error: unknown): string => {
  if (method === "beginner") return BeginnerSolver.describeError(error);
  if (method === "petrus" || method === "enhancedPetrus") return PetrusSolver.describeError(error);
  return CfopSolver.describeError(error);
};

const solve = (method: TutorialMethod, state: unknown): ReScriptResult => {
  switch (method) {
    case "beginner": return BeginnerSolver.solve(state);
    case "advancedLbl": return CfopSolver.solveAdvancedLbl(state);
    case "beginnerCfop": return CfopSolver.solveBeginner(state);
    case "fullCfop": return CfopSolver.solveFull(state);
    case "advancedCfop": return CfopSolver.solveAdvanced(state);
    case "petrus": return PetrusSolver.solveClassical(state);
    case "enhancedPetrus": return PetrusSolver.solveEnhanced(state);
  }
};

const cancelledTwoPhaseRequests = new Set<number>();

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "cancelTwoPhase") {
      cancelledTwoPhaseRequests.add(request.id);
      return;
    }
    if (request.type === "solveTwoPhase") {
      cancelledTwoPhaseRequests.delete(request.id);
      self.postMessage({id: request.id, type: "twoPhaseProgress", stage: "Preparing transition and pruning tables…"});
      TwoPhaseSolver.prepareTables();
      const preferredBound = 20;
      const maximumBound = 24;
      const refining = request.refine === true;
      let bound = refining && Number.isInteger(request.maximumDepth)
        ? Math.min(maximumBound, Math.max(0, request.maximumDepth!))
        : preferredBound;
      let incumbent: unknown | null = null;
      const searchNextBound = () => {
        if (cancelledTwoPhaseRequests.has(request.id)) {
          self.postMessage(incumbent === null
            ? {id: request.id, ok: false, error: "The two-phase solver was cancelled before finding a solution."}
            : {id: request.id, ok: true, solution: incumbent});
          return;
        }
        if (!refining && incumbent === null && bound > maximumBound) {
          self.postMessage({id: request.id, ok: false, error: "No two-phase solution was found within 24 HTM."});
          return;
        }
        if ((refining && incumbent === null && bound < 0)) {
          self.postMessage({id: request.id, ok: false, error: "No shorter two-phase solution was found."});
          return;
        }
        if (incumbent !== null && bound < 0) {
          self.postMessage({id: request.id, ok: true, solution: incumbent});
          return;
        }
        self.postMessage({id: request.id, type: "twoPhaseProgress", stage: `Searching for a solution in ${bound} HTM or fewer…`});
        const result = TwoPhaseSolver.solveAtDepth(request.state, bound);
        if (result.TAG === "Ok") {
          incumbent = result._0;
          self.postMessage({id: request.id, type: "twoPhaseCandidate", solution: incumbent});
          if (!refining) {
            self.postMessage({id: request.id, ok: true, solution: incumbent});
            return;
          }
          bound = result._0.moveCount - 1;
        } else if (result._0 === "SearchFailed" || (result._0 as {TAG?: string}).TAG === "SearchFailed") {
          bound += refining || incumbent !== null ? -1 : 1;
        } else {
          self.postMessage({id: request.id, ok: false, error: TwoPhaseSolver.describeError(result._0)});
          return;
        }
        setTimeout(searchNextBound, 0);
      };
      setTimeout(searchNextBound, 0);
      return;
    }
    if (request.type === "solveOptimal2x2") {
      void (async () => {
        try {
          if (!Optimal2x2Solver.hasPreparedTables()) {
            self.postMessage({id: request.id, type: "optimal2x2Progress", stage: "Preparing optimal 2×2 solver…"});
            await Optimal2x2Solver.prepareTables();
          }
          self.postMessage({id: request.id, type: "optimal2x2Progress", stage: "Searching for an HTM-optimal solution…"});
          const solution = await Optimal2x2Solver.solve(request.state);
          self.postMessage({id: request.id, ok: true, solution});
        } catch (error) {
          self.postMessage({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : "The optimal 2×2 solver stopped unexpectedly.",
          });
        }
      })();
      return;
    }
    if (request.type !== "solveTutorial") return;
    const result = solve(request.method, request.state);
    self.postMessage(result.TAG === "Ok"
      ? {id: request.id, ok: true, solution: result._0}
      : {id: request.id, ok: false, error: describeFailure(request.method, result._0)});
  } catch (error) {
    self.postMessage({id: request.id, ok: false, error: error instanceof Error ? error.message : "The background solver stopped unexpectedly."});
  }
});
