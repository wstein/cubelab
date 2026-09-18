import type {NotationDialect} from "./store";

// SSE's prefixed moves are unambiguous in CubeLab's other dialects. A token
// boundary is required so ordinary comments and words do not switch parsers.
const ssePrefixedMove = /(?:^|[\s·.([{<])(?:[TNVMWSC](?:\d+(?:-\d+)?)?[ULFRBD])/;
const jaapSuffixedMove = /(?:^|[\s.([{<])[ULFRBD][asmc](?:\d+'?|')?(?=$|[\s·.()[\]{}<>;])/;

/** Selects unambiguous Jaap or SSE spellings without changing the saved dialect. */
export const dialectForAlgorithmInput = (
  size: number,
  selected: NotationDialect,
  input: string,
): NotationDialect => {
  const source = input.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*/g, " ");
  if (size >= 2 && size <= 5 && jaapSuffixedMove.test(source)) return "Jaap";
  return size >= 2 && size <= 5 && (source.includes("·") || ssePrefixedMove.test(source))
    ? "Sse"
    : selected;
};
