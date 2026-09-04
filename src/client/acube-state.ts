import {isFixedAcubeConstraint, materializeAcubeConstraint, parseAcubeConstraint} from "./acube-engine";
import type {CubeState} from "./cube-gl";

type Result<T, E> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};
export type AcubeStateImport = {state: CubeState};

/**
 * Identifies ACube's 3×3 state language without stealing lower-case SSE cycles.
 * Selecting the ACube dialect opts into the otherwise ambiguous lower-case form.
 */
export const looksLikeAcubeState = (input: string, explicitDialect = false): boolean => {
  if (!explicitDialect && !/[A-Z]/.test(input)) return false;
  if (/[\[\]@?]/.test(input) || /\b[UDFBLR]{2,3}[+\-](?=$|\s|,)/.test(input)) return true;
  if (/\(\s*[UDFBLR]{2,3}(?:\s*,|\s+[UDFBLR]{2,3})/i.test(input)) return true;
  const terms = input.trim().split(/[\s,]+/).filter(Boolean);
  return terms.length === 20 && terms.every((term) => /^@?[+\-]?[UDFBLR?]{2,3}$/i.test(term));
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
