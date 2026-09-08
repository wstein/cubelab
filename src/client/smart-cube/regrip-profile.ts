import type {SmartCubeBrand} from "./types";

export type RegripProfile = {
  label: string;
  /** Cumulative rotation from the last confirmed pose that fires a regrip. */
  regripThresholdDegrees: number;
};

export type RegripProfileRegistry = {
  version: number;
  default: RegripProfile;
  profiles: Partial<Record<SmartCubeBrand, RegripProfile>>;
};

export const defaultRegripProfile: RegripProfile = {
  label: "Default",
  regripThresholdDegrees: 60,
};

const KNOWN_BRANDS: SmartCubeBrand[] = ["gan", "giiker", "gocube", "moyu"];

const profile = (value: unknown): RegripProfile | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const numbers = ["regripThresholdDegrees"];
  if (
    typeof candidate.label !== "string"
    || !numbers.every((key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key]))
  ) {
    return null;
  }
  const regripThresholdDegrees = candidate.regripThresholdDegrees as number;
  // Every pair of the cube's 24 legal poses is exactly 90° apart, so a
  // threshold at or past 90° could never fire, and one at or below 0° would
  // fire on sensor noise alone.
  if (regripThresholdDegrees <= 0 || regripThresholdDegrees >= 90) {
    return null;
  }
  return {
    label: candidate.label,
    regripThresholdDegrees,
  };
};

export const parseRegripProfileRegistry = (value: unknown): RegripProfileRegistry | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const fallback = profile(candidate.default);
  if (candidate.version !== 1 || !fallback || !candidate.profiles || typeof candidate.profiles !== "object") {
    return null;
  }
  const profiles = Object.fromEntries(
    Object.entries(candidate.profiles as Record<string, unknown>)
      .flatMap(([brand, entry]) => {
        const parsed = profile(entry);
        return parsed && (KNOWN_BRANDS as string[]).includes(brand) ? [[brand, parsed]] : [];
      }),
  ) as RegripProfileRegistry["profiles"];
  return {version: 1, default: fallback, profiles};
};

export const regripProfileFor = (
  registry: RegripProfileRegistry | null,
  brand: SmartCubeBrand,
): RegripProfile => registry?.profiles[brand] ?? registry?.default ?? defaultRegripProfile;
