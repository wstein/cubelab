import {importedPatterns} from "./patterns.generated";
import {
  patternStateKey,
  solutionForPatternState,
  type PatternCubeState,
} from "./pattern-state";

export type ImportedPattern = (typeof importedPatterns)[number];

export type RecognizedPattern = {
  pattern: ImportedPattern;
  aliases: ImportedPattern[];
  solution: string | null;
};

const patternsByKey = new Map<string, ImportedPattern[]>();
for (const pattern of importedPatterns) {
  const key = `${pattern.size}:${pattern.stateKey}`;
  const group = patternsByKey.get(key) ?? [];
  group.push(pattern);
  patternsByKey.set(key, group);
}

export const patternsForSize = (size: number, query = ""): ImportedPattern[] => {
  const needle = query.trim().toLocaleLowerCase();
  return importedPatterns.filter((pattern) =>
    pattern.size === size && (
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

export const patternCount = importedPatterns.length;

