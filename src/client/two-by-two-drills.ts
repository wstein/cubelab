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
    scramble: "R U2 R' U' R U' R'",
  },
  {
    id: "pbl-u-permutation",
    family: "PBL",
    label: "PBL · U permutation",
    scramble: "U",
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
    id: "petrus-back-pair-u",
    family: "BackPair",
    label: "Back pair · U permutation",
    scramble: "U",
  },
  {
    id: "petrus-finish-r",
    family: "Finish",
    label: "Finish · R permutation",
    scramble: "R",
  },
];
