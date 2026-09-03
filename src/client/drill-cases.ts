import {oll, pll} from "../Solver/CfopCases.res.mjs";

export type DrillCaseFamily = "OLL" | "PLL" | "F2L";
export type DrillCase = {
  id: string;
  family: DrillCaseFamily;
  label: string;
  algorithm: string;
};

type OllCase = {id: number; family: string; algorithm: string};
type PllCase = {id: string; algorithm: string};

const selectedOll = (oll as OllCase[])
  .filter((entry) => [21, 27, 33, 45].includes(entry.id))
  .map((entry) => ({
    id: `oll-${entry.id}`,
    family: "OLL" as const,
    label: `OLL ${entry.id} · ${entry.family}`,
    algorithm: entry.algorithm,
  }));

const selectedPll = (pll as PllCase[])
  .filter((entry) => ["T", "Jb", "Ua", "H"].includes(entry.id))
  .map((entry) => ({
    id: `pll-${entry.id.toLowerCase()}`,
    family: "PLL" as const,
    label: `${entry.id}-Perm`,
    algorithm: entry.algorithm,
  }));

// Compact standard insertions chosen as repeatable first-two-layer drills.
const f2l: DrillCase[] = [
  {id: "f2l-right", family: "F2L", label: "F2L right insert", algorithm: "U R U' R'"},
  {id: "f2l-left", family: "F2L", label: "F2L left insert", algorithm: "U' L' U L"},
  {id: "f2l-pair", family: "F2L", label: "F2L pair trigger", algorithm: "R U R' U'"},
];

/** Curated, executable cases drawn from the same CFOP tables used by the solver. */
export const curatedDrillCases: DrillCase[] = [...selectedOll, ...selectedPll, ...f2l];

export const drillCaseById = (id: string): DrillCase | null =>
  curatedDrillCases.find((entry) => entry.id === id) ?? null;
