import type {NotationDialect} from "./store";

// SSE's prefixed moves are unambiguous in CubeLab's other dialects. A token
// boundary is required so ordinary comments and words do not switch parsers.
const ssePrefixedMove = /(?:^|[\s·.([{<])(?:[TNVMWSC](?:\d+(?:-\d+)?)?[ULFRBD])/;

/** Selects SSE for pasted catalogue delimiters or native prefixed moves. */
export const dialectForAlgorithmInput = (
  size: number,
  selected: NotationDialect,
  input: string,
): NotationDialect => {
  const source = input.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*/g, " ");
  return size >= 2 && size <= 5 && (source.includes("·") || ssePrefixedMove.test(source))
    ? "Sse"
    : selected;
};
