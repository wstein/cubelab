// Local-device preferences, distinct from AppState: AppState is serialized
// into the URL hash so a link fully reproduces a cube/algorithm setup, while
// these are per-device viewport/tooling defaults that must never leak into a
// shareable URL.

export type Preferences = {
  playbackSpeed: number;
  tnoodleEnabled: boolean;
  tnoodleServerUrl: string;
  tnoodleEvent: "333";
  tnoodleVerifiedUrl: string | null;
  tnoodleVerifiedEvent: "333" | null;
  inspectionSeconds: number;
};

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const PREFERENCES_STORAGE_KEY = "cubelab-preferences-v1";

export const validPlaybackSpeeds = [0.2, 0.5, 1, 2, 5, 10] as const;

export const defaultPreferences: Preferences = {
  playbackSpeed: 1,
  tnoodleEnabled: false,
  tnoodleServerUrl: "http://localhost:2014",
  tnoodleEvent: "333",
  tnoodleVerifiedUrl: null,
  tnoodleVerifiedEvent: null,
  inspectionSeconds: 15,
};

const validPlaybackSpeed = (value: unknown): value is number =>
  typeof value === "number" && (validPlaybackSpeeds as readonly number[]).includes(value);

const validPreferences = (value: unknown): value is Partial<Preferences> => {
  if (typeof value !== "object" || value === null) return false;
  const prefs = value as Partial<Preferences>;
  return (prefs.playbackSpeed === undefined || validPlaybackSpeed(prefs.playbackSpeed))
    && (prefs.tnoodleEnabled === undefined || typeof prefs.tnoodleEnabled === "boolean")
    && (prefs.tnoodleServerUrl === undefined || typeof prefs.tnoodleServerUrl === "string")
    && (prefs.tnoodleEvent === undefined || prefs.tnoodleEvent === "333")
    && (prefs.tnoodleVerifiedUrl === undefined || prefs.tnoodleVerifiedUrl === null
      || typeof prefs.tnoodleVerifiedUrl === "string")
    && (prefs.tnoodleVerifiedEvent === undefined || prefs.tnoodleVerifiedEvent === null
      || prefs.tnoodleVerifiedEvent === "333")
    && (prefs.inspectionSeconds === undefined
      || (typeof prefs.inspectionSeconds === "number" && Number.isFinite(prefs.inspectionSeconds)
        && prefs.inspectionSeconds > 0));
};

export const readPreferences = (storage: StorageLike): Preferences => {
  try {
    const parsed = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY) ?? "{}") as unknown;
    return validPreferences(parsed) ? {...defaultPreferences, ...parsed} : {...defaultPreferences};
  } catch {
    return {...defaultPreferences};
  }
};

export const hasVerifiedTnoodle = (preferences: Preferences): boolean =>
  preferences.tnoodleVerifiedUrl === preferences.tnoodleServerUrl
  && preferences.tnoodleVerifiedEvent === preferences.tnoodleEvent;

export const writePreferences = (storage: StorageLike, preferences: Preferences): boolean => {
  try {
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
};
