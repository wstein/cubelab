import * as BeginnerSolver from "../../Solver/BeginnerSolver.res.mjs";
import * as CfopSolver from "../../Solver/CfopSolver.res.mjs";
import * as PetrusSolver from "../../Solver/PetrusSolver.res.mjs";

type TutorialMethod = "beginner" | "advancedLbl" | "beginnerCfop" | "fullCfop" | "advancedCfop" | "petrus" | "enhancedPetrus";
type WorkerRequest = {id: number; type: "solveTutorial"; method: TutorialMethod; state: unknown};
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

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type !== "solveTutorial") return;
  try {
    const result = solve(request.method, request.state);
    self.postMessage(result.TAG === "Ok"
      ? {id: request.id, ok: true, solution: result._0}
      : {id: request.id, ok: false, error: describeFailure(request.method, result._0)});
  } catch (error) {
    self.postMessage({id: request.id, ok: false, error: error instanceof Error ? error.message : "The background solver stopped unexpectedly."});
  }
});
