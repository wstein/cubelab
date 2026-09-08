import * as BlockDetector5x5 from "../Solver/Petrus5x5/BlockDetector5x5.res.mjs";
import * as PetrusSolver555 from "../Solver/Petrus5x5/PetrusSolver555.res.mjs";
import type {CubieFocus, GridPosition} from "./tutorial-focus";

export type Petrus5x5Phase = 1 | 2 | 3 | 4 | 5 | 6;

export type Petrus5x5PhaseDefinition = {
  number: number;
  title: string;
  instruction: string;
};

export const petrus5x5PhaseDefinitions: readonly Petrus5x5PhaseDefinition[] = [
  {
    number: 1,
    title: "Build the 2×2×2 Corner Block",
    instruction: "Anchor on the corner with the most solved pieces and assemble the 19-piece composite block. Faces U, R, F and inner slices 2U, 2R, 2F are completely free.",
  },
  {
    number: 2,
    title: "Expand to a 2×2×3 Block",
    instruction: "Extend the 2×2×2 block by adding a 1×3 center bar and edge pair along one face, expanding the locked cluster to 24 pieces.",
  },
  {
    number: 3,
    title: "Orient Outer Midges (EO)",
    instruction: "Detect and orient all remaining outer edges. Once oriented, bad edges drop to 0 and the rest of the solve needs only rotationless ⟨U, R, 2U, 2R⟩ turns.",
  },
  {
    number: 4,
    title: "Wing Pairing & F2L Completion",
    instruction: "Pair the remaining wing edges into 3-edge dedges and insert F2L blocks into the remaining middle layer slots.",
  },
  {
    number: 5,
    title: "Last Layer Finish & Parity",
    instruction: "Solve the last layer with COLL and EPLL (all edges are already oriented). Repair 5×5 OLL or PLL parity if encountered.",
  },
] as const;

export type Petrus5x5Status = {
  ok: boolean;
  phaseNumber: Petrus5x5Phase;
  phaseTitle: string;
  bestAnchor: string;
  block222Progress: {
    piecesSolved: number;
    totalPieces: number;
    faceletsSolved: number;
    isComplete: boolean;
  };
  block223Progress: {
    axis: string;
    piecesSolved: number;
    totalPieces: number;
    isComplete: boolean;
  };
  eoStatus: {
    orientedCount: number;
    badCount: number;
    badSlots: number[];
    isComplete: boolean;
  };
  wingsPaired: number;
  milestoneDescription: string;
  targetCubies: GridPosition[];
};

export const inspectPetrus5x5State = (state: unknown): Petrus5x5Status | null => {
  const result = BlockDetector5x5.inspectPetrus5x5(state);
  if (result.TAG !== "Ok") {
    return null;
  }
  return mapPetrus5x5Inspection(result._0);
};

const mapPetrus5x5Inspection = (
  inspection: ReturnType<typeof BlockDetector5x5.inspectPetrus5x5>["_0"],
): Petrus5x5Status => {
  let phaseNumber: Petrus5x5Phase = 1;

  switch (inspection.currentPhase) {
    case "Phase1_Block222":
      phaseNumber = 1;
      break;
    case "Phase2_Block223":
      phaseNumber = 2;
      break;
    case "Phase3_EdgeOrientation":
      phaseNumber = 3;
      break;
    case "Phase4_WingPairingF2L":
      phaseNumber = 4;
      break;
    case "Phase5_LastLayer":
      phaseNumber = 5;
      break;
    case "PhaseSolved":
      phaseNumber = 6;
      break;
  }

  const axisName =
    inspection.block223.axis === "AxisX"
      ? "X"
      : inspection.block223.axis === "AxisY"
        ? "Y"
        : "Z";

  return {
    ok: true,
    phaseNumber,
    phaseTitle: phaseNumber === 6 ? "Cube Solved" : petrus5x5PhaseDefinitions[phaseNumber - 1].title,
    bestAnchor: BlockDetector5x5.anchorName(inspection.bestAnchor),
    block222Progress: {
      piecesSolved: inspection.block222.piecesSolved,
      totalPieces: inspection.block222.totalPieces,
      faceletsSolved: inspection.block222.faceletsSolved,
      isComplete: inspection.block222.isComplete,
    },
    block223Progress: {
      axis: axisName,
      piecesSolved: inspection.block223.piecesSolved,
      totalPieces: inspection.block223.totalPieces,
      isComplete: inspection.block223.isComplete,
    },
    eoStatus: {
      orientedCount: inspection.eo.orientedCount,
      badCount: inspection.eo.badCount,
      badSlots: inspection.eo.badSlots,
      isComplete: inspection.eo.isComplete,
    },
    wingsPaired: inspection.wingsPaired,
    milestoneDescription: inspection.milestoneDescription,
    targetCubies: inspection.targetCubies as GridPosition[],
  };
};

export const planPetrus5x5Guide = (state: unknown) => {
  const result = PetrusSolver555.planPetrusStep5x5(state);
  if (result.TAG !== "Ok") {
    return null;
  }
  return result._0;
};

type Petrus5x5Evaluation = {
  status: Petrus5x5Status | null;
  guide: ReturnType<typeof planPetrus5x5Guide>;
};

export const evaluatePetrus5x5State = (state: unknown): Petrus5x5Evaluation => {
  const result = PetrusSolver555.evaluatePetrusStep5x5(state);
  return result.TAG === "Ok"
    ? {status: mapPetrus5x5Inspection(result._0.inspection), guide: result._0.guide}
    : {status: null, guide: null};
};

const petrus5x5StateKey = (state: unknown): string | null => {
  if (typeof state !== "object" || state === null) return null;
  const cube = state as {size?: unknown; facelets?: unknown};
  if (cube.size !== 5 || !Array.isArray(cube.facelets) || cube.facelets.length !== 6) return null;
  let key = "";
  // for...of visits sparse entries, unlike Array.every; build identity in the same pass.
  for (const face of cube.facelets) {
    if (!Array.isArray(face) || face.length !== 25) return null;
    for (const sticker of face) {
      if (typeof sticker !== "string" || sticker.length !== 1 || !"ULFRBD".includes(sticker)) return null;
      key += sticker;
    }
  }
  return key;
};

/** One content-addressed entry per Academy instance; never retain state history. */
export const createPetrus5x5EvaluationCache = (
  evaluate = evaluatePetrus5x5State,
) => {
  let cached: {key: string; value: Petrus5x5Evaluation} | null = null;
  return {
    evaluate(state: unknown, active: boolean): Petrus5x5Evaluation | null {
      const key = active ? petrus5x5StateKey(state) : null;
      if (key === null) {
        cached = null;
        return null;
      }
      // Content identity also detects in-place edits and equivalent new objects.
      if (cached?.key !== key) {
        cached = {key, value: structuredClone(evaluate(state))};
      }
      // Callers may annotate results without changing subsequent cached reads.
      return structuredClone(cached.value);
    },
  };
};

export const petrus5x5CubieFocus = (status: Petrus5x5Status): CubieFocus[] => {
  return status.targetCubies.map(([x, y, z]) => ({
    piece: `${x},${y},${z}`,
    source: [x, y, z],
    target: [x, y, z],
    label: status.phaseTitle,
  }));
};
