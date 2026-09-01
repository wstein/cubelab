import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as MoveTransform from "../Move/MoveTransform.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";

export type PatternCubeState = {size: number; facelets: string[][]};

type Result<T> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: unknown};

type Orientation = {
  alg: unknown[];
  rotatedSolved: PatternCubeState;
};

const orientationCache = new Map<number, Orientation[]>();

const parse = (size: number, notation: string): unknown[] => {
  const parsed = MoveParser.parseWithOptions(size, "Wide", "Modern", notation) as Result<unknown[]>;
  if (parsed.TAG === "Error") throw new Error(`Cannot parse ${size}x${size} notation: ${notation}`);
  return parsed._0;
};

const apply = (state: PatternCubeState, alg: unknown[]): PatternCubeState => {
  const applied = MoveExecutor.applyAlg(state, alg) as Result<PatternCubeState>;
  if (applied.TAG === "Error") throw new Error("Cannot replay pattern notation.");
  return applied._0;
};

const solved = (size: number): PatternCubeState => {
  const result = StateTypes.solved(size) as Result<PatternCubeState>;
  if (result.TAG === "Error") throw new Error(`Unsupported pattern size: ${size}`);
  return result._0;
};

const orientationAlgorithms = (size: number): Orientation[] => {
  const cached = orientationCache.get(size);
  if (cached) return cached;

  const origin = solved(size);
  const generators = [parse(size, "x"), parse(size, "y"), parse(size, "z")];
  const found: Orientation[] = [{alg: [], rotatedSolved: origin}];
  const seen = new Set([FaceletCodec.render(origin)]);
  for (let cursor = 0; cursor < found.length && found.length < 24; cursor += 1) {
    for (const generator of generators) {
      const alg = [...found[cursor].alg, ...generator];
      const rotatedSolved = apply(origin, alg);
      const key = FaceletCodec.render(rotatedSolved);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({alg, rotatedSolved});
    }
  }
  if (found.length !== 24) throw new Error(`Expected 24 cube orientations, found ${found.length}.`);
  orientationCache.set(size, found);
  return found;
};

const conjugatedFacelets = (
  state: PatternCubeState,
  orientation: Orientation,
): string => {
  const rotated = apply(state, orientation.alg);
  const colourMap = new Map<string, string>();
  const order = StateTypes.storageOrder as string[];
  for (let faceIndex = 0; faceIndex < order.length; faceIndex += 1) {
    const originalColour = orientation.rotatedSolved.facelets[faceIndex][0];
    colourMap.set(originalColour, order[faceIndex]);
  }
  return rotated.facelets
    .map((face) => face.map((colour) => colourMap.get(colour) ?? colour))
    .map((face) => face.join(""))
    .join("");
};

/** A visual pattern identity invariant under the 24 ways of holding a cube. */
export const patternStateKey = (state: PatternCubeState): string => {
  const variants = orientationAlgorithms(state.size).map((orientation) =>
    state.size === 2
      ? FaceletCodec.render(apply(state, orientation.alg))
      : conjugatedFacelets(state, orientation)
  );
  variants.sort();
  return variants[0];
};

export const patternStateFromAlgorithm = (size: number, notation: string): PatternCubeState =>
  apply(solved(size), parse(size, notation));

export const inverseAlgorithm = (size: number, notation: string): string => {
  const alg = parse(size, notation);
  return MoveTransform.serialize(MoveTransform.invert(alg));
};

export const algorithmSolvesState = (
  state: PatternCubeState,
  notation: string,
): boolean => {
  const candidate = apply(state, parse(state.size, notation));
  return FaceletCodec.render(candidate) === FaceletCodec.render(solved(state.size));
};

const reframedAlgorithms = (alg: unknown[]): unknown[][] => {
  const found: unknown[][] = [alg];
  const seen = new Set([MoveTransform.serialize(alg)]);
  for (let cursor = 0; cursor < found.length && found.length < 24; cursor += 1) {
    for (const axis of ["X", "Y", "Z"] as const) {
      const candidate = MoveTransform.rotate(found[cursor], axis, 1);
      const key = MoveTransform.serialize(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(candidate);
    }
  }
  return found;
};

/** Return a catalog solution rewritten for the detected holding, with replay proof. */
export const solutionForPatternState = (
  state: PatternCubeState,
  solution: string,
): string | null => {
  const solutionAlg = parse(state.size, solution);
  if (state.size === 2) {
    for (const orientation of orientationAlgorithms(state.size)) {
      const candidate = [...MoveTransform.invert(orientation.alg), ...solutionAlg];
      if (FaceletCodec.render(apply(state, candidate)) === FaceletCodec.render(solved(2))) {
        return MoveTransform.serialize(candidate);
      }
    }
    return null;
  }
  for (const candidate of reframedAlgorithms(solutionAlg)) {
    if (FaceletCodec.render(apply(state, candidate)) === FaceletCodec.render(solved(state.size))) {
      return MoveTransform.serialize(candidate);
    }
  }
  return null;
};
