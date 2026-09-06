import type {SmartCubeBrand} from "./types";

export type SmartCubeMotionProfile = {
  label: string;
  anchorWindowMs: number;
  anchorSamples: number;
  maximumAnchorDeviationDegrees: number;
  maximumPostTurnDeviationDegrees: number;
  maximumCorrectionStepDegrees: number;
  maximumTargetErrorDegrees: number;
};

export type SmartCubeMotionProfileRegistry = {
  version: number;
  default: SmartCubeMotionProfile;
  profiles: Partial<Record<SmartCubeBrand, SmartCubeMotionProfile>>;
};

export const defaultMotionProfile: SmartCubeMotionProfile = {
  label: "Default",
  anchorWindowMs: 200,
  anchorSamples: 3,
  maximumAnchorDeviationDegrees: 10,
  maximumPostTurnDeviationDegrees: 10,
  maximumCorrectionStepDegrees: 1,
  maximumTargetErrorDegrees: 30,
};

const profile = (value: unknown): SmartCubeMotionProfile | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const numbers = ["anchorWindowMs", "anchorSamples", "maximumAnchorDeviationDegrees", "maximumPostTurnDeviationDegrees", "maximumCorrectionStepDegrees", "maximumTargetErrorDegrees"];
  if (typeof candidate.label !== "string" || !numbers.every((key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key]))) return null;
  if (candidate.anchorWindowMs < 100 || candidate.anchorSamples < 1 || candidate.maximumAnchorDeviationDegrees <= 0 || candidate.maximumPostTurnDeviationDegrees <= 0 || candidate.maximumCorrectionStepDegrees <= 0 || candidate.maximumTargetErrorDegrees <= 0) return null;
  return {
    label: candidate.label,
    anchorWindowMs: candidate.anchorWindowMs,
    anchorSamples: Math.floor(candidate.anchorSamples),
    maximumAnchorDeviationDegrees: candidate.maximumAnchorDeviationDegrees,
    maximumPostTurnDeviationDegrees: candidate.maximumPostTurnDeviationDegrees,
    maximumCorrectionStepDegrees: candidate.maximumCorrectionStepDegrees,
    maximumTargetErrorDegrees: candidate.maximumTargetErrorDegrees,
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
