// Hand-curated additions and annotations for mathematically extremal cube
// states (proven antipodes of the solved state under a specific move
// metric). Unlike patterns.generated.ts, nothing here is imported from
// flix-cubesolve: every entry is sourced from a cited academic/reference
// page and replay-verified against this app's own move engine before being
// added (see docs/pattern-provenance.md).

export type CuratedPattern = {
  size: number;
  name: string;
  canonical: string;
  sourceId: string;
  sourceUrl: string;
  publishedNotation: string;
  construction: string;
  solution: string;
  solutionKind: string;
  stateKey: string;
};

// Additional patterns not present in the flix-cubesolve import. Each
// construction and its inverse solution were replayed against this app's
// MoveExecutor to confirm they reach the cited state and return to solved.
export const curatedPatterns: CuratedPattern[] = [
  {
    size: 3,
    name: "Superflip + Fourspot",
    canonical: "",
    sourceId: "cube20qtm",
    sourceUrl: "https://cube20.org/qtm/",
    publishedNotation: "U2 F U2 R' L F2 U F' B' R L U2 R U D' R L' D R' L' D2",
    construction: "U2 F U2 R' L F2 U F' B' R L U2 R U D' R L' D R' L' D2",
    solution: "D2 L R D' L R' D U' R' U2 L' R' B F U' F2 L' R U2 F' U2",
    solutionKind: "published inverse",
    stateKey: "DBDRULDFDRDRBLFRURFDFRFLFUFLDLFRBLULBDBLBRBUBUFURDLUBU",
  },
];

export type ExtremalStateTag = {
  label: string;
  referenceLabel: string;
  referenceUrl: string;
};

// Keyed by pattern name, matched against entries in the merged catalog
// (imported + curated). A name match is sufficient here because both sides
// of the mapping are maintained together in this file and patterns.ts.
const extremalStateTags: Record<string, ExtremalStateTag> = {
  "Superflip": {
    label: "God's Number antipode · 20 HTM (proven, Reid 1995)",
    referenceLabel: "Wikipedia — Superflip",
    referenceUrl: "https://en.wikipedia.org/wiki/Superflip",
  },
  "Superflip + Fourspot": {
    label: "Unique known QTM antipode · 26 QTM (proven, Reid 1998)",
    referenceLabel: "cube20.org — God's Number is 26 in the Quarter Turn Metric",
    referenceUrl: "https://cube20.org/qtm/",
  },
};

export const extremalStateFor = (name: string): ExtremalStateTag | null =>
  extremalStateTags[name] ?? null;
