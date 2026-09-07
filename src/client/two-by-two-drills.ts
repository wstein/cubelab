/** Replayable, centreless drills aligned to the three 2×2 Academy phases. */
export type TwoByTwoDrillFamily = "FirstLayer" | "OLL" | "PBL";
export type TwoByTwoDrillCase = {
  id: string;
  family: TwoByTwoDrillFamily;
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
