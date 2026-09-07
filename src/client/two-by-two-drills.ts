/** Replayable, centreless drills aligned to the three 2×2 Academy phases. */
export type TwoByTwoDrillFamily = "FirstLayer" | "OLL" | "PBL";
export type TwoByTwoDrillCase = {
  id: string;
  family: TwoByTwoDrillFamily;
  label: string;
  /** Applied from solved to create the practice state. */
  scramble: string;
};

/** Corner-only drills for the separate, frame-locked Petrus-inspired route. */
export type TwoByTwoPetrusDrillFamily = "FirstSquare" | "BackPair" | "Finish";
export type TwoByTwoPetrusDrillCase = {
  id: string;
  family: TwoByTwoPetrusDrillFamily;
  label: string;
  /** Applied from solved to create the practice state. */
  scramble: string;
};

export const twoByTwoDrillCases: readonly TwoByTwoDrillCase[] = [
  {
    id: "first-layer-right-corner",
    family: "FirstLayer",
    label: "First layer · right corner",
    scramble: "R",
  },
  {
    id: "oll-antisune",
    family: "OLL",
    label: "OLL · Antisune",
    scramble: "R D2 R' D' R D' R'",
  },
  {
    id: "pbl-d-permutation",
    family: "PBL",
    label: "PBL · D permutation",
    scramble: "D",
  },
];

export const twoByTwoPetrusDrillCases: readonly TwoByTwoPetrusDrillCase[] = [
  {
    id: "petrus-first-square-rf",
    family: "FirstSquare",
    label: "First square · R F",
    scramble: "R F",
  },
  {
    id: "petrus-back-pair-d",
    family: "BackPair",
    label: "Back pair · D permutation",
    scramble: "D",
  },
  {
    id: "petrus-finish-r",
    family: "Finish",
    label: "Finish · R permutation",
    scramble: "R",
  },
];
