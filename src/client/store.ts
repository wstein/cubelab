import type {CubeStyle} from "./cube-gl";

export type SchemeName = "Western" | "Japanese" | "Custom";
export type LowercaseMode = "Wide" | "InnerSlice";
export type NotationDialect = "Modern" | "Ruwix" | "Twizzle" | "Sse" | "Acube";
export type ActiveTab = "converter" | "academy" | "workbench" | "patterns" | "timer";
export type AcademyMethod =
  | "twoByTwoBeginner"
  | "beginner"
  | "advancedLbl"
  | "beginnerCfop"
  | "fullCfop"
  | "advancedCfop"
  | "petrus"
  | "enhancedPetrus"
  | "reduction4x4";

export type AppState = {
  size: number;
  input: string;
  moves: string;
  scheme: SchemeName;
  customScheme: string;
  lowercaseMode: LowercaseMode;
  notationDialect: NotationDialect;
  cubeStyle: CubeStyle;
  turnGuides: boolean;
  autoOrbit: boolean;
  activeTab: ActiveTab;
  academyMethod: AcademyMethod;
  note: string;
};

export const defaultAppState: AppState = {
  size: 3,
  input: "",
  moves: "",
  scheme: "Western",
  customScheme: "WOGRBY",
  lowercaseMode: "Wide",
  notationDialect: "Modern",
  cubeStyle: "Standard",
  turnGuides: true,
  autoOrbit: false,
  activeTab: "converter",
  academyMethod: "beginner",
  note: "",
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
  const notationDialect: NotationDialect = params.get("dialect") === "Ruwix"
    ? "Ruwix"
    : params.get("dialect") === "Twizzle"
      ? "Twizzle"
      : params.get("dialect") === "Sse"
        ? "Sse"
        : params.get("dialect") === "Acube"
          ? "Acube"
          : "Modern";
  const requestedStyle = params.get("style");
  const cubeStyle: CubeStyle = requestedStyle === "Speed" ? "Speed" : "Standard";
  const turnGuides = params.get("guides") !== "off";
  const autoOrbit = params.get("orbit") === "on";
  const requestedTab = params.get("tab");
  const activeTab: ActiveTab = requestedTab === "academy" || requestedTab === "beginner" || requestedTab === "cfop"
    ? "academy"
    : requestedTab === "workbench"
      ? "workbench"
    : requestedTab === "patterns"
      ? "patterns"
      : requestedTab === "timer"
        ? "timer"
      : "converter";
  const requestedMethod = params.get("method");
  const academyMethod: AcademyMethod = requestedMethod === "petrus"
      || requestedMethod === "classicalPetrus"
      ? "petrus"
      : requestedMethod === "enhancedPetrus" || requestedMethod === "modernPetrus"
        ? "enhancedPetrus"
      : requestedMethod === "advancedLbl"
      ? "advancedLbl"
      : requestedMethod === "beginnerCfop"
      || requestedMethod === "intermediate"
      || requestedMethod === "easyCfop"
      ? "beginnerCfop"
      : requestedMethod === "advancedCfop" || requestedMethod === "advanced"
        ? "advancedCfop"
        : requestedMethod === "reduction4x4" || requestedMethod === "reduction"
          ? "reduction4x4"
        : requestedMethod === "fullCfop" || requestedMethod === "cfop" || requestedTab === "cfop"
          ? "fullCfop"
          : "beginner";
  const input = (params.get("alg") ?? "").slice(0, 20_000);
  const moves = (params.get("moves") ?? "").slice(0, 20_000);
  const note = (params.get("note") ?? "").slice(0, 200);
  return {
    size,
    input,
    moves,
    scheme,
    customScheme,
    lowercaseMode,
    notationDialect,
    cubeStyle,
    turnGuides,
    autoOrbit,
    activeTab,
    academyMethod,
    note,
  };
};

export const writeHash = (state: AppState): string => {
  const params = new URLSearchParams();
  const note = state.note.slice(0, 200);
  if (state.size !== defaultAppState.size) params.set("size", String(state.size));
  if (state.input !== "") params.set("alg", state.input);
  if (state.moves !== "") params.set("moves", state.moves);
  if (note !== "") params.set("note", note);
  if (state.scheme !== "Western") params.set("scheme", state.scheme);
  if (state.scheme === "Custom") params.set("custom", state.customScheme);
  if (state.lowercaseMode !== "Wide") params.set("lowercase", state.lowercaseMode);
  if (state.notationDialect !== "Modern") params.set("dialect", state.notationDialect);
  if (state.cubeStyle !== "Standard") params.set("style", state.cubeStyle);
  if (!state.turnGuides) params.set("guides", "off");
  if (state.autoOrbit) params.set("orbit", "on");
  if (state.activeTab !== "converter") params.set("tab", state.activeTab);
  if (state.activeTab === "academy" && state.academyMethod !== "beginner") {
    params.set("method", state.academyMethod);
  }
  const encoded = params.toString();
  return encoded === "" ? "" : `#${encoded}`;
};

export const tabForPath = (pathname: string): ActiveTab | null => {
  const clean = pathname.replace(/\/+$/, "");
  if (clean === "/academy") return "academy";
  if (clean === "/workbench") return "workbench";
  if (clean === "/patterns") return "patterns";
  if (clean === "/timer") return "timer";
  if (clean === "" || clean === "/") return "converter";
  return null;
};

export const pathForTab = (tab: ActiveTab): string => {
  switch (tab) {
    case "academy":
      return "/academy";
    case "workbench":
      return "/workbench";
    case "patterns":
      return "/patterns";
    case "timer":
      return "/timer";
    case "converter":
    default:
      return "/";
  }
};

export const readLocation = (location: {pathname?: string; hash?: string; search?: string}): AppState => {
  const hash = location.hash ?? "";
  const state = readHash(hash);
  const clean = (location.pathname ?? "").replace(/\/+$/, "");
  // A clean route is the explicit workspace selection. Legacy root links still
  // use #tab, but a conflicting hash cannot make /timer render Academy. The
  // root path itself is not a "clean route" for this purpose: tabForPath("/")
  // resolves it to "converter" so hashForPath can omit a redundant tab=
  // param, but that same answer would wrongly override every #tab= on a bare
  // "/" link, which is exactly the legacy form this comment says to honour.
  const pathTab = clean === "" || clean === "/" ? null : tabForPath(clean);
  if (pathTab !== null) {
    return {...state, activeTab: pathTab};
  }
  return state;
};

export const hashForPath = (state: AppState, pathname: string): string => {
  const params = new URLSearchParams(writeHash(state).replace(/^#/, ""));
  if (tabForPath(pathname) === state.activeTab) params.delete("tab");
  const encoded = params.toString();
  return encoded === "" ? "" : `#${encoded}`;
};

export const synchronizeHash = (store: AppStore, target: Window, delay = 300): (() => void) => {
  let timeout: number | null = null;
  let readingNavigation = false;
  let previousState = store.get();

  const sync = (state: AppState, push: boolean) => {
    const isPlayer = target.location.pathname.replace(/\/+$/, "") === "/player";
    const targetPath = isPlayer ? "/player" : pathForTab(state.activeTab);
    const hash = isPlayer ? writeHash(state) : hashForPath(state, targetPath);
    const targetUrl = `${targetPath}${target.location.search}${hash}`;
    const currentUrl = `${target.location.pathname}${target.location.search}${target.location.hash}`;
    if (currentUrl !== targetUrl) {
      if (push) {
        target.history.pushState(null, "", targetUrl);
      } else {
        target.history.replaceState(null, "", targetUrl);
      }
    }
  };

  const unsubscribe = store.subscribe((state) => {
    if (readingNavigation) return;
    const isDiscreteNav = state.activeTab !== previousState.activeTab
      || state.academyMethod !== previousState.academyMethod;
    previousState = state;

    if (isDiscreteNav) {
      if (timeout !== null) {
        target.clearTimeout(timeout);
        timeout = null;
      }
      sync(state, true);
    } else {
      if (timeout !== null) target.clearTimeout(timeout);
      timeout = target.setTimeout(() => {
        timeout = null;
        sync(state, false);
      }, delay);
    }
  });

  const navigate = () => {
    readingNavigation = true;
    const next = readLocation(target.location);
    previousState = next;
    store.replace(next);
    readingNavigation = false;
  };

  target.addEventListener("hashchange", navigate);
  target.addEventListener("popstate", navigate);

  return () => {
    unsubscribe();
    target.removeEventListener("hashchange", navigate);
    target.removeEventListener("popstate", navigate);
    if (timeout !== null) target.clearTimeout(timeout);
  };
};
