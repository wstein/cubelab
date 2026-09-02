import {importedPatterns} from "./patterns.generated";
import {curatedPatterns, extremalStateFor, type CuratedPattern} from "./extremal-states";
import {
  patternStateKey,
  solutionForPatternState,
} from "../State/PatternState.res.mjs";
import type {cubeState as PatternCubeState} from "../State/StateTypes.res.mjs";

export type ImportedPattern = CuratedPattern;

const allPatterns: ImportedPattern[] = [...importedPatterns, ...curatedPatterns];

export type RecognizedPattern = {
  pattern: ImportedPattern;
  aliases: ImportedPattern[];
  solution: string | null;
};

const patternsByKey = new Map<string, ImportedPattern[]>();
for (const pattern of allPatterns) {
  const key = `${pattern.size}:${pattern.stateKey}`;
  const group = patternsByKey.get(key) ?? [];
  group.push(pattern);
  patternsByKey.set(key, group);
}

export const patternsForSize = (
  size: number,
  query = "",
  extremalOnly = false,
): ImportedPattern[] => {
  const needle = query.trim().toLocaleLowerCase();
  return allPatterns.filter((pattern) =>
    pattern.size === size
    && (!extremalOnly || extremalStateFor(pattern.name) !== null)
    && (
      needle === ""
      || pattern.name.toLocaleLowerCase().includes(needle)
      || pattern.sourceId.toLocaleLowerCase().includes(needle)
    )
  );
};

export const recognizePattern = (state: PatternCubeState): RecognizedPattern | null => {
  const matches = patternsByKey.get(`${state.size}:${patternStateKey(state)}`);
  if (!matches?.length) return null;
  const pattern = matches[0];
  return {
    pattern,
    aliases: matches.slice(1),
    solution: solutionForPatternState(state, pattern.solution),
  };
};

export const patternCount = allPatterns.length;

export {extremalStateFor, type ExtremalStateTag} from "./extremal-states";
