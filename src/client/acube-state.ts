import {isFixedAcubeConstraint, materializeAcubeConstraint, parseAcubeConstraint} from "./acube-engine";
import type {CubeState} from "./cube-gl";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};
export type AcubeStateImport = {state: CubeState};

const stripComments = (text: string): string =>
  text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, " ").trim();

const isDistinctCubie = (name: string): boolean =>
  (name.length === 2 || name.length === 3) &&
  /^[udfblr]+$/i.test(name) &&
  new Set(name.toLowerCase()).size === name.length;

const hasAcubeCycle = (text: string): boolean => {
  for (const match of text.matchAll(/\(([^()]+)\)/g)) {
    const tokens = match[1]!.trim().split(/[\s,]+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.every(isDistinctCubie)) {
      return true;
    }
  }
  return false;
};

const hasAcubeIgnored = (text: string): boolean => {
  for (const match of text.matchAll(/\[([^\[\]]+)\]/g)) {
    const inner = match[1]!;
    if (inner.includes(":") || inner.includes(",")) continue;
    const tokens = inner.trim().split(/[\s,]+/).filter(Boolean);
    if (
      tokens.length > 0 &&
      tokens.every(
        (token) =>
          /^[udfblr]\*$/i.test(token) ||
          /^(?:rl|lr|m|e|s)$/i.test(token) ||
          isDistinctCubie(token),
      )
    ) {
      return true;
    }
  }
  return false;
};

const hasAcubeOrientation = (text: string): boolean => {
  for (const match of text.matchAll(/\b([UDFBLR]{2,3})([+\-?])(?=$|\s|,|\))/gi)) {
    if (isDistinctCubie(match[1]!)) return true;
  }
  return false;
};

const hasAcubeWildcard = (text: string): boolean =>
  /(?:^|\s)(?:@?[+\-]?\?)(?=\s|$|,|\]|\))/i.test(text) ||
  /(?:^|\s)@(?:\?|[+\-]?[UDFBLR]{2,3})(?=\s|$|,|\])/i.test(text);

const isAcubePositional = (text: string): boolean => {
  const terms = text.trim().split(/[\s,]+/).filter(Boolean);
  return (
    terms.length === 20 &&
    terms.every((term) => {
      const match = /^(@)?([+\-])?([UDFBLR?]+)$/i.exec(term);
      if (!match) return false;
      const body = match[3]!;
      return body === "?" || isDistinctCubie(body);
    })
  );
};

/**
 * Identifies ACube's 3×3 state language without stealing lower-case SSE cycles,
 * algorithm groups, timed pauses, or commutators.
 * Selecting the ACube dialect opts into the otherwise ambiguous lower-case form.
 */
export const looksLikeAcubeState = (input: string, explicitDialect = false): boolean => {
  const clean = stripComments(input);
  if (clean === "") return false;
  if (!explicitDialect && !/[A-Z]/.test(clean)) return false;
  return (
    hasAcubeCycle(clean) ||
    hasAcubeIgnored(clean) ||
    hasAcubeOrientation(clean) ||
    hasAcubeWildcard(clean) ||
    isAcubePositional(clean)
  );
};

/** Parses only fixed ACube definitions for Setup; generator constraints stay explicit. */
export const parseAcubeState = (input: string): Result<AcubeStateImport, string> => {
  const constraint = parseAcubeConstraint(input);
  if (constraint.TAG === "Error") return constraint;
  if (!isFixedAcubeConstraint(constraint._0)) {
    return {TAG: "Error", _0: "This ACube definition is not fixed. Use the ACube state generator to materialize a legal completion."};
  }
  const state = materializeAcubeConstraint(constraint._0, "fixed");
  return state.TAG === "Ok" ? {TAG: "Ok", _0: {state: state._0}} : state;
};
