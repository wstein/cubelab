import type {CubeStyle} from "./cube-gl";

export type SchemeName = "Western" | "Japanese" | "Custom";
export type LowercaseMode = "Wide" | "InnerSlice";
export type NotationDialect = "Modern" | "Ruwix";

export type AppState = {
  size: number;
  input: string;
  scheme: SchemeName;
  customScheme: string;
  lowercaseMode: LowercaseMode;
  notationDialect: NotationDialect;
  cubeStyle: CubeStyle;
};

export const defaultAppState: AppState = {
  size: 3,
  input: "",
  scheme: "Western",
  customScheme: "WOGRBY",
  lowercaseMode: "Wide",
  notationDialect: "Modern",
  cubeStyle: "Standard",
};

type Listener = (state: AppState) => void;

export type AppStore = {
  get: () => AppState;
  patch: (changes: Partial<AppState>) => void;
  replace: (state: AppState) => void;
  subscribe: (listener: Listener) => () => void;
};

const equal = (left: AppState, right: AppState): boolean =>
  (Object.keys(left) as Array<keyof AppState>).every((key) => left[key] === right[key]);

export const createStore = (initial: AppState): AppStore => {
  let state = {...initial};
  const listeners = new Set<Listener>();
  const replace = (next: AppState) => {
    if (equal(state, next)) return;
    state = {...next};
    listeners.forEach((listener) => listener(state));
  };
  return {
    get: () => state,
    patch: (changes) => replace({...state, ...changes}),
    replace,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const validCustomScheme = (value: string): boolean =>
  /^[A-Z]{6}$/.test(value) && new Set(value).size === 6;

export const readHash = (hash: string): AppState => {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const requestedSize = Number(params.get("size"));
  const size = Number.isInteger(requestedSize) && requestedSize >= 2 && requestedSize <= 5
    ? requestedSize
    : defaultAppState.size;
  const requestedScheme = params.get("scheme");
  const scheme: SchemeName =
    requestedScheme === "Japanese" || requestedScheme === "Custom"
      ? requestedScheme
      : "Western";
  const requestedCustom = (params.get("custom") ?? "").toUpperCase();
  const customScheme = validCustomScheme(requestedCustom)
    ? requestedCustom
    : defaultAppState.customScheme;
  const lowercaseMode: LowercaseMode =
    params.get("lowercase") === "InnerSlice" ? "InnerSlice" : "Wide";
  const notationDialect: NotationDialect = params.get("dialect") === "Ruwix" ? "Ruwix" : "Modern";
  const cubeStyle: CubeStyle = params.get("style") === "Speed" ? "Speed" : "Standard";
  const input = (params.get("alg") ?? "").slice(0, 20_000);
  return {size, input, scheme, customScheme, lowercaseMode, notationDialect, cubeStyle};
};

export const writeHash = (state: AppState): string => {
  const params = new URLSearchParams();
  params.set("size", String(state.size));
  if (state.input !== "") params.set("alg", state.input);
  if (state.scheme !== "Western") params.set("scheme", state.scheme);
  if (state.scheme === "Custom") params.set("custom", state.customScheme);
  if (state.lowercaseMode !== "Wide") params.set("lowercase", state.lowercaseMode);
  if (state.notationDialect !== "Modern") params.set("dialect", state.notationDialect);
  if (state.cubeStyle !== "Standard") params.set("style", state.cubeStyle);
  return `#${params.toString()}`;
};

export const synchronizeHash = (store: AppStore, target: Window, delay = 300): (() => void) => {
  let timeout: number | null = null;
  let readingNavigation = false;
  const unsubscribe = store.subscribe((state) => {
    if (readingNavigation) return;
    if (timeout !== null) target.clearTimeout(timeout);
    timeout = target.setTimeout(() => {
      timeout = null;
      const hash = writeHash(state);
      if (target.location.hash !== hash) {
        target.history.replaceState(null, "", `${target.location.pathname}${target.location.search}${hash}`);
      }
    }, delay);
  });
  const navigate = () => {
    readingNavigation = true;
    store.replace(readHash(target.location.hash));
    readingNavigation = false;
  };
  target.addEventListener("hashchange", navigate);
  return () => {
    unsubscribe();
    target.removeEventListener("hashchange", navigate);
    if (timeout !== null) target.clearTimeout(timeout);
  };
};
