import type {SmartCubeBrand} from "./types";

export type SmartCubeMotionProfile = {
  label: string;
  orientationRingSamples: number;
  rotationDropThresholdDegrees: number;
  rotationDropPreviousSamples: number;
  rotationDropFollowingSamples: number;
  correctionErrorDivisor: number;
};

export type SmartCubeMotionProfileRegistry = {
  version: number;
  default: SmartCubeMotionProfile;
  profiles: Partial<Record<SmartCubeBrand, SmartCubeMotionProfile>>;
};

export const defaultMotionProfile: SmartCubeMotionProfile = {
  label: "Default",
  orientationRingSamples: 3,
  rotationDropThresholdDegrees: 5,
  rotationDropPreviousSamples: 2,
  rotationDropFollowingSamples: 2,
  correctionErrorDivisor: 5,
};

const profile = (value: unknown): SmartCubeMotionProfile | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const numbers = ["orientationRingSamples", "rotationDropThresholdDegrees", "rotationDropPreviousSamples", "rotationDropFollowingSamples", "correctionErrorDivisor"];
  if (typeof candidate.label !== "string" || !numbers.every((key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key]))) return null;
  if (candidate.orientationRingSamples < 1 || candidate.rotationDropThresholdDegrees <= 0 || candidate.rotationDropPreviousSamples < 0 || candidate.rotationDropFollowingSamples < 0 || candidate.correctionErrorDivisor <= 0) return null;
  return {
    label: candidate.label,
    orientationRingSamples: Math.floor(candidate.orientationRingSamples),
    rotationDropThresholdDegrees: candidate.rotationDropThresholdDegrees,
    rotationDropPreviousSamples: Math.floor(candidate.rotationDropPreviousSamples),
    rotationDropFollowingSamples: Math.floor(candidate.rotationDropFollowingSamples),
    correctionErrorDivisor: candidate.correctionErrorDivisor,
  };
};

export const parseMotionProfileRegistry = (value: unknown): SmartCubeMotionProfileRegistry | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const fallback = profile(candidate.default);
  if (candidate.version !== 1 || !fallback || !candidate.profiles || typeof candidate.profiles !== "object") return null;
  const profiles = Object.fromEntries(
    Object.entries(candidate.profiles as Record<string, unknown>)
      .flatMap(([brand, entry]) => {
        const parsed = profile(entry);
        return parsed && ["gan", "giiker", "gocube", "moyu"].includes(brand) ? [[brand, parsed]] : [];
      }),
  ) as SmartCubeMotionProfileRegistry["profiles"];
  return {version: 1, default: fallback, profiles};
};

export const motionProfileFor = (
  registry: SmartCubeMotionProfileRegistry | null,
  brand: SmartCubeBrand,
): SmartCubeMotionProfile => registry?.profiles[brand] ?? registry?.default ?? defaultMotionProfile;
