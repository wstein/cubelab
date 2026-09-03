import * as ColorCodec from "../State/ColorCodec.res.mjs";
import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as NetCodec from "../State/NetCodec.res.mjs";
import * as Orbit64Codec from "../State/Orbit64Codec.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";
import * as MoveCompatibility from "../Move/MoveCompatibility.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveNiss from "../Move/MoveNiss.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as MoveTransform from "../Move/MoveTransform.res.mjs";
import * as HamiltonMacro from "../Move/HamiltonMacro";
import * as AlgorithmOptimizer from "../Solver/AlgorithmOptimizer.res.mjs";
import {createSolverClient, createTwoPhaseSolverClient} from "./workers/solver-client";
import {mountTimerWorkspace} from "./timer/workspace";
import {createAcademyRequestGuard} from "./academy-request";
import {
  drillCaseById,
  drillCasesForFamily,
  nextDrillRotation as advanceDrillRotation,
  randomDrillCase,
  type DrillCase,
  type DrillFamilyFilter,
} from "./drill-cases";
import {relativeAcademyState, type PieceState} from "./academy-target";
import {
  createCubeViewport,
  focusCameraTarget,
  orientationInViewportFrame,
  turnTransform,
  type CubieFocus,
  type CubePalette,
  type CubeStyle,
  type MoveStep,
  type OrientationCoordinateFrame,
  type OrientationQuaternion,
} from "./cube-gl";
import {
  evaluateAlgorithm,
  buildTimeline,
  describeTimelineGroup,
  isSingleStepExtension,
  MAX_PLAYBACK_STEPS,
  nextSequence,
  planHoverPreview,
  planSequenceStep,
  planTimelineClick,
  physicalMoveProgress,
  stateSnapshotTimeline,
  timelineHoverEnabled,
  tutorialSequenceDescription,
  type AlgorithmTimeline,
} from "./playback";
import {
  createStore,
  readHash,
  synchronizeHash,
  type AcademyMethod,
  type AppState,
  type ActiveTab,
  type LowercaseMode,
  type NotationDialect,
  type SchemeName,
} from "./store";
import {
  focusForPiece,
  phaseMilestonePositions,
  selectPhasePiece,
  selectTutorialPiece,
} from "./tutorial-focus";
import {
  appendRecordedMove,
  assessSmartCubeMove,
  isLastPhysicalMoveInRange,
  nextExpectedSmartCubeAction,
  nextExpectedSmartCubeMove,
  nextSmartCubeProgressMoves,
  smartCubeMoveInLessonFrame,
  controllerMoveInViewportFrame,
  type ExpectedSmartCubeAction,
  type SmartCubeHalfTurnProgress,
  type SmartCubeMoveAssessment,
  type SyncMode,
} from "./smart-cube/live-sync";
import {assessGyroRotation, detectGyroQuarterRotation} from "./smart-cube/orientation-verifier";
import {
  createSmartCubeAudioFeedback,
  readSmartCubeSoundPreference,
  writeSmartCubeSoundPreference,
} from "./smart-cube/audio-feedback";
import {
  assessSmartCubeRecovery,
  beginSmartCubeRecovery,
  quarterTurnsCancel,
  smartCubeRecoveryMatchesExpected,
  smartCubeRecoveryPrompt,
} from "../SmartCube/SmartCubeDeviation.res.mjs";

type SmartCubeRecoveryState = {
  expected: {timelineIndex: number; token: string};
  undoMoves: string[];
  deviations: string[];
};
import {
  extremalStateFor,
  patternCount,
  patternsForSize,
  recognizePattern,
  type ImportedPattern,
  type RecognizedPattern,
} from "./patterns";
import type {
  SmartCubeConnectionState,
  SmartCubeEvent,
  SmartCubeManager,
  SmartCubeOrientationEvent,
} from "./smart-cube/types";

type Result<T, E = StateError | string> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};
type StateError = {_0?: string; TAG: string; actual?: number; character?: string; expected?: number; index?: number};
type CubeState = {size: number; facelets: string[][]};
type Scheme = "Western" | "Japanese" | {TAG: "Custom"; _0: string};
type CompatibilityAssessment = {compatible: boolean; reasons: string[]};
type CompatibilityResult = Record<"wca" | "signLgn" | "cubingJs" | "speedsolving" | "ruwix", CompatibilityAssessment>;
type RecognizedInput = {
  state: CubeState;
  label: string;
  timeline?: AlgorithmTimeline;
  timelineKey?: string;
};
type TutorialMethod = AcademyMethod;
type TutorialPhase = {
  number: number;
  title: string;
  instruction: string;
  alg: unknown[];
  sequences?: string[];
};
type TutorialSolution = {phases: TutorialPhase[]; alg: unknown[]; moveCount: number};
type TwoPhaseSolution = {alg: unknown[]; moveCount: number};
type SavedTutorialSolution = {initialState: CubeState; solution: TutorialSolution};
type TutorialPhaseRange = TutorialPhase & {method: TutorialMethod; start: number; end: number};
type ExpandedTutorialEntry = {comment?: string};
type AcademyElements = {
  method: TutorialMethod;
  label: string;
  phaseCount: number;
  status: HTMLElement;
  current: HTMLElement;
  phases: HTMLElement;
  copy: HTMLButtonElement;
  solution: HTMLElement;
};

const root = document.querySelector<HTMLElement>("[data-converter]");

if (root) {
  let playerMode = window.location.pathname === "/player"
    || new URL(window.location.href).searchParams.get("player") === "1";
  let timerArenaMode = false;
  const playerPageLink = root.querySelector<HTMLAnchorElement>("[data-player-page-link]")!;
  const renderPlayerPresentation = () => {
    document.body.classList.toggle("player-page", playerMode);
    document.body.dataset.theaterMode = timerArenaMode ? "timer" : "playback";
    playerPageLink.href = playerMode ? "/" : "/player";
    playerPageLink.textContent = playerMode ? "Back to studio" : "Full-size player";
    playerPageLink.title = playerMode
      ? "Return to the CubeLab studio (Escape)"
      : "Open the focused full-size player";
  };
  renderPlayerPresentation();
  const input = root.querySelector<HTMLTextAreaElement>("[data-input]")!;
  const movesInput = root.querySelector<HTMLTextAreaElement>("[data-moves-input]")!;
  const schemeSelect = root.querySelector<HTMLSelectElement>("[data-scheme]")!;
  const customScheme = root.querySelector<HTMLInputElement>("[data-custom-scheme]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const error = root.querySelector<HTMLElement>("[data-error]")!;
  const lowercaseControls = root.querySelector<HTMLElement>("[data-lowercase-controls]")!;
  const canvas = root.querySelector<HTMLCanvasElement>("[data-cube-canvas]")!;
  const motionOverlay = root.querySelector<HTMLCanvasElement>("[data-motion-overlay]")!;
  const viewportFallback = root.querySelector<HTMLElement>("[data-viewport-fallback]")!;
  const playback = root.querySelector<HTMLElement>("[data-playback]")!;
  const moveRibbon = root.querySelector<HTMLElement>("[data-move-ribbon]")!;
  const playbackPosition = root.querySelector<HTMLElement>("[data-playback-position]")!;
  const playbackHtm = root.querySelector<HTMLElement>("[data-playback-htm]")!;
  const scrubber = root.querySelector<HTMLInputElement>("[data-playback-scrubber]")!;
  const playbackBegin = root.querySelector<HTMLButtonElement>("[data-playback-begin]")!;
  const playbackReverse = root.querySelector<HTMLButtonElement>("[data-playback-reverse]")!;
  const playbackPause = root.querySelector<HTMLButtonElement>("[data-playback-pause]")!;
  const playbackPlay = root.querySelector<HTMLButtonElement>("[data-playback-play]")!;
  const playbackEnd = root.querySelector<HTMLButtonElement>("[data-playback-end]")!;
  const playbackLimit = root.querySelector<HTMLElement>("[data-playback-limit]")!;
  const shortcutsHelp = root.querySelector<HTMLButtonElement>("[data-shortcuts-help]")!;
  const shortcutsDialog = root.querySelector<HTMLDialogElement>("[data-shortcuts-dialog]")!;
  const shortcutsClose = root.querySelector<HTMLButtonElement>("[data-shortcuts-close]")!;
  const compatibilityStrip = root.querySelector<HTMLElement>("[data-compatibility]")!;
  const patternLibrary = root.querySelector<HTMLDetailsElement>("[data-pattern-library]")!;
  const patternSearch = root.querySelector<HTMLInputElement>("[data-pattern-search]")!;
  const patternSelect = root.querySelector<HTMLSelectElement>("[data-pattern-select]")!;
  const patternName = root.querySelector<HTMLElement>("[data-pattern-name]")!;
  const patternMeta = root.querySelector<HTMLElement>("[data-pattern-meta]")!;
  const patternConstruction = root.querySelector<HTMLElement>("[data-pattern-construction]")!;
  const patternPreview = root.querySelector<HTMLElement>("[data-pattern-preview]")!;
  const patternLoad = root.querySelector<HTMLButtonElement>("[data-pattern-load]")!;
  const patternSource = root.querySelector<HTMLAnchorElement>("[data-pattern-source]")!;
  const patternExtremalFilter = root.querySelector<HTMLInputElement>("[data-pattern-extremal-filter]")!;
  const patternExtremalBadge = root.querySelector<HTMLAnchorElement>("[data-pattern-extremal-badge]")!;
  const patternDetected = root.querySelector<HTMLElement>("[data-pattern-detected]")!;
  const patternDetectedName = root.querySelector<HTMLElement>("[data-pattern-detected-name]")!;
  const patternDetectedMeta = root.querySelector<HTMLElement>("[data-pattern-detected-meta]")!;
  const patternDetectedSolution = root.querySelector<HTMLElement>("[data-pattern-detected-solution]")!;
  const patternDetectedExtremalBadge = root.querySelector<HTMLAnchorElement>(
    "[data-pattern-detected-extremal-badge]",
  )!;
  const patternPreviewSolution = root.querySelector<HTMLButtonElement>("[data-pattern-preview-solution]")!;
  const patternCopySolution = root.querySelector<HTMLButtonElement>("[data-pattern-copy-solution]")!;
  const transformButtons = root.querySelectorAll<HTMLButtonElement>("[data-alg-transform]");
  const shortenSearch = root.querySelector<HTMLButtonElement>("[data-shorten-search]")!;
  const shortenResult = root.querySelector<HTMLElement>("[data-shorten-result]")!;
  const shortenSummary = root.querySelector<HTMLElement>("[data-shorten-summary]")!;
  const shortenPreview = root.querySelector<HTMLElement>("[data-shorten-preview]")!;
  const shortenApply = root.querySelector<HTMLButtonElement>("[data-shorten-apply]")!;
  const shortenDismiss = root.querySelector<HTMLButtonElement>("[data-shorten-dismiss]")!;
  const nissPanel = root.querySelector<HTMLDetailsElement>("[data-niss-panel]")!;
  const hamiltonPanel = root.querySelector<HTMLDetailsElement>("[data-hamilton-panel]")!;
  const hamiltonInput = root.querySelector<HTMLTextAreaElement>("[data-hamilton-input]")!;
  const hamiltonImport = root.querySelector<HTMLInputElement>("[data-hamilton-import]")!;
  const hamiltonInspect = root.querySelector<HTMLButtonElement>("[data-hamilton-inspect]")!;
  const hamiltonNode = root.querySelector<HTMLSelectElement>("[data-hamilton-node]")!;
  const hamiltonWindowStart = root.querySelector<HTMLInputElement>("[data-hamilton-window-start]")!;
  const hamiltonWindowLength = root.querySelector<HTMLInputElement>("[data-hamilton-window-length]")!;
  const hamiltonPreview = root.querySelector<HTMLButtonElement>("[data-hamilton-preview]")!;
  const hamiltonStreamButton = root.querySelector<HTMLButtonElement>("[data-hamilton-stream]")!;
  const hamiltonResult = root.querySelector<HTMLOutputElement>("[data-hamilton-result]")!;
  const nissInverseOutput = root.querySelector<HTMLElement>("[data-niss-inverse]")!;
  const nissNormal = root.querySelector<HTMLTextAreaElement>("[data-niss-normal]")!;
  const nissInverseMoves = root.querySelector<HTMLTextAreaElement>("[data-niss-inverse-moves]")!;
  const nissUseInverse = root.querySelector<HTMLButtonElement>("[data-niss-use-inverse]")!;
  const nissSideButtons = root.querySelectorAll<HTMLButtonElement>("[data-niss-side]");
  const nissVirtualBadge = root.querySelector<HTMLElement>("[data-niss-virtual-badge]")!;
  const nissVerify = root.querySelector<HTMLButtonElement>("[data-niss-verify]")!;
  const nissLoad = root.querySelector<HTMLButtonElement>("[data-niss-load]")!;
  const nissResult = root.querySelector<HTMLOutputElement>("[data-niss-result]")!;
  const academySolve = root.querySelector<HTMLButtonElement>("[data-academy-solve]")!;
  const academyInstantDrill = root.querySelector<HTMLButtonElement>("[data-academy-instant-drill]")!;
  const academyWcaDrill = root.querySelector<HTMLButtonElement>("[data-academy-wca-drill]")!;
  const academyDrillCase = root.querySelector<HTMLSelectElement>("[data-academy-drill-case]")!;
  const academyDrillFamily = root.querySelector<HTMLSelectElement>("[data-academy-drill-family]")!;
  const academyLoadDrill = root.querySelector<HTMLButtonElement>("[data-academy-load-drill]")!;
  const academyRandomDrill = root.querySelector<HTMLButtonElement>("[data-academy-random-drill]")!;
  const twoPhaseSolve = root.querySelector<HTMLButtonElement>("[data-two-phase-solve]")!;
  const twoPhaseApply = root.querySelector<HTMLButtonElement>("[data-two-phase-apply]")!;
  const twoPhaseResult = root.querySelector<HTMLOutputElement>("[data-two-phase-result]")!;
  const academyTarget = root.querySelector<HTMLInputElement>("[data-academy-target]")!;
  const academyDom = (prefix: string) => ({
    status: root.querySelector<HTMLElement>(`[data-${prefix}-status]`)!,
    current: root.querySelector<HTMLElement>(`[data-${prefix}-current]`)!,
    phases: root.querySelector<HTMLElement>(`[data-${prefix}-phases]`)!,
    copy: root.querySelector<HTMLButtonElement>(`[data-${prefix}-copy]`)!,
    solution: root.querySelector<HTMLElement>(`[data-${prefix}-solution]`)!,
  });
  const academyComparison = root.querySelector<HTMLElement>("[data-academy-comparison]")!;
  const autoOrbitButton = root.querySelector<HTMLButtonElement>("[data-auto-orbit]")!;
  const turnGuidesButton = root.querySelector<HTMLButtonElement>("[data-turn-guides]")!;
  const coachingControls = root.querySelector<HTMLElement>("[data-coaching-controls]")!;
  const coachStatus = root.querySelector<HTMLElement>("[data-coach-status]")!;
  const smartCubeConnect = root.querySelector<HTMLButtonElement>("[data-smart-cube-connect]")!;
  const smartCubeDock = root.querySelector<HTMLElement>("[data-smart-cube-dock]")!;
  const smartCubeStatus = root.querySelector<HTMLElement>("[data-smart-cube-status]")!;
  const smartCubeBattery = root.querySelector<HTMLElement>("[data-smart-cube-battery]")!;
  const smartCubeMistakes = root.querySelector<HTMLElement>("[data-smart-cube-mistakes]")!;
  const smartCubeReroute = root.querySelector<HTMLButtonElement>("[data-smart-cube-reroute]")!;
  const smartCubeSound = root.querySelector<HTMLButtonElement>("[data-smart-cube-sound]")!;
  const smartCubeSync = root.querySelector<HTMLButtonElement>("[data-smart-cube-sync]")!;
  const smartCubeResetState = root.querySelector<HTMLButtonElement>("[data-smart-cube-reset-state]")!;
  const smartCubeOrientation = root.querySelector<HTMLButtonElement>("[data-smart-cube-orientation]")!;
  const smartCubeController = root.querySelector<HTMLButtonElement>("[data-smart-cube-controller]")!;
  const smartCubeDisconnect = root.querySelector<HTMLButtonElement>("[data-smart-cube-disconnect]")!;
  const timerCover = root.querySelector<HTMLButtonElement>("[data-timer-cover]")!;
  const timerHud = root.querySelector<HTMLElement>("[data-timer-hud]")!;
  const timerHudPhase = root.querySelector<HTMLElement>("[data-timer-hud-phase]")!;
  const timerHudTime = root.querySelector<HTMLElement>("[data-timer-hud-time]")!;
  const timerHudStatus = root.querySelector<HTMLElement>("[data-timer-hud-status]")!;
  const timerHudStats = root.querySelector<HTMLElement>("[data-timer-hud-stats]")!;
  const initialState = readHash(window.location.hash);
  const store = createStore(initialState);
  let size = initialState.size;
  let lowercaseMode: LowercaseMode = initialState.lowercaseMode;
  let notationDialect: NotationDialect = initialState.notationDialect;
  let cubeStyle: CubeStyle = initialState.cubeStyle;
  let turnGuides = initialState.turnGuides;
  let activeTab: ActiveTab = initialState.activeTab;
  let academyMethod: AcademyMethod = initialState.academyMethod;
  let inverseScramble = "";
  let verifiedNissSolution = "";
  let verifiedNissAlg: unknown[] | null = null;
  let verifiedNissStart: CubeState | null = null;
  let hamiltonProgram: HamiltonMacro.Program | null = null;
  let pendingShortenedAlg: unknown[] | null = null;
  let visiblePatterns: ImportedPattern[] = [];
  let selectedPattern: ImportedPattern | null = null;
  let detectedPattern: RecognizedPattern | null = null;
  let detectedPatternState: CubeState | null = null;
  let activeRecognized: RecognizedInput | null = null;
  let tutorialPhases: TutorialPhaseRange[] = [];
  let activeAcademy: AcademyElements | null = null;
  let commentedTutorialSolution = "";
  let academySolveBusy = false;
  let academyWcaDrillEnabled = false;
  const academyRequestGuard = createAcademyRequestGuard();
  const savedTutorialSolutions = new Map<TutorialMethod, SavedTutorialSolution>();
  const beginnerAcademy: AcademyElements = {
    method: "beginner",
    label: "Beginner LBL",
    phaseCount: 7,
    ...academyDom("beginner"),
  };
  const advancedLblAcademy: AcademyElements = {
    method: "advancedLbl",
    label: "Advanced LBL",
    phaseCount: 7,
    ...academyDom("advanced-lbl"),
  };
  const beginnerCfopAcademy: AcademyElements = {
    method: "beginnerCfop",
    label: "Beginner CFOP",
    phaseCount: 4,
    ...academyDom("beginner-cfop"),
  };
  const fullCfopAcademy: AcademyElements = {
    method: "fullCfop",
    label: "Full CFOP",
    phaseCount: 4,
    ...academyDom("full-cfop"),
  };
  const advancedCfopAcademy: AcademyElements = {
    method: "advancedCfop",
    label: "Advanced CFOP",
    phaseCount: 4,
    ...academyDom("advanced-cfop"),
  };
  const petrusAcademy: AcademyElements = {
    method: "petrus",
    label: "Classical Petrus",
    phaseCount: 7,
    ...academyDom("petrus"),
  };
  const enhancedPetrusAcademy: AcademyElements = {
    method: "enhancedPetrus",
    label: "Enhanced Petrus",
    phaseCount: 5,
    ...academyDom("enhanced-petrus"),
  };
  const academies = [
    beginnerAcademy,
    advancedLblAcademy,
    beginnerCfopAcademy,
    fullCfopAcademy,
    advancedCfopAcademy,
    petrusAcademy,
    enhancedPetrusAcademy,
  ];
  const academyForMethod = (method: TutorialMethod): AcademyElements =>
    academies.find((academy) => academy.method === method) ?? beginnerAcademy;
  const isCfopMethod = (method: TutorialMethod): boolean =>
    method === "beginnerCfop" || method === "fullCfop" || method === "advancedCfop";
  const isPetrusMethod = (method: TutorialMethod): boolean =>
    method === "petrus" || method === "enhancedPetrus";
  const solverClient = createSolverClient<CubeState, TutorialSolution>(
    new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"}),
  );
  let twoPhaseSolveBusy = false;
  let nissSide: "normal" | "inverse" = "normal";
  let nissNormalState: CubeState | null = null;
  let nissInverseState: CubeState | null = null;
  let twoPhaseCancelling = false;
  let twoPhaseRequest = 0;
  let twoPhaseAlgorithm = "";
  let twoPhaseBestMoveCount: number | null = null;
  let twoPhaseSourceKey = "";
  let twoPhasePendingState: CubeState | null = null;
  const newTwoPhaseSolverClient = () => createTwoPhaseSolverClient<CubeState, TwoPhaseSolution>(
    new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"}),
    (stage) => {
      if (twoPhaseSolveBusy) {
        twoPhaseResult.textContent = twoPhaseBestMoveCount === null
          ? stage
          : `Best so far: ${twoPhaseBestMoveCount} HTM · ${twoPhaseAlgorithm} · ${stage}`;
      }
    },
    (solution) => {
      if (!twoPhaseSolveBusy || twoPhasePendingState === null) return;
      const replay = MoveExecutor.applyAlg(twoPhasePendingState, solution.alg) as Result<CubeState, unknown>;
      const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
      if (replay.TAG !== "Ok" || solved.TAG !== "Ok"
        || FaceletCodec.render(replay._0) !== FaceletCodec.render(solved._0)) return;
      twoPhaseAlgorithm = MoveTransform.serialize(solution.alg) as string;
      twoPhaseBestMoveCount = solution.moveCount;
      twoPhaseApply.disabled = twoPhaseAlgorithm === "";
      twoPhaseResult.textContent = `Best so far: ${solution.moveCount} HTM · ${twoPhaseAlgorithm}`;
      twoPhaseResult.classList.remove("success", "failure");
    },
  );
  let twoPhaseSolverClient = newTwoPhaseSolverClient();
  const viewport = createCubeViewport(canvas, motionOverlay, (message) => {
    viewportFallback.textContent = `${message} Text conversions remain fully functional.`;
    viewportFallback.hidden = false;
  });
  if (!viewport) autoOrbitButton.disabled = true;
  const setPlayerMode = (enabled: boolean, pushHistory = true) => {
    if (playerMode === enabled) return;
    playerMode = enabled;
    renderPlayerPresentation();
    if (pushHistory) window.history.pushState(null, "", `${enabled ? "/player" : "/"}${window.location.hash}`);
    viewport?.refresh();
  };
  window.addEventListener("popstate", () => {
    setPlayerMode(window.location.pathname === "/player", false);
  });
  const setTimerArenaMode = (enabled: boolean) => {
    timerArenaMode = enabled;
    if (enabled) setPlayerMode(true);
    renderPlayerPresentation();
    timerHud.hidden = !enabled;
    timerCover.hidden = true;
  };

  const scheme = (): Scheme =>
    schemeSelect.value === "Custom"
      ? {TAG: "Custom", _0: customScheme.value.toUpperCase()}
      : (schemeSelect.value as "Western" | "Japanese");

  const copyText = async (value: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = value;
      fallback.readOnly = true;
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.append(fallback);
      fallback.select();
      const copied = document.execCommand("copy");
      fallback.remove();
      return copied;
    }
  };

  const applyExtremalBadge = (anchor: HTMLAnchorElement, name: string | null) => {
    const tag = name ? extremalStateFor(name) : null;
    if (!tag) {
      anchor.hidden = true;
      anchor.removeAttribute("href");
      return;
    }
    anchor.hidden = false;
    anchor.href = tag.referenceUrl;
    anchor.textContent = `🏆 ${tag.label} · ${tag.referenceLabel}`;
  };

  const faceNames = ["U", "R", "F", "D", "L", "B"] as const;
  const renderPatternPreview = (pattern: ImportedPattern | null) => {
    patternPreview.replaceChildren();
    if (!pattern) {
      patternPreview.hidden = true;
      return;
    }
    const evaluated = evaluateAlgorithm(pattern.size, "Wide", "Modern", pattern.construction);
    if (evaluated.TAG === "Error") {
      patternPreview.hidden = true;
      return;
    }
    const title = document.createElement("span");
    title.className = "pattern-preview-label";
    title.textContent = "Preview";
    const net = document.createElement("div");
    net.className = "pattern-preview-net";
    net.style.setProperty("--pattern-size", String(pattern.size));
    const facelets = FaceletCodec.render(evaluated._0.finalState);
    const faceLength = pattern.size * pattern.size;
    faceNames.forEach((face, index) => {
      const faceElement = document.createElement("div");
      faceElement.className = `pattern-preview-face pattern-preview-face-${face}`;
      faceElement.setAttribute("aria-label", `${face} face`);
      const stickers = facelets.slice(index * faceLength, (index + 1) * faceLength);
      for (const sticker of stickers) {
        const tile = document.createElement("i");
        tile.className = `pattern-preview-sticker pattern-preview-sticker-${sticker}`;
        tile.setAttribute("aria-hidden", "true");
        faceElement.append(tile);
      }
      net.append(faceElement);
    });
    patternPreview.append(title, net);
    patternPreview.hidden = false;
  };

  const renderSelectedPattern = () => {
    selectedPattern = visiblePatterns[Number(patternSelect.value)] ?? visiblePatterns[0] ?? null;
    patternLoad.disabled = selectedPattern === null;
    if (!selectedPattern) {
      patternName.textContent = "No matching patterns";
      patternMeta.textContent = `${size}×${size} catalog`;
      patternConstruction.textContent = "Try a broader search.";
      patternSource.removeAttribute("href");
      patternSource.hidden = true;
      applyExtremalBadge(patternExtremalBadge, null);
      renderPatternPreview(null);
      return;
    }
    patternName.textContent = selectedPattern.name;
    patternMeta.textContent = `${selectedPattern.size}×${selectedPattern.size} · ${selectedPattern.sourceId}`;
    patternConstruction.textContent = selectedPattern.publishedNotation;
    patternSource.href = selectedPattern.sourceUrl;
    patternSource.hidden = false;
    applyExtremalBadge(patternExtremalBadge, selectedPattern.name);
    renderPatternPreview(selectedPattern);
  };

  const renderPatternBrowser = () => {
    visiblePatterns = patternsForSize(size, patternSearch.value, patternExtremalFilter.checked);
    patternSelect.replaceChildren(...visiblePatterns.map((pattern, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = pattern.name;
      return option;
    }));
    patternLibrary.querySelector("summary small")!.textContent =
      `${patternsForSize(size).length} for ${size}×${size} · ${patternCount} total`;
    renderSelectedPattern();
  };

  const updatePatternDetection = (recognized: RecognizedInput | null) => {
    detectedPatternState = recognized?.state ?? null;
    detectedPattern = recognized ? recognizePattern(recognized.state) : null;
    patternDetected.hidden = detectedPattern === null;
    if (!detectedPattern) {
      applyExtremalBadge(patternDetectedExtremalBadge, null);
      return;
    }
    const {pattern, aliases, solution} = detectedPattern;
    patternDetectedName.textContent = pattern.name;
    const aliasText = aliases.length > 0
      ? ` · also catalogued as ${aliases.map((alias) => alias.name).join(", ")}`
      : "";
    patternDetectedMeta.textContent =
      `${pattern.size}×${pattern.size} · ${pattern.sourceId} · ${pattern.solutionKind} solution${aliasText}`;
    patternDetectedSolution.textContent = solution ?? "No replay-verified solution for this holding.";
    patternPreviewSolution.disabled = solution === null;
    patternCopySolution.disabled = solution === null;
    applyExtremalBadge(patternDetectedExtremalBadge, pattern.name);
  };

  const previewDetectedPatternSolution = () => {
    if (!detectedPatternState || !detectedPattern?.solution) return;
    const parsed = MoveParser.parseWithOptions(
      size,
      "Wide",
      "Modern",
      detectedPattern.solution,
    ) as Result<unknown[], {message?: string}>;
    if (parsed.TAG === "Error") return;
    const timeline = buildTimeline(detectedPatternState, parsed._0);
    if (timeline.TAG === "Error") return;
    stopPlayback();
    activeTimeline = timeline._0;
    activeTimelineKey = null;
    activeIndex = 0;
    lastLabel = `${detectedPattern.pattern.name} solution`;
    renderState(detectedPatternState, lastLabel);
    updatePlaybackUi(true);
  };

  const describeError = (reason: StateError | string): string => {
    if (typeof reason === "string") return reason;
    switch (reason.TAG) {
      case "InvalidLength":
        return `Invalid length: expected ${reason.expected}, received ${reason.actual}.`;
      case "InvalidFacelet":
      case "InvalidColour":
        return `Invalid symbol '${reason.character}' at position ${reason.index}.`;
      case "InvalidColourCount":
        return `Every face or colour must occur exactly ${reason.expected} times.`;
      default:
        return reason._0 ?? "The cube state is invalid.";
    }
  };

  const validatePhysicalState = (state: CubeState): string | null => {
    if (state.size !== 2 && state.size !== 3) return null;
    const pieces = PieceReducer.reduce(state) as Result<PieceState, unknown>;
    return pieces.TAG === "Ok" ? null : PieceReducer.describeError(pieces._0);
  };

  const recognize = (result: Result<CubeState>, label: string): Result<RecognizedInput> => {
    if (result.TAG === "Error") return result;
    const diagnostic = validatePhysicalState(result._0);
    return diagnostic === null
      ? {TAG: "Ok", _0: {state: result._0, label}}
      : {TAG: "Error", _0: diagnostic};
  };

  const parseAlgorithm = (value: string): Result<RecognizedInput> => {
    const evaluated = evaluateAlgorithm(
      size,
      lowercaseMode,
      notationDialect,
      value,
    );
    if (evaluated.TAG === "Error") return evaluated;
    const label = size >= 4 && notationDialect === "Ruwix"
      ? `Algorithm · Ruwix${lowercaseMode === "InnerSlice" ? " + legacy lowercase" : ""}`
      : `Algorithm · ${size >= 4 && lowercaseMode === "InnerSlice" ? "Legacy" : "SiGN"}`;
    return {
      TAG: "Ok",
      _0: {
        state: evaluated._0.finalState,
        label,
        timeline: evaluated._0,
        timelineKey: `${size}\u0000${lowercaseMode}\u0000${notationDialect}\u0000${value}`,
      },
    };
  };

  const parseState = (inputValue: string): Result<RecognizedInput> => {
    const compact = inputValue.trim();
    if (compact === "") {
      return recognize(StateTypes.solved(size) as Result<CubeState>, "Solved default");
    }
    if ((size === 2 || size === 3) && compact.startsWith("cp:")) {
      const pieces = PieceReducer.parseState(size, compact) as Result<CubeState, unknown>;
      return pieces.TAG === "Ok"
        ? {TAG: "Ok", _0: {state: pieces._0, label: "Cubie coordinates"}}
        : {TAG: "Error", _0: PieceReducer.describeError(pieces._0)};
    }
    if (size === 3 && /^[A-Za-z0-9_-]{12}$/.test(compact)) {
      const orbit = Orbit64Codec.decodeState(compact) as Result<CubeState, unknown>;
      return orbit.TAG === "Ok"
        ? {TAG: "Ok", _0: {state: orbit._0, label: "Orbit64"}}
        : {TAG: "Error", _0: Orbit64Codec.describeError(orbit._0)};
    }
    if (inputValue.includes("\n")) {
      const net = inputValue.trimEnd();
      const faceNet = NetCodec.parse(size, net) as Result<CubeState>;
      if (faceNet.TAG === "Ok") return recognize(faceNet, "Facelet net");
      const colourNet = ColorCodec.parseNet(scheme(), size, net) as Result<CubeState>;
      return colourNet.TAG === "Ok"
        ? recognize(colourNet, "Colour net")
        : parseAlgorithm(inputValue);
    }
    const facelets = FaceletCodec.parse(size, compact) as Result<CubeState>;
    if (facelets.TAG === "Ok") return recognize(facelets, "Compact facelets");
    const colours = ColorCodec.parseCompact(scheme(), size, compact) as Result<CubeState>;
    return colours.TAG === "Ok"
      ? recognize(colours, "Compact colours")
      : parseAlgorithm(inputValue);
  };

  const macroDefinition = /(?:^|\n)\s*(?:def\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/;

  /** Expands macro-editor input only up to the ordinary materialized tape limit. */
  const parseMovesEditor = (value: string): Result<unknown[], string> => {
    if (!macroDefinition.test(value)) {
      const parsed = MoveParser.parseWithOptions(
        size,
        lowercaseMode,
        notationDialect,
        value,
      ) as Result<unknown[], {message?: string}>;
      return parsed.TAG === "Ok"
        ? parsed
        : {TAG: "Error", _0: parsed._0.message ?? "Invalid moves."};
    }
    try {
      const program = HamiltonMacro.parse(value);
      const notation = HamiltonMacro.unfold(program, MAX_PLAYBACK_STEPS).map((event) =>
        event.kind === "move" ? event.token : `@${(event.durationMs / 1000).toString()}s`
      );
      const parsed = MoveParser.parseWithOptions(
        size,
        lowercaseMode,
        notationDialect,
        notation.join(" "),
      ) as Result<unknown[], {message?: string}>;
      return parsed.TAG === "Ok"
        ? parsed
        : {TAG: "Error", _0: parsed._0.message ?? "Invalid expanded macro moves."};
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Invalid Hamilton macro.";
      return {
        TAG: "Error",
        _0: message.includes("-move limit")
          ? `${message}. Use the streaming player for longer programs.`
          : message,
      };
    }
  };

  const parseWorkspaceState = (): Result<RecognizedInput> => {
    const setup = parseState(input.value);
    if (setup.TAG === "Error" || movesInput.value.trim() === "") return setup;
    const moves = parseMovesEditor(movesInput.value);
    if (moves.TAG === "Error") return {TAG: "Error", _0: moves._0};
    let baseState = setup._0.state;
    let combinedAlg = moves._0;
    if (setup._0.timeline) {
      const solved = StateTypes.solved(size) as Result<CubeState, unknown>;
      if (solved.TAG === "Error") return {TAG: "Error", _0: "Cube size must be between 2 and 5."};
      baseState = solved._0;
      combinedAlg = [...setup._0.timeline.alg, ...moves._0];
    }
    const applied = MoveExecutor.applyAlg(baseState, combinedAlg) as Result<CubeState, unknown>;
    if (applied.TAG === "Error") return {TAG: "Error", _0: "Could not apply Moves to Setup."};
    const timeline = buildTimeline(baseState, combinedAlg);
    if (timeline.TAG === "Error") return {TAG: "Error", _0: "Could not build the Setup + Moves timeline."};
    return {
      TAG: "Ok",
      _0: {
        state: applied._0,
        label: `${setup._0.label} + moves`,
        timeline: timeline._0,
        timelineKey: `${size}\u0000${lowercaseMode}\u0000${notationDialect}\u0000${input.value}\u0000${movesInput.value}`,
      },
    };
  };

  const updateLowercaseUi = () => {
    const supportsLegacy = size >= 4;
    lowercaseControls.hidden = !supportsLegacy;
    root.querySelectorAll<HTMLButtonElement>("[data-lowercase-mode]").forEach((button) => {
      const active = button.dataset.lowercaseMode === lowercaseMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

  };

  const updateDialectUi = () => {
    const controls = root.querySelector<HTMLElement>("[data-notation-controls]")!;
    controls.hidden = size < 4;
    root.querySelectorAll<HTMLButtonElement>("[data-notation-dialect]").forEach((button) => {
      const active = button.dataset.notationDialect === notationDialect;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };

  const setOutput = (key: string, value: string, copyable = true) => {
    const output = root.querySelector<HTMLElement>(`[data-output="${key}"]`);
    if (output) output.textContent = value;
    root.querySelectorAll<HTMLButtonElement>(`[data-copy="${key}"]`).forEach((copy) => {
      copy.disabled = !copyable;
    });
  };

  const updateCardVisibility = () => {
    root.querySelectorAll<HTMLElement>("[data-output-card]").forEach((card) => {
      const supportedSizes = card.dataset.sizes;
      card.hidden = supportedSizes !== undefined && !supportedSizes.split(",").includes(String(size));
    });
    const pieceTitle = root.querySelector<HTMLElement>('[data-title="pieces"]');
    if (pieceTitle) {
      pieceTitle.textContent = size === 2 ? "2×2 CP / CO" : "3×3 CP / CO / EP / EO";
    }
    const orbitQuickCopy = root.querySelector<HTMLButtonElement>("[data-copy-orbit64]");
    if (orbitQuickCopy) orbitQuickCopy.hidden = size !== 3;
    nissPanel.hidden = size !== 3 || activeTab !== "workbench";
    hamiltonPanel.hidden = activeTab !== "workbench";
    twoPhaseSolve.disabled = size !== 3;
    if (size !== 3 && !twoPhaseSolveBusy) {
      twoPhaseResult.textContent = "Two-phase solving is available for 3×3 states.";
      twoPhaseResult.classList.remove("success", "failure");
    }
  };

  const resetNissResult = () => {
    verifiedNissSolution = "";
    verifiedNissAlg = null;
    verifiedNissStart = null;
    nissLoad.disabled = true;
    nissResult.classList.remove("success", "failure");
    nissResult.textContent = "Enter both sides to verify a candidate solution.";
  };

  const updateNissSource = (recognized: RecognizedInput | null) => {
    nissNormalState = recognized?.state ?? null;
    inverseScramble = recognized?.timeline
      ? MoveTransform.serialize(MoveNiss.invertScramble(recognized.timeline.alg))
      : "";
    let inverseState: CubeState | null = null;
    const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
    if (inverseScramble !== "" && solved.TAG === "Ok") {
      const inverse = MoveParser.parseWithOptions(3, "Wide", "Modern", inverseScramble) as Result<unknown[], unknown>;
      if (inverse.TAG === "Ok") {
        const applied = MoveExecutor.applyAlg(solved._0, inverse._0) as Result<CubeState, unknown>;
        if (applied.TAG === "Ok") inverseState = applied._0;
      }
    }
    nissInverseState = inverseState;
    nissInverseOutput.textContent = inverseScramble || "—";
    nissUseInverse.disabled = inverseScramble === "" || size !== 3;
    nissVerify.disabled = !recognized?.timeline || size !== 3;
    resetNissResult();
  };

  const setNissSide = (side: "normal" | "inverse") => {
    if (side === "inverse" && nissInverseState === null) return;
    nissSide = side;
    nissSideButtons.forEach((button) => {
      const active = button.dataset.nissSide === side;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    nissVirtualBadge.hidden = side !== "inverse";
    const state = side === "inverse" ? nissInverseState : nissNormalState;
    if (state) {
      const palette: CubePalette = schemeSelect.value === "Japanese" ? "Japanese" : "Western";
      viewport?.setScene(state, palette, cubeStyle);
    }
    (side === "inverse" ? nissInverseMoves : nissNormal).focus();
  };

  const renderState = (state: CubeState, label: string) => {
    status.textContent = label;
    status.classList.remove("error");
    error.hidden = true;
    const palette: CubePalette = schemeSelect.value === "Japanese" ? "Japanese" : "Western";
    viewport?.setScene(state, palette, cubeStyle);
    setOutput("facelets", FaceletCodec.render(state));
    setOutput("net", NetCodec.render(state));
    const colours = ColorCodec.renderCompact(scheme(), state) as Result<string>;
    const colourNet = ColorCodec.renderNet(scheme(), state) as Result<string>;
    setOutput("colours", colours.TAG === "Ok" ? colours._0 : "—", colours.TAG === "Ok");
    setOutput(
      "colour-net",
      colourNet.TAG === "Ok" ? colourNet._0 : "—",
      colourNet.TAG === "Ok",
    );

    if (size === 2 || size === 3) {
      const pieces = PieceReducer.reduce(state) as Result<PieceState, unknown>;
      if (pieces.TAG === "Error") {
        setOutput(
          "pieces",
          `Unavailable — ${PieceReducer.describeError(pieces._0)}`,
          false,
        );
        if (size === 3) setOutput("orbit64", "Unavailable — invalid piece state", false);
      } else {
        const renderedPieces = PieceReducer.render(pieces._0) as Result<string, unknown>;
        setOutput(
          "pieces",
          renderedPieces.TAG === "Ok"
            ? renderedPieces._0
            : `Unavailable — ${PieceReducer.describeError(renderedPieces._0)}`,
          renderedPieces.TAG === "Ok",
        );
        if (size === 3) {
          const orbit = Orbit64Codec.encode(pieces._0) as Result<string, unknown>;
          setOutput(
            "orbit64",
            orbit.TAG === "Ok" ? orbit._0 : `Unavailable — ${Orbit64Codec.describeError(orbit._0)}`,
            orbit.TAG === "Ok",
          );
        }
      }
    }
  };

  let activeTimeline: AlgorithmTimeline | null = null;
  let hamiltonStream: {
    player: HamiltonMacro.StreamPlayer;
    node: string;
    state: CubeState;
    measurement: HamiltonMacro.Measurement;
    quarterTurnsPlayed: bigint;
  } | null = null;
  let activeTimelineKey: string | null = null;
  let activeIndex = 0;
  let playbackSpeed = 1;
  let coachedPlayback = true;
  let looping = false;
  let playbackDirection: -1 | 0 | 1 = 0;
  let playbackGeneration = 0;
  let widePrefixExpires = 0;
  let pendingDirectMove: {
    signature: string;
    token: string;
    doubledToken: string;
    timeout: number;
  } | null = null;
  let lastLabel = "";
  let focusedGroup: HTMLElement | null = null;
  let focusedPiece: string | null = null;
  let guidedToken: HTMLElement | null = null;
  let activeTurnGuide: {step: MoveStep; label: string; tone?: "normal" | "recovery"} | null = null;
  let previewedMoveIndex: number | null = null;
  let hoverPreviewCursor: number | null = null;
  let hoverPreviewGeneration = 0;
  let tutorialCameraRestore: {yaw: number; pitch: number} | null = null;
  let tutorialCameraGeneration = 0;
  let smartCubeManager: SmartCubeManager | null = null;
  let smartCubeManagerLoading: Promise<SmartCubeManager> | null = null;
  let smartCubeConnected = false;
  let smartCubeDeviceName = "Smart cube";
  let smartCubeLedFeedback = false;
  let smartCubeLiveState: CubeState | null = null;
  let smartCubeRenderedState: CubeState | null = null;
  let smartCubeStateSyncPending = false;
  let smartCubeSyncMode: SyncMode = "PhysicalMirror";
  let smartCubeControllerState: CubeState | null = null;
  let smartCubeControllerInspection = false;
  let smartCubeControllerOrientation: Array<{axis: "X" | "Y" | "Z"; turns: number}> = [];
  let smartCubeControllerOrientationBaseline: {
    quaternion: OrientationQuaternion;
    coordinateFrame: OrientationCoordinateFrame;
  } | null = null;
  let smartCubeOrientationTracking = false;
  let lastOrientationLogTime = 0;
  let latestSmartCubeOrientation: Pick<
    SmartCubeOrientationEvent,
    "quaternion" | "coordinateFrame"
  > | null = null;
  let smartCubeMovesInFlight = 0;
  let smartCubeMoveQueue = Promise.resolve();
  type QueuedSmartCubeMove = {move: string; state: CubeState | null};
  const smartCubePendingMoves: QueuedSmartCubeMove[] = [];
  let suppressNextSmartCubeExtension = false;
  let smartCubeCoachingWaiting = false;
  let smartCubeCoachingFrameActive = false;
  let smartCubeRotationWait: {
    action: ExpectedSmartCubeAction & {kind: "rotation"};
    generation: number;
    baseline: {quaternion: OrientationQuaternion; coordinateFrame: OrientationCoordinateFrame} | null;
    partialTurn: -1 | 0 | 1;
  } | null = null;
  let smartCubeHalfTurnProgress: SmartCubeHalfTurnProgress | null = null;
  let smartCubeRecovery: SmartCubeRecoveryState | null = null;
  const smartCubeMistakeLog: Array<{expected: string; received: string; timestamp: number}> = [];
  let storedSoundPreference = true;
  try {
    storedSoundPreference = readSmartCubeSoundPreference(window.localStorage);
  } catch {
    storedSoundPreference = true;
  }
  const smartCubeAudio = createSmartCubeAudioFeedback(storedSoundPreference);

  const viewportPalette = (): CubePalette =>
    schemeSelect.value === "Japanese" ? "Japanese" : "Western";

  const clearTutorialFocus = (mode: "restore" | "hold" = "restore") => {
    const restore = tutorialCameraRestore;
    const cameraGeneration = ++tutorialCameraGeneration;
    focusedGroup?.classList.remove("focused");
    focusedGroup = null;
    focusedPiece = null;
    delete canvas.dataset.sequencePurposeStart;
    delete canvas.dataset.sequenceCameraYaw;
    delete canvas.dataset.sequenceCameraPitch;
    viewport?.setFocus(null);
    if (mode === "hold") {
      if (restore) canvas.dataset.sequenceCameraHeld = "true";
      else delete canvas.dataset.sequenceCameraHeld;
      return;
    }
    delete canvas.dataset.sequenceCameraHeld;
    if (restore) {
      void viewport?.smoothOrbitTo(restore.yaw, restore.pitch, 280).then(() => {
        if (cameraGeneration === tutorialCameraGeneration && focusedGroup === null) {
          tutorialCameraRestore = null;
          delete canvas.dataset.sequenceCameraRestoreYaw;
          delete canvas.dataset.sequenceCameraRestorePitch;
        }
      });
    }
  };

  const refreshTutorialFocus = (): CubieFocus | null => {
    if (!focusedPiece || !activeTimeline?.states) {
      viewport?.setFocus(null);
      return null;
    }
    const displayed = activeTimeline.states[activeIndex];
    const base = displayed ? focusForPiece(displayed, focusedPiece) : null;
    const nextFocus = base && focusedGroup?.dataset.sequenceDescription
      ? {...base, label: focusedGroup.dataset.sequenceDescription}
      : base;
    viewport?.setFocus(nextFocus);
    return nextFocus;
  };

  const activateTutorialFocus = (group: HTMLElement, piece: string | null) => {
    tutorialCameraGeneration += 1;
    focusedGroup?.classList.remove("focused");
    focusedGroup = group;
    focusedPiece = piece;
    group.classList.add("focused");
    const nextFocus = refreshTutorialFocus();
    if (nextFocus && group.classList.contains("move-group")) {
      if (tutorialCameraRestore === null) {
        const yaw = Number(canvas.dataset.cameraYaw);
        const pitch = Number(canvas.dataset.cameraPitch);
        if (Number.isFinite(yaw) && Number.isFinite(pitch)) {
          tutorialCameraRestore = {yaw, pitch};
          canvas.dataset.sequenceCameraRestoreYaw = yaw.toFixed(6);
          canvas.dataset.sequenceCameraRestorePitch = pitch.toFixed(6);
        }
      }
      const camera = focusCameraTarget(nextFocus);
      canvas.dataset.sequenceCameraYaw = camera.yaw.toFixed(6);
      canvas.dataset.sequenceCameraPitch = camera.pitch.toFixed(6);
      void viewport?.smoothOrbitTo(camera.yaw, camera.pitch, 280);
    }
  };

  const setHoverPreviewState = (index: number) => {
    const state = activeTimeline?.states?.[index];
    if (!state) return;
    viewport?.setState(state, viewportPalette());
    if (focusedPiece) {
      const base = focusForPiece(state, focusedPiece);
      const purpose = focusedGroup?.dataset.sequenceDescription;
      viewport?.setFocus(base && purpose ? {...base, label: purpose} : base);
    }
    canvas.dataset.hoverPreviewIndex = String(index);
    canvas.dataset.hoverPreviewFacelets = FaceletCodec.render(state);
  };

  const animateHoverPreviewTo = async (
    target: number,
    generation: number,
  ): Promise<boolean> => {
    if (!activeTimeline?.states || !viewport) return false;
    let cursor = hoverPreviewCursor ?? activeIndex;
    hoverPreviewCursor = cursor;
    const transitions = planHoverPreview(activeTimeline.steps, cursor, target);
    canvas.dataset.hoverPreviewTarget = String(target);
    for (const transition of transitions) {
      if (generation !== hoverPreviewGeneration) return false;
      const direction: -1 | 1 = transition.target > cursor ? 1 : -1;
      const stepIndex = direction > 0 ? cursor : transition.target;
      const sourceStep = activeTimeline.steps[stepIndex]?.step;
      canvas.dataset.hoverPreviewSpeed = String(Math.min(10, transition.speedMultiplier));
      canvas.dataset.hoverPreviewRemaining = String(transition.physicalMovesRemaining);
      if (sourceStep) {
        const animatedStep = direction > 0
          ? sourceStep
          : {...sourceStep, turns: -sourceStep.turns};
        const transform = turnTransform(size, animatedStep);
        if (transform) {
          const duration = 720
            * (Math.abs(transform.angle) > Math.PI / 2 + 0.01 ? 1.35 : 1)
            / Math.min(10, transition.speedMultiplier);
          await viewport.animateTurn(transform, duration);
        }
      }
      if (generation !== hoverPreviewGeneration) return false;
      cursor = transition.target;
      hoverPreviewCursor = cursor;
      setHoverPreviewState(cursor);
    }
    return generation === hoverPreviewGeneration;
  };

  const clearTurnGuide = (mode: "immediate" | "hold" | "restore" = "immediate") => {
    const generation = ++hoverPreviewGeneration;
    guidedToken?.classList.remove("turn-guided");
    guidedToken?.classList.remove("recovery-guided");
    guidedToken = null;
    activeTurnGuide = null;
    viewport?.setTurnGuide(null);
    delete canvas.dataset.previewMoveIndex;
    delete canvas.dataset.previewFacelets;
    delete canvas.dataset.hoverPreviewTarget;
    delete canvas.dataset.hoverPreviewSpeed;
    delete canvas.dataset.hoverPreviewRemaining;
    viewport?.setTurnPreview(null);
    viewport?.cancelTurn();
    previewedMoveIndex = null;
    if (mode === "hold") {
      canvas.dataset.hoverPreviewHeld = "true";
      return;
    }
    delete canvas.dataset.hoverPreviewHeld;
    const finishRestore = () => {
      if (generation !== hoverPreviewGeneration) return;
      hoverPreviewCursor = null;
      delete canvas.dataset.hoverPreviewIndex;
      delete canvas.dataset.hoverPreviewFacelets;
      const displayed = smartCubeRenderedState ?? smartCubeLiveState
        ?? activeTimeline?.states?.[activeIndex];
      if (displayed) {
        viewport?.setState(displayed, viewportPalette());
        refreshTutorialFocus();
      }
    };
    if (mode === "restore" && hoverPreviewCursor !== null && hoverPreviewCursor !== activeIndex) {
      void animateHoverPreviewTo(activeIndex, generation).then(finishRestore);
    } else {
      finishRestore();
    }
  };

  const pastMoveTokens = (timelineIndex: number, count = 60): string[] => {
    if (!activeTimeline?.labels) return [];
    const result: string[] = [];
    for (let i = timelineIndex - 1; i >= 0 && result.length < count; i--) {
      const step = activeTimeline.steps[i];
      const label = activeTimeline.labels[i];
      if (label && step?.step && step.kind !== "pause") {
        result.unshift(label);
      }
    }
    return result;
  };

  const upcomingMoveTokens = (timelineIndex: number, count = 60): string[] => {
    if (!activeTimeline?.labels) return [];
    const result: string[] = [];
    for (let i = timelineIndex + 1; i < activeTimeline.labels.length && result.length < count; i++) {
      const step = activeTimeline.steps[i];
      const label = activeTimeline.labels[i];
      if (label && step?.step && step.kind !== "pause") {
        result.push(label);
      }
    }
    return result;
  };

  const syncMoveRibbon = (timelineIndex = activeIndex) => {
    if (!viewport?.setMoveRibbon) return;
    if (!activeTimeline?.labels || activeTimeline.labels.length === 0) {
      viewport.setMoveRibbon(null);
      return;
    }
    const safeIdx = Math.max(0, Math.min(activeTimeline.labels.length - 1, timelineIndex));
    const currentLabel = activeTimeline.labels[safeIdx] ?? "";
    const step = activeTimeline.steps[safeIdx]?.step;
    viewport.setMoveRibbon({
      step,
      label: currentLabel,
      past: pastMoveTokens(safeIdx, 60),
      upcoming: upcomingMoveTokens(safeIdx, 60),
    });
  };

  const activateTurnGuide = (
    token: HTMLElement,
    step: MoveStep,
    label: string,
    moveIndex: number,
  ) => {
    if (!timelineHoverEnabled(playbackDirection)) return;
    const generation = ++hoverPreviewGeneration;
    viewport?.cancelTurn();
    viewport?.setTurnPreview(null);
    guidedToken?.classList.remove("turn-guided");
    guidedToken = token;
    activeTurnGuide = {
      step,
      label,
      past: pastMoveTokens(moveIndex, 8),
      upcoming: upcomingMoveTokens(moveIndex, 12),
    };
    token.classList.add("turn-guided");
    const before = activeTimeline?.states?.[moveIndex];
    if (before) {
      previewedMoveIndex = moveIndex;
      if (moveIndex === (hoverPreviewCursor ?? activeIndex)) {
        setHoverPreviewState(moveIndex);
        viewport?.setTurnPreview(turnTransform(before.size, step));
        canvas.dataset.previewMoveIndex = String(moveIndex);
        canvas.dataset.previewFacelets = FaceletCodec.render(before);
        viewport?.setTurnGuide(turnGuides && activeTurnGuide ? activeTurnGuide : null);
        return;
      }
      viewport?.setTurnGuide(null);
      void animateHoverPreviewTo(moveIndex, generation).then((arrived) => {
        if (!arrived || generation !== hoverPreviewGeneration || guidedToken !== token) return;
        setHoverPreviewState(moveIndex);
        viewport?.setTurnPreview(turnTransform(before.size, step));
        canvas.dataset.previewMoveIndex = String(moveIndex);
        canvas.dataset.previewFacelets = FaceletCodec.render(before);
        viewport?.setTurnGuide(turnGuides && activeTurnGuide ? activeTurnGuide : null);
      });
      return;
    }
    viewport?.setTurnGuide(
      turnGuides && activeTurnGuide ? activeTurnGuide : null,
    );
  };

  const firstFocusPieceInPhase = (phase: TutorialPhaseRange): string | null => {
    if (!activeTimeline?.states) return null;
    let index = phase.start;
    while (index < phase.end) {
      const groupId = activeTimeline.steps[index]?.groupId;
      if (groupId === undefined) {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < phase.end && activeTimeline.steps[end]?.groupId === groupId) end += 1;
      const entries = activeTimeline.steps.slice(index, end);
      const onlyRotations = entries.every((entry) =>
        entry.step === undefined || entry.step.move.TAG === "Rotation"
      );
      if (!onlyRotations) {
        const piece = selectTutorialPiece(
          activeTimeline.states[index],
          activeTimeline.states[end],
          phaseFocusNumber(phase),
        );
        if (piece) return piece;
      }
      index = end;
    }
    return selectPhasePiece(activeTimeline.states[phase.start], phaseFocusNumber(phase));
  };

  const phaseFocusNumber = (phase: TutorialPhaseRange): number => {
    if (isCfopMethod(phase.method)) return [1, 3, 5, 7][phase.number - 1] ?? phase.number;
    if (isPetrusMethod(phase.method)) {
      if (phase.method === "enhancedPetrus" && phase.number === 5) return 12;
      return [8, 9, 10, 11, 12, 13, 14][phase.number - 1] ?? phase.number;
    }
    return phase.number;
  };

  const updateAcademyComparison = () => {
    const compared = academies.flatMap((academy) => {
      const moveCount = savedTutorialSolutions.get(academy.method)?.solution.moveCount;
      return moveCount === undefined ? [] : [{label: academy.label, moveCount}];
    });
    academyComparison.hidden = compared.length < 2;
    if (compared.length < 2) {
      academyComparison.textContent = "";
      return;
    }
    const best = compared.reduce((left, right) => right.moveCount < left.moveCount ? right : left);
    academyComparison.textContent = `Same-state comparison · ${compared
      .map(({label, moveCount}) => `${label} ${moveCount} HTM`)
      .join(" · ")}. Shortest: ${best.label}.`;
  };

  const selectedTutorialMethod = (): TutorialMethod => academyMethod;

  const isSolvedState = (state: CubeState): boolean => {
    const solved = StateTypes.solved(state.size) as Result<CubeState, unknown>;
    return solved.TAG === "Ok" && FaceletCodec.render(state) === FaceletCodec.render(solved._0);
  };

  const academyTargetState = (): Result<CubeState, string> => {
    const parsed = parseState(academyTarget.value);
    return parsed.TAG === "Ok"
      ? {TAG: "Ok", _0: parsed._0.state}
      : {TAG: "Error", _0: describeError(parsed._0)};
  };

  const academyTargetDiagnostic = (): string | null => {
    if (activeRecognized === null || size !== 3) return null;
    const target = academyTargetState();
    if (target.TAG === "Error") return target._0;
    const relative = relativeAcademyState(activeRecognized.state, target._0);
    return relative.TAG === "Error" ? relative._0 : null;
  };

  const updateAcademySolveButton = () => {
    const method = selectedTutorialMethod();
    academySolve.disabled = academySolveBusy
      || activeRecognized === null
      || academyTargetDiagnostic() !== null
      || size !== 3;
    academySolve.textContent = savedTutorialSolutions.has(method)
      ? "Regenerate solution"
      : activeRecognized && isSolvedState(activeRecognized.state)
        ? "Show solved phases"
        : "Generate verified solution";
  };

  const resetAcademy = () => {
    tutorialPhases = [];
    activeAcademy = null;
    commentedTutorialSolution = "";
    savedTutorialSolutions.clear();
    updateAcademyComparison();
    updateAcademySolveButton();
    academies.forEach((academy) => {
      academy.phases.replaceChildren();
      academy.current.hidden = true;
      academy.copy.disabled = true;
      academy.solution.hidden = true;
      academy.solution.textContent = "";
    });
    coachingControls.hidden = true;
    coachStatus.textContent = "";
  };

  const updateAcademySource = (recognized: RecognizedInput | null) => {
    academyRequestGuard.invalidate();
    academySolveBusy = false;
    activeRecognized = recognized;
    resetAcademy();
    academies.forEach((academy) => {
      academy.status.classList.remove("error");
      academy.status.textContent = size !== 3
        ? `${academy.label} Academy is available for 3×3 states.`
        : recognized === null
          ? "Enter a valid 3×3 state to begin."
          : isSolvedState(recognized.state) && academyTarget.value.trim() === ""
            ? "This cube is already solved. Every Academy phase is satisfied at 0 HTM; load a scramble for a non-zero tutorial."
            : `Ready to teach the recognized ${recognized.label.toLowerCase()} setup to the selected target pattern.`;
    });
    const diagnostic = academyTargetDiagnostic();
    if (diagnostic !== null) {
      const academy = academyForMethod(selectedTutorialMethod());
      academy.status.textContent = diagnostic;
      academy.status.classList.add("error");
    }
    updateAcademySolveButton();
  };

  const updateTutorialUi = () => {
    if (tutorialPhases.length === 0 || activeAcademy === null) return;
    const current = tutorialPhases.find((phase) =>
      phase.end > phase.start && activeIndex >= phase.start && activeIndex < phase.end
    ) ?? (activeIndex === 0 ? tutorialPhases[0] : tutorialPhases.at(-1))!;
    showTutorialPhase(current);
  };

  const showTutorialPhase = (current: TutorialPhaseRange, alreadySatisfied = false) => {
    if (activeAcademy === null) return;
    activeAcademy.current.hidden = false;
    activeAcademy.current.textContent = `Step ${current.number}: ${current.title} — ${current.instruction}${alreadySatisfied ? " Already satisfied by the preceding plan." : ""}`;
    activeAcademy.phases.querySelectorAll<HTMLElement>("[data-tutorial-phase]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.tutorialPhase) === current.number);
    });
  };

  const tutorialPhaseMoveCount = (phase: TutorialPhase): number => {
    const expanded = MoveExecutor.expand(phase.alg) as Result<MoveStep[], unknown>;
    if (expanded.TAG === "Error") return 0;
    return expanded._0.filter((step) => step.move.TAG !== "Rotation").length;
  };

  const tutorialPhaseExecutionCount = (phase: TutorialPhase): number => {
    const expanded = MoveExecutor.expand(phase.alg) as Result<MoveStep[], unknown>;
    return expanded.TAG === "Ok" ? expanded._0.length : 0;
  };

  const compatibilityLabels: Record<keyof CompatibilityResult, string> = {
    wca: "WCA tokens",
    signLgn: "SiGN / LGN",
    cubingJs: "cubing.js / Twizzle",
    speedsolving: "SpeedSolving Wiki",
    ruwix: "Ruwix Advanced",
  };
  const compatibilitySuccess: Record<keyof CompatibilityResult, string> = {
    wca: "Uses only the WCA Article 12 move-token subset. This does not determine event-specific competition legality.",
    signLgn: "The original source fits the normative SiGN/LGN grammar used by this profile.",
    cubingJs: "The original source is portable to the documented cubing.js/Twizzle algorithm grammar.",
    speedsolving: "The original source uses conventions documented by the SpeedSolving Wiki profile.",
    ruwix: "The original source uses move forms documented by Ruwix Advanced notation.",
  };

  const updateCompatibility = (recognized: RecognizedInput | null) => {
    compatibilityStrip.hidden = !recognized?.timeline;
    if (!recognized?.timeline) return;
    const result = MoveCompatibility.evaluate(
      input.value,
      lowercaseMode,
      notationDialect,
      recognized.timeline.alg,
    ) as CompatibilityResult;
    (Object.keys(compatibilityLabels) as Array<keyof CompatibilityResult>).forEach((profile) => {
      const assessment = result[profile];
      const pill = root.querySelector<HTMLElement>(`[data-compatibility-profile="${profile}"]`)!;
      pill.textContent = `${assessment.compatible ? "✓" : "×"} ${compatibilityLabels[profile]}`;
      pill.classList.toggle("compatible", assessment.compatible);
      pill.classList.toggle("incompatible", !assessment.compatible);
      const explanation = assessment.compatible
        ? compatibilitySuccess[profile]
        : assessment.reasons.join(" ");
      pill.title = explanation;
      pill.setAttribute("aria-label", `${compatibilityLabels[profile]}: ${explanation}`);
    });
  };

  const updateTransformAvailability = (available: boolean) => {
    transformButtons.forEach((button) => {
      button.disabled = button.dataset.algTransform === "unfold"
        ? !macroDefinition.test(movesInput.value)
        : !available;
    });
  };

  // Transforms (Invert, Simplify, Normalize, Mirror, Rotate) operate on the
  // Moves field, not on Setup: Setup may itself be a state, not an
  // algorithm, so its own validity is irrelevant to whether these apply.
  const movesTransformReady = (): boolean => {
    if (movesInput.value.trim() === "") return false;
    const parsed = parseMovesEditor(movesInput.value);
    return parsed.TAG === "Ok";
  };

  // AlgorithmOptimizer only supports 3x3 (it reuses BeginnerSolver's atomic
  // per-piece distance tables, which are hardcoded to that size), so the
  // shorten button has a stricter availability gate than the other
  // Moves-targeting transforms above.
  const updateShortenAvailability = () => {
    shortenSearch.disabled = !movesTransformReady() || size !== 3;
    shortenResult.hidden = true;
    pendingShortenedAlg = null;
  };

  const updatePlaybackUi = (rebuild = false) => {
    playback.hidden = activeTimeline === null && hamiltonStream === null;
    if (hamiltonStream !== null && activeTimeline === null) {
      if (rebuild) {
        clearTutorialFocus();
        clearTurnGuide();
        moveRibbon.replaceChildren();
        const notice = document.createElement("span");
        notice.className = "timeline-empty";
        notice.textContent = "Hamilton streaming mode · generator-owned cursor · tape scrubbing unavailable";
        moveRibbon.append(notice);
      }
      playbackLimit.hidden = false;
      playbackLimit.textContent = `QTM ${hamiltonStream.quarterTurnsPlayed.toString()} of ${hamiltonStream.measurement.quarterTurns.toString()} · streaming retains one generator cursor, so rewind, end, and arbitrary tape scrubbing are unavailable.`;
      playbackPosition.textContent = `Move ${hamiltonStream.player.movesPlayed.toString()} of ${hamiltonStream.measurement.moveEvents.toString()}`;
      playbackHtm.textContent = `${hamiltonStream.player.movesPlayed.toString()} of ${hamiltonStream.measurement.moveEvents.toString()}`;
      scrubber.disabled = true;
      playbackBegin.disabled = true;
      root.querySelector<HTMLButtonElement>("[data-playback-back]")!.disabled = true;
      playbackReverse.disabled = true;
      playbackPause.disabled = playbackDirection !== 1;
      playbackPlay.disabled = playbackDirection === 1 || hamiltonStream.player.done;
      root.querySelector<HTMLButtonElement>("[data-playback-forward]")!.disabled =
        playbackDirection === 1 || hamiltonStream.player.done;
      playbackEnd.disabled = true;
      playbackReverse.classList.remove("is-playing");
      playbackReverse.setAttribute("aria-pressed", "false");
      playbackPlay.classList.toggle("is-playing", playbackDirection === 1);
      playbackPlay.setAttribute("aria-pressed", String(playbackDirection === 1));
      moveRibbon.dataset.hoverPreview = "disabled";
      return;
    }
    if (!activeTimeline) return;
    const playable = activeTimeline.states !== null && activeTimeline.steps.length > 0;
    if (rebuild) {
      clearTutorialFocus();
      clearTurnGuide();
      moveRibbon.replaceChildren();
      let currentGroupId: number | undefined;
      let groupContainer: HTMLSpanElement | null = null;
      let groupEntries: AlgorithmTimeline["steps"] = [];
      const finishGroup = () => {
        if (!groupContainer) return;
        const container = groupContainer;
        const entries = [...groupEntries];
        const groupIndex = activeTimeline.steps.indexOf(groupEntries[0]);
        const phase = tutorialPhases.find((item) => groupIndex >= item.start && groupIndex < item.end);
        const description = tutorialSequenceDescription(activeTimeline.steps, groupIndex, phase)
          ?? describeTimelineGroup(groupEntries, phase);
        container.dataset.groupStart = String(groupIndex);
        container.dataset.groupEnd = String(groupIndex + entries.length);
        container.dataset.sequenceDescription = description;
        container.setAttribute("aria-label", `Algorithm sequence purpose: ${description}`);
        container.tabIndex = 0;
        const onlyRotations = entries.every((entry) =>
          entry.step === undefined || entry.step.move.TAG === "Rotation"
        );
        const before = activeTimeline?.states?.[groupIndex];
        const after = activeTimeline?.states?.[groupIndex + entries.length];
        const piece = phase && before && after && !onlyRotations
          ? selectTutorialPiece(before, after, phaseFocusNumber(phase))
          : null;
        if (piece) container.dataset.focusPiece = piece;
        const rotationIndex = onlyRotations
          ? entries.findIndex((entry) => entry.step?.move.TAG === "Rotation")
          : -1;
        const rotationEntry = rotationIndex >= 0 ? entries[rotationIndex] : undefined;
        const rotationTimelineIndex = groupIndex + rotationIndex;
        const showFocus = () => {
          if (!timelineHoverEnabled(playbackDirection)) return;
          if (rotationEntry?.step) {
            const token = container.querySelector<HTMLButtonElement>(
              `[data-move-index="${rotationTimelineIndex + 1}"]`,
            );
            if (token) activateTurnGuide(
              token,
              rotationEntry.step,
              activeTimeline!.labels[rotationTimelineIndex] ?? "",
              rotationTimelineIndex,
            );
          } else activateTutorialFocus(container, piece);
        };
        container.addEventListener("mouseenter", showFocus);
        container.addEventListener("mouseleave", (event) => {
          if (!container.contains(document.activeElement)) {
            const destination = event.relatedTarget as Node | null;
            if (onlyRotations) {
              clearTurnGuide(destination && moveRibbon.contains(destination) ? "hold" : "restore");
            } else if (focusedGroup === container) {
              clearTutorialFocus(destination && moveRibbon.contains(destination) ? "hold" : "restore");
            }
          }
        });
        container.addEventListener("focusin", showFocus);
        container.addEventListener("focusout", (event) => {
          const destination = event.relatedTarget as Node | null;
          if (!destination || !container.contains(destination)) {
            if (onlyRotations) clearTurnGuide("restore");
            else if (focusedGroup === container) clearTutorialFocus();
          }
        });
      };
      activeTimeline.labels.forEach((label, index) => {
        const entry = activeTimeline!.steps[index];
        if (entry.groupId !== currentGroupId) {
          finishGroup();
          currentGroupId = entry.groupId;
          groupContainer = null;
          groupEntries = [];
          if (currentGroupId !== undefined) {
            groupContainer = document.createElement("span");
            groupContainer.className = "move-group";
            moveRibbon.append(groupContainer);
          }
        }
        const isPause = entry.step === undefined;
        if (groupContainer) {
          groupEntries.push(entry);
        }
        if (isPause) {
          if (entry.durationMs !== undefined && entry.durationMs < 1_000) return;
          const gap = document.createElement("span");
          gap.className = entry.durationMs === undefined
            ? "timeline-gap pause-gap"
            : "timeline-gap step-gap";
          gap.setAttribute("aria-hidden", "true");
          moveRibbon.append(gap);
          return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "move-token";
        button.textContent = label;
        button.dataset.moveLabel = label;
        button.dataset.moveIndex = String(index + 1);
        button.setAttribute("aria-label", `Go to step ${index + 1}: ${label}`);
        const showTurn = () => activateTurnGuide(button, entry.step!, label, index);
        button.addEventListener("mouseenter", showTurn);
        button.addEventListener("mouseleave", () => {
          if (guidedToken === button && document.activeElement !== button) clearTurnGuide("hold");
        });
        button.addEventListener("focus", showTurn);
        button.addEventListener("blur", () => {
          if (guidedToken === button) clearTurnGuide("restore");
        });
        (groupContainer ?? moveRibbon).append(button);
      });
      finishGroup();
      if (activeTimeline.labels.length === 0) {
        const empty = document.createElement("span");
        empty.className = "timeline-empty";
        empty.textContent = "State snapshot · no moves to play";
        moveRibbon.append(empty);
      }
    }
    playbackLimit.hidden = activeTimeline.states !== null;
    playbackLimit.textContent = activeTimeline.states === null
      ? `Final conversion is available; playback is limited to ${MAX_PLAYBACK_STEPS} expanded moves.`
      : "";
    const moveProgress = physicalMoveProgress(activeTimeline.steps, activeIndex);
    playbackPosition.textContent = `Move ${moveProgress.current} of ${moveProgress.total}`;
    playbackHtm.textContent = `${moveProgress.htmCurrent} of ${moveProgress.htmTotal}`;
    scrubber.max = String(activeTimeline.steps.length);
    scrubber.value = String(activeIndex);
    scrubber.disabled = !playable;
    playbackBegin.disabled = !playable || activeIndex === 0;
    root.querySelector<HTMLButtonElement>("[data-playback-back]")!.disabled = !playable || activeIndex === 0;
    playbackReverse.disabled = !playable || activeIndex === 0;
    playbackPause.disabled = !playable || (playbackDirection === 0 && !smartCubeCoachingWaiting);
    playbackPlay.disabled = !playable || activeIndex === activeTimeline.steps.length;
    root.querySelector<HTMLButtonElement>("[data-playback-forward]")!.disabled =
      !playable || activeIndex === activeTimeline.steps.length;
    playbackEnd.disabled = !playable || activeIndex === activeTimeline.steps.length;
    playbackReverse.classList.toggle("is-playing", playbackDirection === -1);
    playbackReverse.setAttribute("aria-pressed", String(playbackDirection === -1));
    const forwardActive = playbackDirection === 1 || smartCubeCoachingWaiting;
    playbackPlay.classList.toggle("is-playing", forwardActive);
    playbackPlay.setAttribute("aria-pressed", String(forwardActive));
    moveRibbon.dataset.hoverPreview = !smartCubeCoachingWaiting && timelineHoverEnabled(playbackDirection)
      ? "enabled"
      : "disabled";
    moveRibbon.querySelectorAll<HTMLButtonElement>("[data-move-index]").forEach((button) => {
      const moveIndex = Number(button.dataset.moveIndex);
      button.textContent = button.dataset.moveLabel ?? button.textContent;
      delete button.dataset.halfTurnProgress;
      button.classList.toggle("completed", moveIndex <= activeIndex);
      button.classList.toggle("active", moveIndex === activeIndex);
      button.disabled = !playable;
    });
    if (smartCubeHalfTurnProgress) {
      const progressButton = moveRibbon.querySelector<HTMLButtonElement>(
        `[data-move-index="${smartCubeHalfTurnProgress.timelineIndex + 1}"]`,
      );
      const remaining = nextSmartCubeProgressMoves(smartCubeHalfTurnProgress)[0];
      if (progressButton && remaining) {
        progressButton.textContent = [
          ...smartCubeHalfTurnProgress.receivedMoves,
          remaining,
        ].map((move) => smartCubeMoveInLessonFrame(
          activeTimeline.steps,
          activeTimeline.labels,
          smartCubeHalfTurnProgress!.timelineIndex,
          move,
        )).join(" ");
        progressButton.dataset.halfTurnProgress = "true";
      }
    }
    if (smartCubeRotationWait && activeTimeline) {
      const rotationStep = activeTimeline.steps[smartCubeRotationWait.action.timelineIndex]?.step;
      if (rotationStep?.move.TAG === "Rotation" && Math.abs(rotationStep.turns) % 4 === 2) {
        const quarterTurn = smartCubeRotationWait.partialTurn
          || (rotationStep.turns < 0 ? -1 : 1);
        const quarterLabel = `${rotationStep.move._0.toLowerCase()}${quarterTurn < 0 ? "'" : ""}`;
        const progressButton = moveRibbon.querySelector<HTMLButtonElement>(
          `[data-move-index="${smartCubeRotationWait.action.timelineIndex + 1}"]`,
        );
        if (progressButton) {
          progressButton.textContent = `${quarterLabel} ${quarterLabel}`;
          progressButton.dataset.halfTurnProgress = "true";
        }
      }
    }
    moveRibbon.querySelector<HTMLElement>(".move-token.active")?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    updateTutorialUi();
  };

  const stopPlayback = () => {
    playbackGeneration += 1;
    playbackDirection = 0;
    smartCubeCoachingWaiting = false;
    viewport?.cancelTurn();
    viewport?.setMilestone(null);
    viewport?.setFocus(null);
    coachStatus.textContent = "";
    smartCubeRotationWait = null;
    updatePlaybackUi();
  };

  const renderTimelineIndex = (index: number) => {
    if (!activeTimeline?.states) return;
    activeIndex = Math.max(0, Math.min(index, activeTimeline.steps.length));
    renderState(activeTimeline.states[activeIndex], status.textContent ?? "Algorithm");
    refreshTutorialFocus();
    updatePlaybackUi();
    syncMoveRibbon(activeIndex);
  };

  const setSmartCubeTimelineIndex = (index: number) => {
    if (!activeTimeline) return;
    activeIndex = Math.max(0, Math.min(index, activeTimeline.steps.length));
    refreshTutorialFocus();
    updatePlaybackUi();
    syncMoveRibbon(activeIndex);
  };

  const transitionTo = async (
    target: number,
    generation: number,
    speedMultiplier = 1,
  ): Promise<boolean> => {
    if (!activeTimeline?.states || generation !== playbackGeneration) return false;
    const bounded = Math.max(0, Math.min(target, activeTimeline.steps.length));
    const direction = bounded - activeIndex;
    if (Math.abs(direction) !== 1 || !viewport) {
      renderTimelineIndex(bounded);
      return generation === playbackGeneration;
    }
    const stepIndex = direction > 0 ? activeIndex : bounded;
    const sourceStep = activeTimeline.steps[stepIndex].step;
    if (!sourceStep) {
      const completedPhase = direction > 0
        ? tutorialPhases.find((phase) => phase.end - 1 === stepIndex)
        : undefined;
      if (tutorialPhases.length > 0 && !coachedPlayback) {
        renderTimelineIndex(bounded);
        return generation === playbackGeneration;
      }
      if (completedPhase) {
        const phaseState = activeTimeline.states[bounded];
        renderTimelineIndex(bounded);
        clearTutorialFocus();
        clearTurnGuide();
        const final = completedPhase.number === tutorialPhases.length;
        const milestoneLabel = final
          ? `Cube solved — all ${tutorialPhases.length} ${isCfopMethod(completedPhase.method) ? "CFOP stages" : "steps"} verified`
          : `Step ${completedPhase.number} complete — ${completedPhase.title} verified`;
        coachStatus.textContent = milestoneLabel;
        viewport.setMilestone({
          positions: phaseMilestonePositions(phaseState, phaseFocusNumber(completedPhase)),
          label: `✦ ${milestoneLabel}`,
        });
        await new Promise((resolve) =>
          window.setTimeout(resolve, (final ? 500 : 350) / playbackSpeed / speedMultiplier)
        );
        if (generation !== playbackGeneration) return false;
        const nextPhase = tutorialPhases.find((phase) => phase.number === completedPhase.number + 1);
        const cameraTargets: Record<number, {yaw: number; pitch: number}> = {
          2: {yaw: -0.72, pitch: 0.58},
          3: {yaw: -0.58, pitch: 0.55},
          4: {yaw: -0.38, pitch: 0.82},
          5: {yaw: -0.48, pitch: 0.74},
          6: {yaw: -0.68, pitch: 0.62},
          7: {yaw: -0.58, pitch: 0.68},
        };
        viewport.setMilestone(null);
        const camera = nextPhase
          ? cameraTargets[phaseFocusNumber(nextPhase)]
          : {yaw: -0.62, pitch: 0.48};
        await viewport.smoothOrbitTo(
          camera.yaw,
          camera.pitch,
          450 / playbackSpeed / speedMultiplier,
        );
        if (generation !== playbackGeneration) return false;
        if (nextPhase) {
          const piece = selectPhasePiece(phaseState, phaseFocusNumber(nextPhase));
          const nextFocus = piece ? focusForPiece(phaseState, piece) : null;
          coachStatus.textContent = `Next: ${nextPhase.title}. ${nextPhase.instruction}`;
          viewport.setFocus(nextFocus ? {...nextFocus, label: `Next: ${nextPhase.title}`} : null);
          await new Promise((resolve) =>
            window.setTimeout(resolve, 400 / playbackSpeed / speedMultiplier)
          );
          if (generation !== playbackGeneration) return false;
          viewport.setFocus(null);
        }
        coachStatus.textContent = "";
        return true;
      }
      const pauseDuration = activeTimeline.steps[stepIndex].durationMs ?? 280;
      await new Promise((resolve) =>
        window.setTimeout(resolve, pauseDuration / playbackSpeed / speedMultiplier)
      );
      if (generation !== playbackGeneration) return false;
      renderTimelineIndex(bounded);
      return true;
    }
    const animatedStep: MoveStep = direction > 0
      ? sourceStep
      : {...sourceStep, turns: -sourceStep.turns};
    const transform = turnTransform(size, animatedStep);
    if (!transform) {
      renderTimelineIndex(bounded);
      return generation === playbackGeneration;
    }
    const duration = 720
      * (Math.abs(transform.angle) > Math.PI / 2 + 0.01 ? 1.35 : 1)
      / playbackSpeed
      / speedMultiplier;

    if (turnGuides) {
      const guideLabel = activeTimeline.labels[stepIndex] ?? "";
      viewport.setTurnGuide({
        step: animatedStep,
        label: guideLabel,
        past: pastMoveTokens(stepIndex, 8),
        upcoming: upcomingMoveTokens(stepIndex, 12),
      });
    }

    try {
      await viewport.animateTurn(transform, duration);
    } finally {
      if (turnGuides && !activeTurnGuide) {
        viewport.setTurnGuide(null);
      }
    }
    if (generation !== playbackGeneration) return false;
    renderTimelineIndex(bounded);
    return true;
  };

  const seek = async (target: number, animate: boolean) => {
    stopPlayback();
    const generation = playbackGeneration;
    if (animate) {
      await transitionTo(target, generation);
    } else {
      renderTimelineIndex(target);
    }
  };

  const seekTimelineToken = async (target: number) => {
    if (!activeTimeline?.states) return;
    const plan = planTimelineClick(activeTimeline.steps, activeIndex, target);
    clearTurnGuide();
    stopPlayback();
    const generation = playbackGeneration;
    moveRibbon.dataset.navigationMode = plan.jumpTo !== null
      ? "time-travel"
      : plan.speedMultiplier === 2
        ? "sequence"
        : "adjacent";
    moveRibbon.dataset.navigationSpeed = String(playbackSpeed * plan.speedMultiplier);
    if (plan.jumpTo !== null) renderTimelineIndex(plan.jumpTo);
    for (const next of plan.targets) {
      if (!(await transitionTo(next, generation, plan.speedMultiplier))) return;
    }
  };

  const animatePlannedMove = async (
    moveIndex: number,
    direction: -1 | 1,
    generation: number,
  ): Promise<boolean> => {
    const source = direction > 0 ? moveIndex : moveIndex + 1;
    if (activeIndex !== source) renderTimelineIndex(source);
    return transitionTo(direction > 0 ? moveIndex + 1 : moveIndex, generation);
  };

  const executeSingleMove = async (direction: -1 | 1) => {
    if (hamiltonStream !== null && activeTimeline === null) {
      if (direction > 0) await advanceHamiltonStream(playbackGeneration);
      return;
    }
    if (!activeTimeline?.states) return;
    const sequence = planSequenceStep(activeTimeline.steps, activeIndex, direction);
    const moveIndex = sequence?.moveIndices[0];
    if (moveIndex === undefined) return;
    clearTutorialFocus();
    clearTurnGuide();
    stopPlayback();
    const generation = playbackGeneration;
    await animatePlannedMove(moveIndex, direction, generation);
  };

  const showNextSequencePurpose = () => {
    if (!activeTimeline?.states) return;
    const sequence = nextSequence(activeTimeline.steps, activeIndex);
    if (!sequence) {
      clearTutorialFocus();
      return;
    }
    const group = moveRibbon.querySelector<HTMLElement>(
      `[data-group-start="${sequence.start}"]`,
    );
    if (!group) return;
    const piece = group.dataset.focusPiece ?? null;
    canvas.dataset.sequencePurposeStart = String(sequence.start);
    activateTutorialFocus(group, piece);
    group.scrollIntoView({block: "nearest", inline: "nearest"});
  };

  const executeSequence = async (direction: -1 | 1) => {
    if (!activeTimeline?.states) return;
    const sequence = planSequenceStep(activeTimeline.steps, activeIndex, direction);
    if (!sequence || sequence.moveIndices.length === 0) return;
    clearTutorialFocus();
    clearTurnGuide();
    stopPlayback();
    const generation = playbackGeneration;
    for (const moveIndex of sequence.moveIndices) {
      if (!(await animatePlannedMove(moveIndex, direction, generation))) return;
    }
    showNextSequencePurpose();
  };

  const play = async (direction: -1 | 1) => {
    if (hamiltonStream !== null && activeTimeline === null) {
      if (direction > 0) await playHamiltonStream();
      return;
    }
    if (!activeTimeline?.states || activeTimeline.steps.length === 0) return;
    if (
      (direction < 0 && activeIndex === 0)
      || (direction > 0 && activeIndex === activeTimeline.steps.length)
    ) return;
    clearTutorialFocus();
    clearTurnGuide();
    stopPlayback();
    playbackDirection = direction;
    const generation = playbackGeneration;
    updatePlaybackUi();
    while (
      playbackDirection === direction
      && generation === playbackGeneration
      && activeTimeline
    ) {
      const atBoundary = direction > 0
        ? activeIndex === activeTimeline.steps.length
        : activeIndex === 0;
      if (atBoundary) {
        if (!looping) break;
        renderTimelineIndex(direction > 0 ? 0 : activeTimeline.steps.length);
      }
      if (!(await transitionTo(activeIndex + direction, generation))) return;
    }
    if (generation === playbackGeneration) {
      playbackDirection = 0;
      updatePlaybackUi();
    }
  };

  const advanceHamiltonStream = async (generation: number): Promise<boolean> => {
    if (hamiltonStream === null || activeTimeline !== null || generation !== playbackGeneration) return false;
    const next = hamiltonStream.player.next();
    if (next.done) {
      hamiltonResult.textContent = `Hamilton stream completed after ${hamiltonStream.player.movesPlayed.toString()} moves.`;
      return false;
    }
    const event = next.value;
    if (event.kind === "pause") {
      await new Promise((resolve) => window.setTimeout(resolve, event.durationMs / playbackSpeed));
      return generation === playbackGeneration;
    }
    const evaluated = evaluateAlgorithm(3, "Wide", "Modern", event.token);
    const step = evaluated.TAG === "Ok"
      ? evaluated._0.steps.find((entry) => entry.step !== undefined)?.step
      : undefined;
    if (!step) {
      hamiltonResult.textContent = `Could not stream '${event.token}' into the playback engine.`;
      hamiltonResult.classList.add("failure");
      return false;
    }
    const transform = turnTransform(3, step);
    if (transform && viewport) {
      await viewport.animateTurn(transform, 720
        * (Math.abs(transform.angle) > Math.PI / 2 + 0.01 ? 1.35 : 1)
        / playbackSpeed);
    }
    if (generation !== playbackGeneration || hamiltonStream === null) return false;
    hamiltonStream.state = MoveExecutor.applyStep(hamiltonStream.state, step) as CubeState;
    hamiltonStream.quarterTurnsPlayed += event.token.endsWith("2") ? 2n : 1n;
    renderState(hamiltonStream.state, `Hamilton stream · ${hamiltonStream.node} · ${event.token}`);
    updatePlaybackUi();
    return true;
  };

  const playHamiltonStream = async () => {
    if (hamiltonStream === null || activeTimeline !== null || playbackDirection === 1) return;
    clearTutorialFocus();
    clearTurnGuide();
    stopPlayback();
    playbackDirection = 1;
    const generation = playbackGeneration;
    updatePlaybackUi();
    while (playbackDirection === 1 && generation === playbackGeneration) {
      if (!(await advanceHamiltonStream(generation))) break;
    }
    if (generation === playbackGeneration) {
      playbackDirection = 0;
      updatePlaybackUi();
    }
  };

  const smartCubeStep = (move: string): MoveStep | null => {
    const evaluated = evaluateAlgorithm(3, "Wide", "Modern", move);
    if (evaluated.TAG === "Error") return null;
    return evaluated._0.steps.find((entry) => entry.step !== undefined)?.step ?? null;
  };

  const smartCubeLessonMove = (move: string, cursor = activeIndex): string =>
    smartCubeCoachingFrameActive && activeTimeline
      ? smartCubeMoveInLessonFrame(activeTimeline.steps, activeTimeline.labels, cursor, move)
      : move;

  const animateSmartCubeMove = async (move: string, cursor = activeIndex): Promise<void> => {
    const step = smartCubeStep(smartCubeLessonMove(move, cursor));
    const transform = step ? turnTransform(3, step) : null;
    if (transform && viewport) await viewport.animateTurn(transform, 120);
  };

  const updateSmartCubeSoundUi = () => {
    const enabled = smartCubeAudio.isEnabled();
    smartCubeSound.classList.toggle("active", enabled);
    smartCubeSound.setAttribute("aria-pressed", String(enabled));
    smartCubeSound.textContent = enabled ? "Sound on" : "Sound off";
  };
  updateSmartCubeSoundUi();

  const updateSmartCubeMistakeUi = () => {
    const count = smartCubeMistakeLog.length;
    smartCubeMistakes.hidden = count === 0;
    smartCubeMistakes.textContent = `${count} ${count === 1 ? "slip" : "slips"}`;
    smartCubeReroute.hidden = !smartCubeConnected || count < 3 || smartCubeLiveState === null;
  };

  const clearSmartCubeRecoveryBlock = () => {
    moveRibbon.querySelector("[data-smart-cube-recovery-block]")?.remove();
  };

  const renderSmartCubeRecoveryBlock = () => {
    clearSmartCubeRecoveryBlock();
    if (!smartCubeRecovery) return;
    const expectedToken = moveRibbon.querySelector<HTMLElement>(
      `[data-move-index="${smartCubeRecovery.expected.timelineIndex + 1}"]`,
    );
    if (!expectedToken?.parentElement) return;

    const block = document.createElement("span");
    block.className = "smart-cube-recovery-block";
    block.dataset.smartCubeRecoveryBlock = "true";
    block.setAttribute("aria-label", "Temporary recovery sequence");
    const appendToken = (move: string, side: "deviation" | "undo") => {
      const token = document.createElement("span");
      token.className = `smart-cube-recovery-token ${side}`;
      token.textContent = move;
      block.append(token);
    };
    smartCubeRecovery.deviations.forEach((move) => appendToken(move, "deviation"));
    const cursor = document.createElement("span");
    cursor.className = "smart-cube-recovery-cursor";
    cursor.dataset.smartCubeRecoveryCursor = "true";
    cursor.setAttribute("aria-label", "Physical cube cursor");
    block.append(cursor);
    smartCubeRecovery.undoMoves.forEach((move) => appendToken(move, "undo"));
    expectedToken.parentElement.insertBefore(block, expectedToken);
    block.scrollIntoView({block: "nearest", inline: "nearest"});
  };

  const recordSmartCubeMistake = (expected: string, received: string) => {
    smartCubeMistakeLog.push({expected, received, timestamp: Date.now()});
    updateSmartCubeMistakeUi();
  };

  const showSmartCubeRecoveryGuide = () => {
    if (!smartCubeRecovery) return;
    renderSmartCubeRecoveryBlock();
    const undo = smartCubeRecovery.undoMoves[0];
    const step = smartCubeStep(smartCubeLessonMove(
      undo,
      smartCubeRecovery.expected.timelineIndex,
    ));
    smartCubeCoachingWaiting = true;
    smartCubeDock.dataset.recovery = "true";
    const token = moveRibbon.querySelector<HTMLButtonElement>(
      `[data-move-index="${smartCubeRecovery.expected.timelineIndex + 1}"]`,
    );
    if (token) {
      guidedToken = token;
      token.classList.add("recovery-guided");
      token.scrollIntoView({block: "nearest", inline: "nearest"});
    }
    if (step) {
      activeTurnGuide = {
        step,
        label: `Undo ${undo}`,
        tone: "recovery",
        past: pastMoveTokens(smartCubeRecovery.expected.timelineIndex, 60),
        upcoming: [
          activeTimeline?.labels[smartCubeRecovery.expected.timelineIndex] ?? "",
          ...upcomingMoveTokens(smartCubeRecovery.expected.timelineIndex, 60),
        ].filter(Boolean),
      };
      viewport?.setTurnPreview(turnTransform(size, step));
      viewport?.setTurnGuide(turnGuides ? activeTurnGuide : null);
    }
    const prompt = smartCubeRecoveryPrompt(smartCubeRecovery);
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Undo ${undo}`;
    coachStatus.textContent = prompt;
    updatePlaybackUi();
  };

  const clearSmartCubeRecovery = () => {
    smartCubeRecovery = null;
    clearSmartCubeRecoveryBlock();
    delete smartCubeDock.dataset.recovery;
  };

  const signalSmartCubeFeedback = (
    cue: "correct" | "deviation" | "realigned" | "milestone",
  ) => {
    smartCubeAudio.play(cue);
    if (!smartCubeLedFeedback || !smartCubeManager) return;
    const milestone = cue === "milestone";
    if (cue !== "deviation" && !milestone) return;
    void smartCubeManager.flashLed(milestone ? "green" : "amber", milestone ? 1000 : 500)
      .catch(() => {
        // Hardware feedback is supplemental; visual recovery must remain uninterrupted.
      });
  };

  const demonstrateSmartCubeRotation = async (
    action: ExpectedSmartCubeAction & {kind: "rotation"},
    generation: number,
  ): Promise<boolean> => {
    if (!activeTimeline?.states || !viewport) return false;
    const step = activeTimeline.steps[action.timelineIndex]?.step;
    if (!step || step.move.TAG !== "Rotation" || Math.abs(step.turns) % 4 !== 2) {
      return transitionTo(action.timelineIndex + 1, generation, 0.5);
    }
    const quarterTurn: MoveStep = {...step, turns: step.turns < 0 ? -1 : 1};
    const transform = turnTransform(size, quarterTurn);
    if (!transform) return transitionTo(action.timelineIndex + 1, generation, 0.5);
    const quarterLabel = `${step.move._0.toLowerCase()}${quarterTurn.turns < 0 ? "'" : ""}`;
    const token = moveRibbon.querySelector<HTMLButtonElement>(
      `[data-move-index="${action.timelineIndex + 1}"]`,
    );
    if (token) {
      token.textContent = `${quarterLabel} ${quarterLabel}`;
      token.dataset.halfTurnProgress = "true";
    }
    const duration = 720 * 1.35 / playbackSpeed / 0.5 / 2;
    await viewport.animateTurn(transform, duration);
    if (generation !== playbackGeneration) return false;
    const halfway = MoveExecutor.applyStep(
      activeTimeline.states[action.timelineIndex],
      quarterTurn,
    ) as CubeState;
    viewport.setState(halfway, viewportPalette());
    activeTurnGuide = {
      step: quarterTurn,
      label: quarterLabel,
      past: pastMoveTokens(action.timelineIndex, 60),
      upcoming: upcomingMoveTokens(action.timelineIndex, 60),
    };
    viewport.setTurnPreview(turnTransform(size, quarterTurn));
    viewport.setTurnGuide(turnGuides ? activeTurnGuide : null);
    await viewport.animateTurn(transform, duration);
    if (generation !== playbackGeneration) return false;
    renderTimelineIndex(action.timelineIndex + 1);
    return true;
  };

  const syncSmartCubeTrackedOrientation = () => {
    if (
      smartCubeOrientationTracking
      && !smartCubeCoachingWaiting
      && latestSmartCubeOrientation
    ) {
      viewport?.setDeviceOrientation(
        latestSmartCubeOrientation.quaternion,
        latestSmartCubeOrientation.coordinateFrame,
      );
      return;
    }
    viewport?.setDeviceOrientation(null);
  };

  const waitForSmartCubeMove = () => {
    if (!smartCubeConnected || !activeTimeline?.states) return;
    clearTutorialFocus();
    clearTurnGuide();
    stopPlayback();
    if (smartCubeRecovery) {
      smartCubeCoachingFrameActive = true;
      renderSmartCubeCoachingState();
      showSmartCubeRecoveryGuide();
      syncSmartCubeTrackedOrientation();
      return;
    }
    smartCubeCoachingFrameActive = true;
    // Hardware facelets stay in the sensor's fixed frame. During coaching the
    // timeline owns presentation so a confirmed x/y/z regrip cannot be erased
    // by the next face packet.
    renderSmartCubeCoachingState();
    const action = nextExpectedSmartCubeAction(
      activeTimeline.steps,
      activeTimeline.labels,
      activeIndex,
    );
    if (!action) {
      smartCubeHalfTurnProgress = null;
      syncSmartCubeTrackedOrientation();
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Timeline complete`;
      coachStatus.textContent = "Physical sequence complete.";
      return;
    }
    if (action.kind === "rotation") {
      smartCubeHalfTurnProgress = null;
      smartCubeCoachingWaiting = true;
      const token = moveRibbon.querySelector<HTMLButtonElement>(
        `[data-move-index="${action.timelineIndex + 1}"]`,
      );
      const step = activeTimeline.steps[action.timelineIndex]?.step;
      if (step && token) {
        guidedToken = token;
        activeTurnGuide = {
          step,
          label: action.token,
          past: pastMoveTokens(action.timelineIndex, 60),
          upcoming: upcomingMoveTokens(action.timelineIndex, 60),
        };
        token.classList.add("turn-guided");
        token.scrollIntoView({block: "nearest", inline: "nearest"});
        viewport?.setTurnPreview(turnTransform(size, step));
        viewport?.setTurnGuide(turnGuides ? activeTurnGuide : null);
      }
      const generation = playbackGeneration;
      const baseline = smartCubeOrientationTracking ? latestSmartCubeOrientation : null;
      smartCubeRotationWait = {action, generation, baseline, partialTurn: 0};
      if (baseline) {
        // console.log(`[SmartCube Gyro] Waiting for rotation: ${action.token}`, {
        //   axis: step?.move.TAG === "Rotation" ? step.move._0 : undefined,
        //   turns: step?.turns,
        //   baseline: baseline.quaternion,
        //   coordinateFrame: baseline.coordinateFrame,
        // });
        smartCubeStatus.textContent = `${smartCubeDeviceName} · Waiting for ${action.token} regrip`;
        coachStatus.textContent = `Rotate the physical cube ${action.token}. Gyro feedback will continue automatically.`;
      } else {
        smartCubeStatus.textContent = `${smartCubeDeviceName} · Showing ${action.token} regrip`;
        coachStatus.textContent = `No active gyro. Demonstrating ${action.token} at half the selected move speed.`;
        void demonstrateSmartCubeRotation(action, generation).then((arrived) => {
          if (!arrived || smartCubeRotationWait?.generation !== generation) return;
          smartCubeRotationWait = null;
          signalSmartCubeFeedback("correct");
          smartCubeStatus.textContent = `${smartCubeDeviceName} · ${action.token} regrip shown`;
          waitForSmartCubeMove();
        });
      }
      updatePlaybackUi();
      // In solve mode the timeline owns the virtual cube. Gyro samples are
      // checkpoints for explicit x/y/z steps, never a second live transform.
      syncSmartCubeTrackedOrientation();
      return;
    }
    const expected = action;
    if (smartCubeHalfTurnProgress?.timelineIndex !== expected.timelineIndex) {
      smartCubeHalfTurnProgress = null;
    }
    smartCubeCoachingWaiting = true;
    const token = moveRibbon.querySelector<HTMLButtonElement>(
      `[data-move-index="${expected.timelineIndex + 1}"]`,
    );
    const progress = smartCubeHalfTurnProgress?.timelineIndex === expected.timelineIndex
      ? smartCubeHalfTurnProgress
      : null;
    const quarterToken = expected.token.endsWith("2")
      ? expected.token.slice(0, -1)
      : expected.token.endsWith("2'")
        ? `${expected.token.slice(0, -2)}'`
        : expected.token;
    const lessonQuarterMove = smartCubeLessonMove(quarterToken, expected.timelineIndex);
    const quarterStep = smartCubeStep(lessonQuarterMove)
      ?? activeTimeline.steps[expected.timelineIndex]?.step;
    const lessonFullMove = smartCubeLessonMove(expected.token, expected.timelineIndex);
    const fullStep = smartCubeStep(lessonFullMove)
      ?? activeTimeline.steps[expected.timelineIndex]?.step;

    if (quarterStep && token) {
      guidedToken = token;
      activeTurnGuide = {
        // Preview one physical quarter-turn, but retain the logical half-turn
        // in the guide so the viewport can show the required `2×` indicator before progress.
        step: progress ? quarterStep : (fullStep ?? quarterStep),
        label: progress ? quarterToken : expected.token,
        past: pastMoveTokens(expected.timelineIndex, 60),
        upcoming: upcomingMoveTokens(expected.timelineIndex, 60),
      };
      if (progress) {
        token.textContent = `${lessonQuarterMove} ${lessonQuarterMove}`;
        token.dataset.halfTurnProgress = "true";
      }
      token.classList.add("turn-guided");
      token.scrollIntoView({block: "nearest", inline: "nearest"});
      viewport?.setTurnPreview(turnTransform(size, quarterStep));
      viewport?.setTurnGuide(turnGuides ? activeTurnGuide : null);
    }
    smartCubeStatus.textContent = progress
      ? `${smartCubeDeviceName} · ${expected.token} halfway`
      : `${smartCubeDeviceName} · Waiting for ${expected.token}`;
    coachStatus.textContent = progress
      ? `${quarterToken} detected. Repeat it to complete ${expected.token}.`
      : `Next physical move: ${expected.token}. Waiting for the smart cube.`;
    updatePlaybackUi();
    syncSmartCubeTrackedOrientation();
  };

  const applyPartialHalfTurn = async (
    assessment: Extract<SmartCubeMoveAssessment, {status: "partial"}>,
  ): Promise<void> => {
    smartCubeHalfTurnProgress = assessment.progress;
    waitForSmartCubeMove();
    await animateSmartCubeMove(assessment.received, assessment.expected.timelineIndex);
    const quarterToken = assessment.expected.token.endsWith("2")
      ? assessment.expected.token.slice(0, -1)
      : assessment.expected.token.endsWith("2'")
        ? `${assessment.expected.token.slice(0, -2)}'`
        : assessment.expected.token;
    smartCubeStatus.textContent = `${smartCubeDeviceName} · ${assessment.expected.token} halfway`;
    coachStatus.textContent = `${quarterToken} detected. Repeat it to complete ${assessment.expected.token}.`;
    signalSmartCubeFeedback("correct");
  };

  const applySmartCubeMismatch = async (
    assessment: Extract<SmartCubeMoveAssessment, {status: "mismatch"}>,
    move: string,
  ): Promise<void> => {
    const progress = smartCubeHalfTurnProgress;
    recordSmartCubeMistake(assessment.expected.token, assessment.received);
    await animateSmartCubeMove(move, assessment.expected.timelineIndex);

    if (
      progress?.timelineIndex === assessment.expected.timelineIndex
      && quarterTurnsCancel(progress.receivedMoves.at(-1) ?? "", assessment.received)
    ) {
      smartCubeHalfTurnProgress = null;
      signalSmartCubeFeedback("deviation");
      smartCubeStatus.textContent = `${smartCubeDeviceName} · ${assessment.expected.token} attempt cancelled`;
      coachStatus.textContent = `${progress.receivedMoves.at(-1)} followed by ${assessment.received} returned to the starting state. Retry ${assessment.expected.token}.`;
      return;
    }

    smartCubeRecovery = beginSmartCubeRecovery(assessment.expected, assessment.received);
    if (smartCubeRecovery && smartCubeRecoveryMatchesExpected(smartCubeRecovery)) {
      const expected = smartCubeRecovery.expected;
      clearSmartCubeRecovery();
      setSmartCubeTimelineIndex(expected.timelineIndex + 1);
      signalSmartCubeFeedback("correct");
      smartCubeStatus.textContent = `${smartCubeDeviceName} · ${expected.token} completed`;
      coachStatus.textContent = `${expected.token} reached directly; redundant undo and replay removed.`;
      return;
    }
    signalSmartCubeFeedback("deviation");
    if (smartCubeRecovery) {
      const undo = smartCubeRecovery.undoMoves[0];
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Slip: undo ${undo}`;
      coachStatus.textContent = smartCubeRecoveryPrompt(smartCubeRecovery);
    } else {
      smartCubeStatus.textContent = `Expected ${assessment.expected.token}, received ${assessment.received}`;
      coachStatus.textContent = `Physical move mismatch. Expected ${assessment.expected.token}; received ${assessment.received}.`;
    }
  };

  const applySmartCubeRecoveryMove = async (move: string): Promise<boolean> => {
    if (!smartCubeRecovery) return false;
    const recoveryCursor = smartCubeRecovery.expected.timelineIndex;
    const assessment = assessSmartCubeRecovery(smartCubeRecovery, move);
    await animateSmartCubeMove(move, recoveryCursor);

    if (assessment.TAG === "Realigned") {
      const expected = smartCubeRecovery.expected.token;
      clearSmartCubeRecovery();
      signalSmartCubeFeedback("realigned");
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Back on track`;
      coachStatus.textContent = `Back on track. Now turn ${expected}.`;
      return true;
    }

    if (assessment.TAG === "Unsupported") {
      signalSmartCubeFeedback("deviation");
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Unsupported recovery move ${assessment.received}`;
      return true;
    }

    smartCubeRecovery = assessment.state;
    if (smartCubeRecoveryMatchesExpected(assessment.state)) {
      const expected = assessment.state.expected;
      clearSmartCubeRecovery();
      setSmartCubeTimelineIndex(expected.timelineIndex + 1);
      signalSmartCubeFeedback("correct");
      smartCubeStatus.textContent = `${smartCubeDeviceName} · ${expected.token} completed`;
      coachStatus.textContent = `${expected.token} reached directly; redundant undo and replay removed.`;
      return true;
    }
    if (assessment.TAG === "Extended") {
      recordSmartCubeMistake(assessment.state.expected.token, assessment.received);
      signalSmartCubeFeedback("deviation");
    } else {
      signalSmartCubeFeedback("correct");
    }
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Undo ${assessment.state.undoMoves[0]}`;
    coachStatus.textContent = smartCubeRecoveryPrompt(assessment.state);
    return true;
  };

  const applyWaitingTimelineMove = async (move: string): Promise<boolean> => {
    if (!activeTimeline?.states) return false;
    const action = nextExpectedSmartCubeAction(
      activeTimeline.steps,
      activeTimeline.labels,
      activeIndex,
    );
    if (action?.kind === "rotation") {
      await applySmartCubeMismatch({
        status: "mismatch",
        expected: {timelineIndex: action.timelineIndex, token: action.token},
        received: move,
      }, move);
      return true;
    }
    const assessment = assessSmartCubeMove(
      activeTimeline.steps,
      activeTimeline.labels,
      activeIndex,
      move,
      smartCubeHalfTurnProgress,
    );
    // console.log("[SmartCube Move] Assessing timeline move:", {
    //   expectedToken: action?.token,
    //   receivedMove: move,
    //   status: assessment.status,
    //   completedHalfTurn: assessment.status === "matched" ? assessment.completedHalfTurn : undefined,
    // });
    if (assessment.status === "complete") {
      smartCubeHalfTurnProgress = null;
      return true;
    }
    if (assessment.status === "partial") {
      await applyPartialHalfTurn(assessment);
      waitForSmartCubeMove();
      return true;
    }
    if (assessment.status === "unsupported") {
      smartCubeHalfTurnProgress = null;
      smartCubeStatus.textContent = `Expected ${assessment.expected.token}; received unsupported ${assessment.received}`;
      await animateSmartCubeMove(move, assessment.expected.timelineIndex);
      return true;
    }
    if (assessment.status === "mismatch") {
      await applySmartCubeMismatch(assessment, move);
      return true;
    }
    const moveIndex = assessment.expected.timelineIndex;
    smartCubeHalfTurnProgress = null;
    if (!assessment.completedHalfTurn && activeIndex !== moveIndex) setSmartCubeTimelineIndex(moveIndex);
    await animateSmartCubeMove(move, moveIndex);
    setSmartCubeTimelineIndex(moveIndex + 1);
    smartCubeStatus.textContent = `${smartCubeDeviceName} · ${move} matched`;
    signalSmartCubeFeedback("correct");
    return true;
  };

  const renderSmartCubeCoachingState = () => {
    if (!activeTimeline?.states) return;
    const coachingCursor = smartCubeRecovery?.expected.timelineIndex
      ?? smartCubeHalfTurnProgress?.timelineIndex
      ?? activeIndex;
    let state = activeTimeline.states[coachingCursor];
    for (const deviation of smartCubeRecovery?.deviations ?? []) {
      const step = smartCubeStep(smartCubeMoveInLessonFrame(
        activeTimeline.steps,
        activeTimeline.labels,
        coachingCursor,
        deviation,
      ));
      if (step) state = MoveExecutor.applyStep(state, step) as CubeState;
    }
    for (const received of smartCubeHalfTurnProgress?.receivedMoves ?? []) {
      const step = smartCubeStep(smartCubeMoveInLessonFrame(
        activeTimeline.steps,
        activeTimeline.labels,
        coachingCursor,
        received,
      ));
      if (step) state = MoveExecutor.applyStep(state, step) as CubeState;
    }
    renderState(
      state,
      activeAcademy ? `${activeAcademy.label} tutorial` : "Smart-cube timeline",
    );
  };

  const renderSmartCubeLiveState = () => {
    if (smartCubeCoachingFrameActive && activeTimeline?.states) {
      renderSmartCubeCoachingState();
      return;
    }
    const state = smartCubeRenderedState ?? smartCubeLiveState;
    if (!smartCubeConnected || !state) return;
    if (!smartCubeCoachingFrameActive) {
      renderState(state, `${smartCubeDeviceName} · Live physical state`);
      updatePatternDetection({state, label: `${smartCubeDeviceName} · Live physical state`});
    }
  };

  const commitSmartCubeMoveState = (record: QueuedSmartCubeMove) => {
    const base = smartCubeRenderedState ?? smartCubeLiveState;
    const step = smartCubeStep(record.move);
    const state = record.state ?? (base && step ? MoveExecutor.applyStep(base, step) as CubeState : null);
    if (!state) return;
    smartCubeRenderedState = state;
    if (!record.state) smartCubeLiveState = state;
    if (smartCubeCoachingFrameActive) return;
    renderState(state, `${smartCubeDeviceName} · Live physical state`);
    updatePatternDetection({state, label: `${smartCubeDeviceName} · Live physical state`});
  };

  const controllerStateIsSolved = (state: CubeState): boolean => {
    const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
    return solved.TAG === "Ok" && FaceletCodec.render(solved._0) === FaceletCodec.render(state);
  };

  const loadVirtualControllerState = (state: CubeState, label: string) => {
    smartCubeControllerState = state;
    smartCubeCoachingFrameActive = false;
    stopPlayback();
    renderState(state, label);
    updatePatternDetection({state, label});
  };

  const setSmartCubeControllerMode = (enabled: boolean) => {
    if (enabled && !smartCubeConnected) return;
    smartCubeSyncMode = enabled ? "VirtualController" : "PhysicalMirror";
    smartCubeControllerInspection = false;
    smartCubeControllerOrientation = [];
    smartCubeControllerOrientationBaseline = enabled && latestSmartCubeOrientation
      ? {...latestSmartCubeOrientation}
      : null;
    smartCubeController.classList.toggle("active", enabled);
    smartCubeController.setAttribute("aria-pressed", String(enabled));
    smartCubeDock.dataset.syncMode = enabled ? "controller" : "mirror";
    window.dispatchEvent(new CustomEvent("cubelab:controller-mode", {detail: {enabled}}));
    if (enabled) {
      const state = activeRecognized?.state
        ?? (StateTypes.solved(3) as Result<CubeState, unknown>)._0;
      if (!state) return;
      loadVirtualControllerState(state, "Virtual controller · choose New scramble or an Academy case");
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Controller mode: physical stickers are ignored.`;
      return;
    }
    smartCubeControllerState = null;
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Physical mirror restored. Sync state before using physical tracking.`;
    renderSmartCubeLiveState();
  };

  const mirrorSmartCubeFaceletsToInput = (facelets: string) => {
    if (input.value === facelets) return;
    store.patch({size: 3, input: facelets});
  };

  const pulseSmartCubeMilestone = (label: string, state: CubeState, phaseNumber: number) => {
    viewport?.setMilestone({
      positions: phaseMilestonePositions(state, phaseNumber),
      label: `✦ ${label}`,
    });
    signalSmartCubeFeedback("milestone");
    window.setTimeout(() => viewport?.setMilestone(null), 650);
  };

  const applyAcademySmartCubeMove = async (move: string): Promise<boolean> => {
    if (
      activeTab !== "academy"
      || tutorialPhases.length === 0
      || !activeTimeline?.states
    ) return false;

    const assessment = assessSmartCubeMove(
      activeTimeline.steps,
      activeTimeline.labels,
      activeIndex,
      move,
      smartCubeHalfTurnProgress,
    );
    if (assessment.status === "complete") {
      smartCubeHalfTurnProgress = null;
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Academy sequence complete`;
      return true;
    }
    if (assessment.status === "partial") {
      await applyPartialHalfTurn(assessment);
      waitForSmartCubeMove();
      return true;
    }
    if (assessment.status === "unsupported") {
      smartCubeHalfTurnProgress = null;
      smartCubeStatus.textContent = `Expected ${assessment.expected.token}; this slice/wide move is not reported directly by the cube`;
      await animateSmartCubeMove(move, assessment.expected.timelineIndex);
      return true;
    }
    if (assessment.status === "mismatch") {
      await applySmartCubeMismatch(assessment, move);
      return true;
    }

    const moveIndex = assessment.expected.timelineIndex;
    smartCubeHalfTurnProgress = null;
    if (!assessment.completedHalfTurn && activeIndex !== moveIndex) setSmartCubeTimelineIndex(moveIndex);
    await animateSmartCubeMove(move, moveIndex);
    setSmartCubeTimelineIndex(moveIndex + 1);
    smartCubeStatus.textContent = `${smartCubeDeviceName} · ${move} matched`;
    coachStatus.textContent = `${move} matched the Academy timeline.`;

    const phase = tutorialPhases.find((candidate) =>
      moveIndex >= candidate.start && moveIndex < candidate.end
    );
    if (phase && isLastPhysicalMoveInRange(activeTimeline.steps, moveIndex, phase.end)) {
      const phaseState = activeTimeline.states[moveIndex + 1];
      const label = phase.number === tutorialPhases.length
        ? `Solved — ${phase.title} verified`
        : `${phase.title} complete`;
      pulseSmartCubeMilestone(label, phaseState, phaseFocusNumber(phase));
      smartCubeStatus.textContent = `${smartCubeDeviceName} · ${label}`;
    } else {
      signalSmartCubeFeedback("correct");
    }
    return true;
  };

  const applyVirtualControllerMove = async (move: string): Promise<void> => {
    const state = smartCubeControllerState;
    if (!state) return;
    const projectedMove = controllerMoveInViewportFrame(move, smartCubeControllerOrientation);
    const step = smartCubeStep(projectedMove);
    if (!step) {
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Unsupported controller packet ${move}`;
      return;
    }
    if (smartCubeControllerInspection) {
      smartCubeControllerInspection = false;
      window.dispatchEvent(new Event("cubelab:controller-turn"));
    }
    const transform = turnTransform(3, step);
    if (transform && viewport) await viewport.animateTurn(transform, 120);
    const next = MoveExecutor.applyStep(state, step) as CubeState;
    smartCubeControllerState = next;
    renderState(next, `Virtual controller · ${projectedMove}`);
    updatePatternDetection({state: next, label: "Virtual controller"});
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Virtual ${projectedMove}`;
    if (controllerStateIsSolved(next)) {
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Virtual cube solved`;
      window.dispatchEvent(new Event("cubelab:controller-solved"));
    }
  };

  const applySmartCubeMove = async (record: QueuedSmartCubeMove): Promise<void> => {
    const move = record.move;
    // console.log("[SmartCube Move] Received physical face move from Bluetooth:", move);
    if (smartCubeSyncMode === "VirtualController") {
      await applyVirtualControllerMove(move);
      return;
    }
    const continueCoaching = smartCubeCoachingWaiting;
    clearTutorialFocus();
    clearTurnGuide();
    stopPlayback();
    const handledByRecovery = await applySmartCubeRecoveryMove(move);
    const handledByAcademy = !handledByRecovery && await applyAcademySmartCubeMove(move);
    const handledByTimeline = !handledByRecovery && !handledByAcademy && continueCoaching
      ? await applyWaitingTimelineMove(move)
      : false;
    if (handledByRecovery || handledByAcademy || handledByTimeline) {
      commitSmartCubeMoveState(record);
      if (continueCoaching || smartCubeRecovery || handledByRecovery) waitForSmartCubeMove();
      return;
    }

    smartCubeCoachingFrameActive = false;
    syncSmartCubeTrackedOrientation();
    await animateSmartCubeMove(move);
    commitSmartCubeMoveState(record);
    // Full-state drivers emit a canonical facelet event alongside each move.
    // Keep that physical state in the editor instead of replacing it with a
    // move recording. Move-only drivers retain the recording fallback below.
    if (smartCubeLiveState) {
      renderSmartCubeLiveState();
      return;
    }
    const source = activeRecognized?.timeline ? input.value : "";
    const next = appendRecordedMove(source, move);
    if (next.length > 20_000) {
      smartCubeStatus.textContent = "Move recording limit reached";
      renderSmartCubeLiveState();
      return;
    }
    suppressNextSmartCubeExtension = true;
    store.patch({input: next});
    renderSmartCubeLiveState();
  };

  const applySmartCubeGyroRotation = async (event: SmartCubeOrientationEvent) => {
    const pending = smartCubeRotationWait;
    if (!pending?.baseline || pending.generation !== playbackGeneration || !activeTimeline?.states) {
      return;
    }
    if (pending.baseline.coordinateFrame !== event.coordinateFrame) return;
    const step = activeTimeline.steps[pending.action.timelineIndex]?.step;
    if (!step || step.move.TAG !== "Rotation") return;
    const assessment = assessGyroRotation(
      pending.baseline.quaternion,
      event.quaternion,
      event.coordinateFrame,
      step.move._0,
      step.turns,
      "world",
    );

    // Diagnostic logging for gyro tracking & verification:
    // if (Math.abs(assessment.signedDegrees) >= 15 || assessment.matched || assessment.partial) {
    //   console.log(
    //     `[SmartCube Gyro] Assessment: action=${pending.action.token} axis=${step.move._0} turns=${step.turns} ` +
    //     `frame=${event.coordinateFrame} align=${(assessment.axisAlignment * 100).toFixed(1)}% ` +
    //     `deg=${assessment.signedDegrees.toFixed(1)}° matched=${assessment.matched} partial=${assessment.partial} ` +
    //     `rawQ=(${event.quaternion.x.toFixed(3)}, ${event.quaternion.y.toFixed(3)}, ${event.quaternion.z.toFixed(3)}, ${event.quaternion.w.toFixed(3)})`
    //   );
    // }

    if (!assessment.matched) {
      if (assessment.partial) {
        if (pending.partialTurn === 0) {
          pending.partialTurn = assessment.signedDegrees < 0 ? 1 : -1;
          const quarterStep: MoveStep = {...step, turns: pending.partialTurn};
          const quarterLabel = `${step.move._0.toLowerCase()}${pending.partialTurn < 0 ? "'" : ""}`;
          // console.log(`[SmartCube Gyro] Half-turn progress detected: ${quarterLabel} for ${pending.action.token}`);
          const token = moveRibbon.querySelector<HTMLButtonElement>(
            `[data-move-index="${pending.action.timelineIndex + 1}"]`,
          );
          if (token) {
            token.textContent = `${quarterLabel} ${quarterLabel}`;
            token.dataset.halfTurnProgress = "true";
          }
          activeTurnGuide = {
            step: quarterStep,
            label: quarterLabel,
            past: pastMoveTokens(pending.action.timelineIndex, 60),
            upcoming: upcomingMoveTokens(pending.action.timelineIndex, 60),
          };
          viewport?.setTurnPreview(turnTransform(size, quarterStep));
          viewport?.setTurnGuide(turnGuides ? activeTurnGuide : null);
          smartCubeStatus.textContent = `${smartCubeDeviceName} · ${pending.action.token} halfway`;
          coachStatus.textContent = `${quarterLabel} detected. Repeat it to complete ${pending.action.token}.`;
        }
        return;
      }
      // A regrip around another axis is allowed in solve mode. Treat its new
      // pose as the checkpoint for the still-pending lesson rotation without
      // creating a slip, recovery sequence, sound, or warning.
      const rebase = detectGyroQuarterRotation(
        pending.baseline.quaternion,
        event.quaternion,
        event.coordinateFrame,
        "world",
      );
      if (rebase && rebase.axis !== step.move._0) {
        // console.log(`[SmartCube Gyro] Detected off-axis regrip around ${rebase.axis} (${rebase.turns > 0 ? "clockwise" : "counter-clockwise"}). Rebasing baseline.`);
        pending.baseline = {
          quaternion: event.quaternion,
          coordinateFrame: event.coordinateFrame,
        };
        pending.partialTurn = 0;
      }
      return;
    }

    // console.log(`[SmartCube Gyro] Rotation completed and verified for ${pending.action.token}!`);
    smartCubeRotationWait = null;
    clearTurnGuide();
    // Solve mode deliberately does not live-track the observed pose. Animate
    // the recognized logical regrip once, then advance like a matched face move.
    viewport?.setDeviceOrientation(null);
    const transform = turnTransform(size, step);
    if (transform && viewport) await viewport.animateTurn(transform, 120);
    if (pending.generation !== playbackGeneration) return;
    renderTimelineIndex(pending.action.timelineIndex + 1);
    signalSmartCubeFeedback("correct");
    smartCubeStatus.textContent = `${smartCubeDeviceName} · ${pending.action.token} regrip detected`;
    coachStatus.textContent = `${pending.action.token} detected by gyro. Continuing.`;
    waitForSmartCubeMove();
  };

  const setSmartCubeOrientationTracking = (enabled: boolean) => {
    const wasTracking = smartCubeOrientationTracking;
    smartCubeOrientationTracking = enabled && smartCubeConnected && !smartCubeOrientation.hidden;
    smartCubeOrientation.classList.toggle("active", smartCubeOrientationTracking);
    smartCubeOrientation.setAttribute("aria-pressed", String(smartCubeOrientationTracking));
    if (smartCubeOrientationTracking) {
      autoOrbitButton.setAttribute("aria-pressed", "false");
      autoOrbitButton.classList.remove("active");
      autoOrbitButton.disabled = true;
      viewport?.setAutoOrbit(false);
    } else {
      autoOrbitButton.disabled = !viewport;
    }
    syncSmartCubeTrackedOrientation();
    if (wasTracking && !smartCubeOrientationTracking && smartCubeRotationWait?.baseline) {
      waitForSmartCubeMove();
    }
  };

  const renderSmartCubeConnection = (connectionState: SmartCubeConnectionState) => {
    root.dataset.smartCubePhase = connectionState.phase;
    smartCubeDock.dataset.phase = connectionState.phase;
    const connected = connectionState.phase === "connected" && connectionState.device !== null;
    const wasConnected = smartCubeConnected;
    smartCubeConnected = connected;
    smartCubeConnect.hidden = connected;
    smartCubeConnect.disabled = connectionState.phase === "connecting"
      || connectionState.phase === "disconnecting"
      || connectionState.phase === "unavailable";
    smartCubeConnect.textContent = connectionState.phase === "connecting"
      ? "Connecting…"
      : "ᛒ Connect cube";
    smartCubeDock.hidden = connectionState.phase === "disconnected"
      || connectionState.phase === "unavailable";
    smartCubeDisconnect.hidden = !connected;
    smartCubeDisconnect.disabled = connectionState.phase === "disconnecting";
    smartCubeStatus.textContent = connectionState.message;
    if (connected && connectionState.device) {
      if (!wasConnected) {
        smartCubeMistakeLog.length = 0;
        clearSmartCubeRecovery();
      }
      smartCubeDeviceName = connectionState.device.name;
      smartCubeLedFeedback = connectionState.device.capabilities.led;
      smartCubeStatus.textContent = `${connectionState.device.brandName} · ${connectionState.device.name} · Live sync`;
      const supportsOrientation = connectionState.device.capabilities.orientation;
      const supportsFacelets = connectionState.device.capabilities.facelets;
      const supportsReset = connectionState.device.capabilities.reset;
      smartCubeSync.hidden = !supportsFacelets;
      smartCubeSync.disabled = !supportsFacelets;
      smartCubeResetState.hidden = !supportsReset;
      smartCubeResetState.disabled = !supportsReset;
      if (!wasConnected && supportsFacelets) smartCubeStateSyncPending = true;
      smartCubeOrientation.hidden = !supportsOrientation;
      smartCubeOrientation.disabled = !supportsOrientation;
      smartCubeController.hidden = false;
      smartCubeController.disabled = false;
      setSmartCubeOrientationTracking(supportsOrientation);
      updateSmartCubeMistakeUi();
    } else {
      smartCubeLedFeedback = false;
      smartCubeSync.hidden = true;
      smartCubeResetState.hidden = true;
      smartCubeOrientation.hidden = true;
      smartCubeController.hidden = true;
      setSmartCubeControllerMode(false);
      smartCubeBattery.hidden = true;
      if (connectionState.phase !== "connecting") {
        smartCubeHalfTurnProgress = null;
        clearSmartCubeRecovery();
        if (smartCubeCoachingWaiting) {
          clearTurnGuide("restore");
          stopPlayback();
        }
        setSmartCubeOrientationTracking(false);
        latestSmartCubeOrientation = null;
        smartCubeStateSyncPending = false;
        smartCubeCoachingFrameActive = false;
        smartCubeLiveState = null;
        smartCubeRenderedState = null;
        smartCubePendingMoves.length = 0;
        smartCubeReroute.hidden = true;
        scheduleUpdate();
      }
    }
  };

  const handleSmartCubeEvent = (event: SmartCubeEvent) => {
    switch (event.type) {
      case "move": {
        const record: QueuedSmartCubeMove = {move: event.move, state: null};
        smartCubePendingMoves.push(record);
        smartCubeMovesInFlight += 1;
        smartCubeMoveQueue = smartCubeMoveQueue
          .then(() => applySmartCubeMove(record))
          .catch((reason) => {
            smartCubeStatus.textContent = reason instanceof Error ? reason.message : String(reason);
          })
          .finally(() => {
            const pendingIndex = smartCubePendingMoves.indexOf(record);
            if (pendingIndex >= 0) smartCubePendingMoves.splice(pendingIndex, 1);
            smartCubeMovesInFlight -= 1;
          });
        break;
      }
      case "facelets": {
        if (smartCubeSyncMode === "VirtualController") break;
        const parsed = FaceletCodec.parse(3, event.facelets) as Result<CubeState>;
        if (parsed.TAG === "Ok") {
          const diagnostic = validatePhysicalState(parsed._0);
          if (diagnostic !== null) {
            smartCubeStateSyncPending = false;
            smartCubeStatus.textContent = diagnostic;
            break;
          }
          smartCubeLiveState = parsed._0;
          const pending = [...smartCubePendingMoves].reverse().find((move) => move.state === null);
          if (pending) pending.state = parsed._0;
          else smartCubeRenderedState = parsed._0;
          if (smartCubeStateSyncPending) {
            smartCubeStateSyncPending = false;
            mirrorSmartCubeFaceletsToInput(event.facelets);
            smartCubeStatus.textContent = `${smartCubeDeviceName} · State synced`;
          }
          if (smartCubeMovesInFlight === 0) renderSmartCubeLiveState();
          updateSmartCubeMistakeUi();
        } else if (smartCubeStateSyncPending) {
          smartCubeStateSyncPending = false;
          smartCubeStatus.textContent = "The physical cube returned an invalid facelet state";
        }
        break;
      }
      case "battery":
        smartCubeBattery.hidden = false;
        smartCubeBattery.textContent = `🔋 ${Math.round(event.level)}%`;
        break;
      case "orientation": {
        latestSmartCubeOrientation = {
          quaternion: event.quaternion,
          coordinateFrame: event.coordinateFrame,
        };
        if (smartCubeSyncMode === "VirtualController") {
          const baseline = smartCubeControllerOrientationBaseline;
          if (baseline?.coordinateFrame === event.coordinateFrame) {
            const regrip = detectGyroQuarterRotation(
              baseline.quaternion,
              event.quaternion,
              event.coordinateFrame,
              "world",
            );
            if (regrip) {
              smartCubeControllerOrientation.push(regrip);
              smartCubeControllerOrientationBaseline = {
                quaternion: event.quaternion,
                coordinateFrame: event.coordinateFrame,
              };
            }
          } else {
            smartCubeControllerOrientationBaseline = {
              quaternion: event.quaternion,
              coordinateFrame: event.coordinateFrame,
            };
          }
        }
        const now = performance.now();
        if (now - lastOrientationLogTime >= 350) {
          lastOrientationLogTime = now;
          const vq = orientationInViewportFrame(event.quaternion, event.coordinateFrame);
          const sinr_cosp = 2 * (vq.w * vq.x + vq.y * vq.z);
          const cosr_cosp = 1 - 2 * (vq.x * vq.x + vq.y * vq.y);
          const pitch = Math.atan2(sinr_cosp, cosr_cosp) * 180 / Math.PI;
          const sinp = 2 * (vq.w * vq.y - vq.z * vq.x);
          const yaw = Math.abs(sinp) >= 1 ? Math.sign(sinp) * 90 : Math.asin(sinp) * 180 / Math.PI;
          const siny_cosp = 2 * (vq.w * vq.z + vq.x * vq.y);
          const cosy_cosp = 1 - 2 * (vq.y * vq.y + vq.z * vq.z);
          const roll = Math.atan2(siny_cosp, cosy_cosp) * 180 / Math.PI;

          // console.log(
          //   `[SmartCube Orientation] Live trace: frame=${event.coordinateFrame} ` +
          //   `rawQ=(${event.quaternion.x.toFixed(3)}, ${event.quaternion.y.toFixed(3)}, ${event.quaternion.z.toFixed(3)}, ${event.quaternion.w.toFixed(3)}) ` +
          //   `euler(pitchX=${pitch.toFixed(1)}°, yawY=${yaw.toFixed(1)}°, rollZ=${roll.toFixed(1)}°) ` +
          //   `tracking=${smartCubeOrientationTracking} waitingForRegrip=${Boolean(smartCubeRotationWait)}`
          // );
        }
        if (smartCubeOrientationTracking) {
          if (!smartCubeCoachingWaiting) {
            viewport?.setDeviceOrientation(event.quaternion, event.coordinateFrame);
          }
          void applySmartCubeGyroRotation(event).catch((reason) => {
            smartCubeStatus.textContent = reason instanceof Error ? reason.message : String(reason);
          });
        }
        break;
      }
      case "hardware":
        if (event.orientationSupported === false) {
          smartCubeOrientation.hidden = true;
          setSmartCubeOrientationTracking(false);
        }
        break;
      case "disconnected":
        setSmartCubeOrientationTracking(false);
        break;
    }
  };

  const loadSmartCubeManager = async (): Promise<SmartCubeManager> => {
    if (smartCubeManager) return smartCubeManager;
    if (!smartCubeManagerLoading) {
      smartCubeManagerLoading = import("./smart-cube/index")
        .then(({createSmartCubeManager}) => {
          // Capability is checked once, inside the explicit Connect gesture. Avoid
          // repeatedly touching navigator.bluetooth in permission-blocked embeds.
          const manager = createSmartCubeManager({isBluetoothAvailable: () => true});
          manager.subscribeState(renderSmartCubeConnection);
          manager.subscribeEvents(handleSmartCubeEvent);
          smartCubeManager = manager;
          clearSmartCubeChunkReload();
          return manager;
        })
        .catch((reason: unknown) => {
          smartCubeManagerLoading = null;
          if (!isStaleDynamicModuleError(reason)) throw reason;
          if (!smartCubeChunkReloadAttempted()) {
            markSmartCubeChunkReloadAttempted();
            window.location.reload();
            return new Promise<SmartCubeManager>(() => {});
          }
          throw new Error("The smart-cube module could not load. Reload CubeLab and try again.");
        });
    }
    return smartCubeManagerLoading;
  };

  const synchronizePlayback = (recognized: RecognizedInput) => {
    updateAcademySource(recognized);
    updateNissSource(recognized);
    updateCompatibility(recognized);
    updatePatternDetection(recognized);
    updateTransformAvailability(movesTransformReady());
    updateShortenAvailability();
    if (!recognized.timeline || !recognized.timelineKey) {
      stopPlayback();
      activeTimeline = stateSnapshotTimeline(recognized.state);
      activeTimelineKey = null;
      activeIndex = 0;
      renderState(recognized.state, recognized.label);
      updatePlaybackUi(true);
      lastLabel = recognized.label;
      return;
    }

    const previous = activeTimeline;
    const sameTimeline = activeTimelineKey === recognized.timelineKey;
    const previousAtEnd = previous?.states !== null && activeIndex === previous?.steps.length;
    const suppressExtension = suppressNextSmartCubeExtension;
    suppressNextSmartCubeExtension = false;
    const animateExtension = !suppressExtension && recognized.timeline.states !== null && (
      (previousAtEnd && isSingleStepExtension(previous, recognized.timeline))
      || (previous === null && lastLabel === "Solved default" && recognized.timeline.steps.length === 1)
    );
    stopPlayback();
    activeTimeline = recognized.timeline;
    activeTimelineKey = recognized.timelineKey;
    updatePlaybackUi(true);
    if (recognized.timeline.states === null) {
      activeIndex = recognized.timeline.steps.length;
      renderState(recognized.state, recognized.label);
      updatePlaybackUi();
    } else if (animateExtension) {
      activeIndex = recognized.timeline.steps.length - 1;
      renderState(recognized.timeline.states[activeIndex], recognized.label);
      updatePlaybackUi();
      const generation = playbackGeneration;
      void transitionTo(activeIndex + 1, generation);
    } else if (sameTimeline) {
      renderTimelineIndex(Math.min(activeIndex, recognized.timeline.steps.length));
    } else {
      activeIndex = recognized.timeline.steps.length;
      renderState(recognized.state, recognized.label);
      updatePlaybackUi();
    }
    lastLabel = recognized.label;
  };

  const update = () => {
    updateCardVisibility();
    updateLowercaseUi();
    updateDialectUi();
    const parsed = parseWorkspaceState();
    if (parsed.TAG === "Error") {
      updateAcademySource(null);
      updateNissSource(null);
      updateCompatibility(null);
      updatePatternDetection(null);
      updateTransformAvailability(movesTransformReady());
      updateShortenAvailability();
      stopPlayback();
      activeTimeline = null;
      activeTimelineKey = null;
      playback.hidden = true;
      status.textContent = "Parse error";
      status.classList.add("error");
      error.textContent = describeError(parsed._0);
      error.hidden = false;
      for (const key of ["facelets", "net", "colours", "colour-net", "pieces", "orbit64"]) {
        setOutput(key, "—", false);
      }
      lastLabel = "Parse error";
      return;
    }
    synchronizePlayback(parsed._0);
    if (smartCubeConnected && smartCubeLiveState) {
      renderSmartCubeLiveState();
    }
  };

  let updateFrame: number | null = null;
  const scheduleUpdate = () => {
    if (updateFrame !== null) return;
    updateFrame = window.requestAnimationFrame(() => {
      updateFrame = null;
      update();
    });
  };

  let appStateApplied = false;
  const applyAppState = (state: AppState) => {
    const patternSizeChanged = !appStateApplied || size !== state.size;
    const conversionChanged = !appStateApplied
      || size !== state.size
      || lowercaseMode !== state.lowercaseMode
      || notationDialect !== state.notationDialect
      || cubeStyle !== state.cubeStyle
      || input.value !== state.input
      || movesInput.value !== state.moves
      || schemeSelect.value !== state.scheme
      || customScheme.value !== state.customScheme;
    size = state.size;
    lowercaseMode = state.lowercaseMode;
    notationDialect = state.notationDialect;
    cubeStyle = state.cubeStyle;
    const turnGuidesChanged = turnGuides !== state.turnGuides;
    const academyMethodChanged = academyMethod !== state.academyMethod;
    turnGuides = state.turnGuides;
    activeTab = state.activeTab;
    academyMethod = state.academyMethod;
    if (input.value !== state.input) input.value = state.input;
    if (movesInput.value !== state.moves) movesInput.value = state.moves;
    if (schemeSelect.value !== state.scheme) schemeSelect.value = state.scheme;
    if (customScheme.value !== state.customScheme) customScheme.value = state.customScheme;
    customScheme.hidden = state.scheme !== "Custom";
    if (patternSizeChanged) {
      patternSearch.value = "";
      renderPatternBrowser();
    }

    root.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((button) => {
      const active = Number(button.dataset.size) === state.size;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-cube-style]").forEach((button) => {
      const active = button.dataset.cubeStyle === state.cubeStyle;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    turnGuidesButton.classList.toggle("active", turnGuides);
    turnGuidesButton.setAttribute("aria-pressed", String(turnGuides));
    if (turnGuidesChanged) {
      viewport?.setTurnGuide(
        turnGuides && activeTurnGuide ? activeTurnGuide : null,
      );
    }
    root.querySelectorAll<HTMLButtonElement>("[data-workspace-tab]").forEach((button) => {
      const active = button.dataset.workspaceTab === activeTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    root.querySelectorAll<HTMLElement>("[data-workspace-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.workspacePanel !== activeTab;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-academy-method]").forEach((button) => {
      const active = button.dataset.academyMethod === academyMethod;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    root.querySelectorAll<HTMLElement>("[data-academy-method-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.academyMethodPanel !== academyMethod;
    });
    if (appStateApplied && academyMethodChanged) {
      academyRequestGuard.invalidate();
      academySolveBusy = false;
      const method = selectedTutorialMethod();
      const saved = savedTutorialSolutions.get(method);
      const academy = academyForMethod(method);
      if (saved) presentTutorialSolution(saved.initialState, saved.solution, academy);
    }
    updateAcademySolveButton();
    appStateApplied = true;
    if (conversionChanged) scheduleUpdate();
  };

  root.querySelectorAll<HTMLButtonElement>("[data-workspace-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({activeTab: button.dataset.workspaceTab as ActiveTab});
    });
  });
  mountTimerWorkspace(root);
  let nextRandomDrillRotation = 0;
  const selectedDrillFamily = (): DrillFamilyFilter => academyDrillFamily.value as DrillFamilyFilter;
  const populateDrillCases = (preferredId?: string) => {
    const cases = drillCasesForFamily(selectedDrillFamily());
    academyDrillCase.replaceChildren(...cases.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = `${entry.family} · ${entry.label}`;
      return option;
    }));
    if (preferredId && cases.some((entry) => entry.id === preferredId)) academyDrillCase.value = preferredId;
  };
  populateDrillCases();

  window.addEventListener("cubelab:timer-phase", ((event: CustomEvent<{phase: string}>) => {
    smartCubeControllerInspection = smartCubeSyncMode === "VirtualController"
      && event.detail.phase === "inspection";
    timerCover.hidden = !(timerArenaMode && event.detail.phase === "covered");
    timerHudPhase.textContent = event.detail.phase === "inspection"
      ? "Inspection"
      : event.detail.phase === "running"
        ? "Solving"
        : event.detail.phase === "covered"
          ? "Covered"
          : event.detail.phase;
    if (smartCubeControllerInspection) {
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Inspection: gyro controls the view; the first complete turn starts the timer.`;
    }
  }) as EventListener);
  window.addEventListener("cubelab:timer-hud", ((event: CustomEvent<{
    phase: string;
    shown: number;
    scramble: string;
    summary: {best: number | null; ao5: number | null};
  }>) => {
    if (!timerArenaMode) return;
    const format = (milliseconds: number | null) => milliseconds === null
      ? "—"
      : `${Math.floor(milliseconds / 60_000)}:${String(Math.floor(milliseconds / 1_000) % 60).padStart(2, "0")}.${String(Math.floor(milliseconds / 10) % 100).padStart(2, "0")}`;
    timerHudTime.textContent = format(event.detail.shown);
    timerHudStatus.textContent = event.detail.phase === "covered"
      ? "Press Inspect to reveal the virtual scramble"
      : event.detail.scramble;
    timerHudStats.textContent = `Best ${format(event.detail.summary.best)} · Ao5 ${format(event.detail.summary.ao5)}`;
  }) as EventListener);
  window.addEventListener("cubelab:timer-cue", ((event: CustomEvent<{seconds: number}>) => {
    if (!timerArenaMode) return;
    timerHud.dataset.cue = String(event.detail.seconds);
    timerHudStatus.textContent = `${event.detail.seconds} SECONDS`;
    window.setTimeout(() => delete timerHud.dataset.cue, 800);
  }) as EventListener);
  window.addEventListener("cubelab:timer-arena", () => setTimerArenaMode(true));
  timerCover.addEventListener("click", () => window.dispatchEvent(new Event("cubelab:timer-inspect")));
  window.addEventListener("cubelab:controller-scramble", ((event: CustomEvent<{scramble: string}>) => {
    if (smartCubeSyncMode !== "VirtualController") return;
    const evaluated = evaluateAlgorithm(3, "Wide", "Modern", event.detail.scramble);
    if (evaluated.TAG === "Error") {
      smartCubeStatus.textContent = `Could not load virtual scramble: ${evaluated._0}`;
      return;
    }
    loadVirtualControllerState(evaluated._0.finalState, "Virtual controller · instant scramble");
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Instant scramble loaded. Start inspection when ready.`;
  }) as EventListener);

  playerPageLink.addEventListener("click", (event) => {
    event.preventDefault();
    setPlayerMode(!playerMode);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-academy-method]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({
        activeTab: "academy",
        academyMethod: button.dataset.academyMethod as AcademyMethod,
      });
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({size: Number(button.dataset.size)});
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-lowercase-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({lowercaseMode: button.dataset.lowercaseMode as LowercaseMode});
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-notation-dialect]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({notationDialect: button.dataset.notationDialect as NotationDialect});
    });
  });


  schemeSelect.addEventListener("change", () => {
    updateAcademySource(null);
    store.patch({scheme: schemeSelect.value as SchemeName});
    scheduleUpdate();
  });
  customScheme.addEventListener("input", () => {
    customScheme.value = customScheme.value.toUpperCase();
    updateAcademySource(null);
    store.patch({customScheme: customScheme.value});
    scheduleUpdate();
  });
  input.addEventListener("input", () => {
    smartCubeCoachingFrameActive = false;
    syncSmartCubeTrackedOrientation();
    if (pendingDirectMove !== null) {
      window.clearTimeout(pendingDirectMove.timeout);
      pendingDirectMove = null;
    }
    updateAcademySource(null);
    store.patch({input: input.value});
    scheduleUpdate();
  });
  movesInput.addEventListener("input", () => {
    updateTransformAvailability(false);
    shortenSearch.disabled = true;
    shortenResult.hidden = true;
    pendingShortenedAlg = null;
    updateAcademySource(null);
    store.patch({moves: movesInput.value});
    scheduleUpdate();
  });

  const commitTransformedAlgorithm = (value: string) => {
    if (value.length > 20_000) {
      error.textContent = "A transformed algorithm may not exceed 20,000 characters.";
      error.hidden = false;
      return;
    }
    store.patch({input: value, lowercaseMode: "Wide", notationDialect: "Modern"});
    input.focus();
  };

  const commitTransformedMoves = (value: string) => {
    if (value.length > 20_000) {
      error.textContent = "A transformed algorithm may not exceed 20,000 characters.";
      error.hidden = false;
      return;
    }
    store.patch({moves: value, lowercaseMode: "Wide", notationDialect: "Modern"});
    movesInput.focus();
  };

  transformButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.algTransform === "unfold") {
        try {
          const program = HamiltonMacro.parse(movesInput.value);
          const unfolded = HamiltonMacro.unfold(program, MAX_PLAYBACK_STEPS)
            .map((event) => event.kind === "move" ? event.token : `@${(event.durationMs / 1000).toString()}s`)
            .join(" ");
          commitTransformedMoves(unfolded);
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Could not unfold the macro program.";
          error.textContent = message.includes("-move limit")
            ? `${message}. Use the streaming player for longer programs.`
            : message;
          error.hidden = false;
        }
        return;
      }
      const parsed = MoveParser.parseWithOptions(
        size,
        lowercaseMode,
        notationDialect,
        movesInput.value,
      ) as Result<unknown[], {message: string}>;
      if (parsed.TAG === "Error") return;
      const alg = parsed._0;
      switch (button.dataset.algTransform) {
        case "invert":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.invert(alg)));
          break;
        case "simplify": {
          const simplified = MoveTransform.simplify(alg) as Result<unknown[], string>;
          if (simplified.TAG === "Ok") {
            commitTransformedMoves(MoveTransform.serialize(simplified._0));
            if (simplified._0.length === 0 && alg.length > 0) {
              const original = button.textContent;
              button.textContent = "Already solved (0 moves)";
              window.setTimeout(() => {
                button.textContent = original;
              }, 1800);
            }
          } else {
            error.textContent = "The algorithm exceeds the safe transformation limit.";
            error.hidden = false;
          }
          break;
        }
        case "normalize":
          commitTransformedMoves(MoveTransform.serialize(alg));
          break;
        case "mirror-lr":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.mirror(alg, "LR")));
          break;
        case "mirror-fb":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.mirror(alg, "FB")));
          break;
        case "mirror-ud":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.mirror(alg, "UD")));
          break;
        case "rotate-x":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.rotate(alg, "X", 1)));
          break;
        case "rotate-y":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.rotate(alg, "Y", 1)));
          break;
        case "rotate-z":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.rotate(alg, "Z", 1)));
          break;
      }
    });
  });

  shortenSearch.addEventListener("click", () => {
    const parsed = MoveParser.parseWithOptions(
      size,
      lowercaseMode,
      notationDialect,
      movesInput.value,
    ) as Result<unknown[], {message: string}>;
    if (parsed.TAG === "Error") return;
    const alg = parsed._0;
    const expanded = MoveExecutor.expand(alg) as Result<MoveStep[], unknown>;
    if (expanded.TAG === "Error") return;
    const currentMoveCount = expanded._0.filter((step) => step.move.TAG !== "Rotation").length;
    const solvedState = StateTypes.solved(size) as Result<CubeState, unknown>;
    if (solvedState.TAG === "Error") return;
    const applied = MoveExecutor.applyAlg(solvedState._0, alg) as Result<CubeState, unknown>;
    if (applied.TAG === "Error") return;
    const target = PieceReducer.reduce(applied._0) as Result<unknown, unknown>;
    if (target.TAG === "Error") return;

    shortenSearch.disabled = true;
    const originalLabel = shortenSearch.textContent;
    shortenSearch.textContent = "Searching…";
    shortenResult.hidden = true;
    pendingShortenedAlg = null;

    // The search is synchronous and can take up to a couple of seconds within
    // its node budget, which would otherwise freeze the "Searching…" label
    // unpainted for the whole duration; deferring the actual call lets the
    // browser render the label first.
    window.setTimeout(() => {
      const outcome = AlgorithmOptimizer.shorten(
        solvedState._0,
        target._0,
        currentMoveCount,
        undefined,
        undefined,
      ) as Result<unknown, unknown>;
      shortenSearch.textContent = originalLabel;
      shortenSearch.disabled = !movesTransformReady() || size !== 3;
      if (outcome.TAG === "Error") {
        shortenSummary.textContent = "The search could not run on the current algorithm.";
        shortenPreview.textContent = "";
        shortenApply.hidden = true;
        shortenResult.hidden = false;
        return;
      }
      const tag = typeof outcome._0 === "string" ? outcome._0 : (outcome._0 as {TAG: string}).TAG;
      if (tag === "Shortened") {
        const shortened = outcome._0 as {alg: unknown[]; moveCount: number};
        pendingShortenedAlg = shortened.alg;
        const preview = MoveTransform.serialize(shortened.alg) as string;
        shortenSummary.textContent = shortened.moveCount === 0
          ? `Found an equivalent that solves in 0 moves (was ${currentMoveCount}).`
          : `Found a shorter equivalent: ${shortened.moveCount} moves (was ${currentMoveCount}).`;
        shortenPreview.textContent = preview === "" ? "(no moves)" : preview;
        shortenApply.hidden = false;
      } else {
        pendingShortenedAlg = null;
        shortenSummary.textContent = tag === "NoShorterFound"
          ? "No shorter equivalent found within the search budget."
          : "The search budget ran out before finding an answer either way.";
        shortenPreview.textContent = "";
        shortenApply.hidden = true;
      }
      shortenResult.hidden = false;
    }, 0);
  });

  shortenApply.addEventListener("click", () => {
    if (pendingShortenedAlg === null) return;
    commitTransformedMoves(MoveTransform.serialize(pendingShortenedAlg) as string);
    shortenResult.hidden = true;
    pendingShortenedAlg = null;
  });

  shortenDismiss.addEventListener("click", () => {
    shortenResult.hidden = true;
    pendingShortenedAlg = null;
  });

  root.querySelector<HTMLButtonElement>("[data-practice-scramble]")!.addEventListener("click", () => {
    const scramble = MoveTransform.practiceScramble(size) as Result<string, string>;
    if (scramble.TAG === "Ok") commitTransformedAlgorithm(scramble._0);
  });

  twoPhaseSolve.addEventListener("click", async () => {
    if (size !== 3) return;
    if (twoPhaseSolveBusy) {
      twoPhaseCancelling = true;
      twoPhaseSolverClient.cancel();
      twoPhaseSolve.disabled = true;
      twoPhaseSolve.textContent = "Stopping search…";
      twoPhaseResult.textContent = twoPhaseAlgorithm === ""
        ? "Stopping search; no solution has been found yet."
        : `Stopping search; keeping ${twoPhaseAlgorithm}.`;
      twoPhaseResult.classList.remove("success", "failure");
      return;
    }
    const workspace = parseWorkspaceState();
    if (workspace.TAG === "Error") {
      twoPhaseResult.textContent = workspace._0;
      twoPhaseResult.classList.add("failure");
      return;
    }
    const request = ++twoPhaseRequest;
    twoPhaseAlgorithm = "";
    twoPhaseBestMoveCount = null;
    twoPhaseSourceKey = `${input.value}\u0000${movesInput.value}`;
    twoPhasePendingState = workspace._0.state;
    twoPhaseCancelling = false;
    twoPhaseApply.disabled = true;
    twoPhaseSolveBusy = true;
    twoPhaseSolve.textContent = "Cancel search";
    twoPhaseResult.textContent = "Starting two-phase search…";
    twoPhaseResult.classList.remove("failure", "success");
    try {
      const solution = await twoPhaseSolverClient.solve(workspace._0.state);
      if (request !== twoPhaseRequest) return;
      const replay = MoveExecutor.applyAlg(workspace._0.state, solution.alg) as Result<CubeState, unknown>;
      const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
      if (replay.TAG !== "Ok" || solved.TAG !== "Ok") {
        throw new Error("The two-phase solution did not replay to solved.");
      }
      if (FaceletCodec.render(replay._0) !== FaceletCodec.render(solved._0)) {
        throw new Error("The two-phase solution did not replay to solved.");
      }
      const algorithm = MoveTransform.serialize(solution.alg) as string;
      twoPhaseAlgorithm = algorithm;
      twoPhaseSourceKey = `${input.value}\u0000${movesInput.value}`;
      twoPhaseApply.disabled = algorithm === "";
      twoPhaseResult.textContent = twoPhaseCancelling
        ? `Search stopped · ${solution.moveCount} HTM · ${algorithm || "Solved"}`
        : `${solution.moveCount} HTM · ${algorithm || "Solved"}`;
      twoPhaseResult.classList.toggle("success", !twoPhaseCancelling);
    } catch (reason) {
      if (request !== twoPhaseRequest) return;
      twoPhaseResult.textContent = reason instanceof Error ? reason.message : "The two-phase solver failed.";
      twoPhaseResult.classList.add("failure");
    } finally {
      if (request !== twoPhaseRequest) return;
      twoPhaseSolveBusy = false;
      twoPhaseCancelling = false;
      twoPhaseSolve.textContent = "Find two-phase solution";
      twoPhaseSolve.disabled = size !== 3;
    }
  });

  twoPhaseApply.addEventListener("click", () => {
    if (twoPhaseAlgorithm === "") return;
    if (`${input.value}\u0000${movesInput.value}` !== twoPhaseSourceKey) {
      twoPhaseResult.textContent = "Setup or Moves changed; generate a new two-phase solution.";
      twoPhaseResult.classList.add("failure");
      twoPhaseApply.disabled = true;
      return;
    }
    store.patch({moves: [movesInput.value.trim(), twoPhaseAlgorithm].filter(Boolean).join(" ")});
  });

  nissUseInverse.addEventListener("click", () => {
    if (inverseScramble !== "") commitTransformedAlgorithm(inverseScramble);
  });

  nissSideButtons.forEach((button) => {
    button.addEventListener("click", () => setNissSide(button.dataset.nissSide as "normal" | "inverse"));
  });

  const parseNissAlg = (value: string): Result<unknown[], {message: string}> =>
    MoveParser.parseWithOptions(3, "Wide", "Modern", value) as Result<unknown[], {message: string}>;

  nissNormal.addEventListener("input", resetNissResult);
  nissInverseMoves.addEventListener("input", resetNissResult);

  nissVerify.addEventListener("click", () => {
    const scramble = MoveParser.parseWithOptions(
      3,
      lowercaseMode,
      notationDialect,
      input.value,
    ) as Result<unknown[], {message: string}>;
    const normal = parseNissAlg(nissNormal.value);
    const inverse = parseNissAlg(nissInverseMoves.value);
    const parseFailure = scramble.TAG === "Error"
      ? scramble._0.message
      : normal.TAG === "Error"
        ? normal._0.message
        : inverse.TAG === "Error"
          ? inverse._0.message
          : null;
    if (parseFailure !== null) {
      nissResult.textContent = parseFailure;
      nissResult.classList.add("failure");
      nissResult.classList.remove("success");
      return;
    }
    if (scramble.TAG === "Error" || normal.TAG === "Error" || inverse.TAG === "Error") return;
    const verification = MoveNiss.verify(
      3,
      scramble._0,
      normal._0,
      inverse._0,
    ) as Result<{solution: unknown[]; moveCount: number}, unknown>;
    if (verification.TAG === "Error") {
      nissResult.textContent = MoveNiss.describeError(verification._0);
      nissResult.classList.add("failure");
      nissResult.classList.remove("success");
      return;
    }
    verifiedNissSolution = MoveTransform.serialize(verification._0.solution);
    const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
    const start = solved.TAG === "Ok"
      ? MoveExecutor.applyAlg(solved._0, scramble._0) as Result<CubeState, unknown>
      : {TAG: "Error"};
    verifiedNissAlg = start.TAG === "Ok" ? verification._0.solution : null;
    verifiedNissStart = start.TAG === "Ok" ? start._0 : null;
    nissResult.textContent = `Verified · ${verification._0.moveCount} moves · ${verifiedNissSolution || "Solved"}`;
    nissResult.classList.add("success");
    nissResult.classList.remove("failure");
    nissLoad.disabled = false;
  });

  nissLoad.addEventListener("click", () => {
    if (verifiedNissAlg === null || verifiedNissStart === null) return;
    const timeline = buildTimeline(verifiedNissStart, verifiedNissAlg);
    if (timeline.TAG === "Error") return;
    stopPlayback();
    activeTimeline = timeline._0;
    activeTimelineKey = null;
    activeIndex = 0;
    renderState(verifiedNissStart, "NISS recombined solution");
    updatePlaybackUi(true);
  });

  const inspectHamiltonProgram = (imported = false) => {
    try {
      const importedProgram = imported
        ? HamiltonMacro.importAlg(hamiltonInput.value)
        : {program: HamiltonMacro.parse(hamiltonInput.value), implicitExport: false};
      const program = importedProgram.program;
      const rootMeasurement = HamiltonMacro.measure(program);
      hamiltonProgram = program;
      hamiltonNode.replaceChildren(...[...program.definitions.keys()].map((name) => {
        const option = document.createElement("option");
        option.value = name;
        const measurement = HamiltonMacro.measure(program, name);
        option.textContent = `${name} · ${measurement.quarterTurns.toString()} QTM · ${measurement.moveEvents.toString()} HTM · ${measurement.sourceElements.toString()} source nodes`;
        return option;
      }));
      hamiltonNode.value = program.exportName;
      hamiltonNode.disabled = false;
      hamiltonWindowStart.disabled = false;
      hamiltonWindowLength.disabled = false;
      hamiltonPreview.disabled = false;
      hamiltonStreamButton.disabled = false;
      const rootKind = importedProgram.implicitExport ? `Imported root ${program.exportName}` : `Export ${program.exportName}`;
      hamiltonResult.textContent = `${rootKind} · ${rootMeasurement.quarterTurns.toString()} QTM · ${rootMeasurement.moveEvents.toString()} HTM · ${rootMeasurement.sourceElements.toString()} source nodes · depth ${rootMeasurement.depth}.`;
      hamiltonResult.classList.remove("failure");
    } catch (reason) {
      hamiltonProgram = null;
      hamiltonNode.replaceChildren();
      hamiltonNode.disabled = true;
      hamiltonWindowStart.disabled = true;
      hamiltonWindowLength.disabled = true;
      hamiltonPreview.disabled = true;
      hamiltonStreamButton.disabled = true;
      hamiltonResult.textContent = reason instanceof Error ? reason.message : "Could not parse Hamilton macros.";
      hamiltonResult.classList.add("failure");
    }
  };

  hamiltonInspect.addEventListener("click", () => {
    inspectHamiltonProgram();
  });

  hamiltonImport.addEventListener("change", async () => {
    const file = hamiltonImport.files?.[0];
    if (!file) return;
    try {
      hamiltonInput.value = await file.text();
      inspectHamiltonProgram(true);
    } catch (reason) {
      hamiltonResult.textContent = reason instanceof Error ? reason.message : "Could not import the macro source.";
      hamiltonResult.classList.add("failure");
    } finally {
      hamiltonImport.value = "";
    }
  });

  hamiltonPreview.addEventListener("click", () => {
    if (hamiltonProgram === null) return;
    const startText = hamiltonWindowStart.value.trim();
    const length = Number(hamiltonWindowLength.value);
    if (!/^\d+$/.test(startText) || !Number.isInteger(length) || length < 1 || length > 500) {
      hamiltonResult.textContent = "Preview start must be a non-negative integer and moves must be between 1 and 500.";
      hamiltonResult.classList.add("failure");
      return;
    }
    const start = BigInt(startText);
    const moves = HamiltonMacro.window(hamiltonProgram, start, length, hamiltonNode.value);
    if (moves.length === 0) {
      hamiltonResult.textContent = `No moves are available from offset ${start.toString()} in ${hamiltonNode.value}.`;
      hamiltonResult.classList.add("failure");
      return;
    }
    const source = moves.join(" ");
    const parsed = MoveParser.parseWithOptions(3, "Wide", "Modern", source) as Result<unknown[], unknown>;
    const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
    if (parsed.TAG !== "Ok" || solved.TAG !== "Ok") return;
    const timeline = buildTimeline(solved._0, parsed._0);
    if (timeline.TAG === "Error") return;
    stopPlayback();
    activeTimeline = timeline._0;
    activeTimelineKey = null;
    activeIndex = 0;
    renderState(solved._0, `Hamilton macro preview · ${hamiltonNode.value} at ${start.toString()}`);
    updatePlaybackUi(true);
    const measurement = HamiltonMacro.measure(hamiltonProgram, hamiltonNode.value);
    hamiltonResult.textContent = `Previewing ${moves.length} HTM of ${measurement.moveEvents.toString()} HTM from ${hamiltonNode.value} at offset ${start.toString()} (${measurement.quarterTurns.toString()} QTM total).`;
    hamiltonResult.classList.remove("failure");
  });

  hamiltonStreamButton.addEventListener("click", () => {
    if (hamiltonProgram === null) return;
    const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
    if (solved.TAG !== "Ok") return;
    stopPlayback();
    activeTimeline = null;
    activeTimelineKey = null;
    hamiltonStream = {
      player: HamiltonMacro.createStreamPlayer(hamiltonProgram, hamiltonNode.value),
      node: hamiltonNode.value,
      state: solved._0,
      measurement: HamiltonMacro.measure(hamiltonProgram, hamiltonNode.value),
      quarterTurnsPlayed: 0n,
    };
    renderState(solved._0, `Hamilton streaming player · ${hamiltonNode.value}`);
    hamiltonResult.textContent = `Streaming ${hamiltonNode.value} from its generator. Use Play or Step forward; tape seeking is disabled.`;
    hamiltonResult.classList.remove("failure");
    updatePlaybackUi(true);
  });

  const presentTutorialSolution = (
    initialState: CubeState,
    solution: TutorialSolution,
    academy: AcademyElements,
  ) => {
    activeAcademy = academy;
    let cursor = 0;
    tutorialPhases = solution.phases.map((phase) => {
      const expanded = MoveExecutor.expandTimeline(phase.alg) as Result<ExpandedTutorialEntry[], unknown>;
      const count = expanded.TAG === "Ok"
        ? expanded._0.filter((entry) => entry.comment === undefined).length
        : 0;
      const range = {...phase, method: academy.method, start: cursor, end: cursor + count};
      cursor += count;
      return range;
    });
    academy.phases.replaceChildren();
    tutorialPhases.forEach((phase) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "academy-phase";
      button.dataset.tutorialPhase = String(phase.number);
      button.dataset.tutorialPhaseStart = String(phase.start);
      button.dataset.tutorialPhaseEnd = String(phase.end);
      if (isPetrusMethod(academy.method)) {
        button.dataset.petrusPhase = String(phase.number);
        button.dataset.petrusPhaseStart = String(phase.start);
      } else if (!isCfopMethod(academy.method)) {
        button.dataset.beginnerPhase = String(phase.number);
        button.dataset.beginnerPhaseStart = String(phase.start);
      } else {
        button.dataset.cfopPhase = String(phase.number);
        button.dataset.cfopPhaseStart = String(phase.start);
      }
      const title = document.createElement("strong");
      title.textContent = `Step ${phase.number}: ${phase.title}`;
      const instruction = document.createElement("span");
      instruction.textContent = phase.instruction;
      const moveCount = tutorialPhaseMoveCount(phase);
      const executionCount = tutorialPhaseExecutionCount(phase);
      const metrics = document.createElement("span");
      metrics.className = "academy-phase-metrics";
      metrics.textContent = executionCount === 0
        ? "Already satisfied · 0 HTM"
        : executionCount === moveCount
          ? `${moveCount} HTM`
          : `${moveCount} HTM · ${executionCount} ETM`;
      button.classList.toggle("satisfied", executionCount === 0);
      button.dataset.phaseMoveCount = String(moveCount);
      button.dataset.phaseExecutionCount = String(executionCount);
      button.append(title, instruction, metrics);
      if (phase.sequences && phase.sequences.length > 0) {
        const cases = document.createElement("span");
        cases.className = "academy-phase-cases";
        phase.sequences.forEach((sequence, index) => {
          const item = document.createElement("span");
          item.textContent = `${index + 1}. ${sequence}`;
          cases.append(item);
        });
        button.append(cases);
      }
      const showPhaseFocus = () => activateTutorialFocus(button, firstFocusPieceInPhase(phase));
      button.addEventListener("mouseenter", showPhaseFocus);
      button.addEventListener("mouseleave", () => {
        if (focusedGroup === button && document.activeElement !== button) clearTutorialFocus();
      });
      button.addEventListener("focus", showPhaseFocus);
      button.addEventListener("blur", () => {
        if (focusedGroup === button) clearTutorialFocus();
      });
      academy.phases.append(button);
    });
    commentedTutorialSolution = solution.phases.map((phase) => {
      const moves = MoveTransform.serialize(phase.alg);
      const family = isCfopMethod(academy.method)
        ? "CFOP"
        : isPetrusMethod(academy.method)
          ? "PETRUS"
          : "STEP";
      return `// ${family} ${phase.number}: ${phase.title}\n// ${phase.instruction}\n${moves || "// Already complete"}`;
    }).join("\n\n");
    academy.solution.textContent = commentedTutorialSolution;
    academy.solution.hidden = false;
    academy.copy.disabled = false;
    academy.status.classList.remove("error");
    const benchmarkTarget = academy.method === "advancedLbl"
      ? 76
      : academy.method === "beginnerCfop"
        ? 70
      : academy.method === "fullCfop"
        ? 60
        : academy.method === "advancedCfop"
          ? 55
          : null;
    const benchmark = benchmarkTarget === null
      ? ""
      : solution.moveCount <= benchmarkTarget
        ? ` · ≤${benchmarkTarget} benchmark met`
        : ` · ${solution.moveCount - benchmarkTarget} over the ≤${benchmarkTarget} benchmark`;
    const executionCount = tutorialPhases.reduce(
      (total, phase) => total + tutorialPhaseExecutionCount(phase),
      0,
    );
    const executionMetric = executionCount === solution.moveCount
      ? `${solution.moveCount} HTM`
      : `${solution.moveCount} HTM · ${executionCount} ETM`;
    academy.status.textContent = solution.moveCount === 0
      ? `Already solved · 0 HTM · all ${academy.phaseCount} ${academy.label} phases are satisfied. Load Practice scramble for a guided solve.`
      : `Verified ${academy.label} solution · ${executionMetric} · ${academy.phaseCount} phases${benchmark}`;
    coachingControls.hidden = false;

    const timeline = buildTimeline(initialState, solution.alg);
    if (timeline.TAG === "Error") {
      academy.status.textContent = timeline._0;
      academy.status.classList.add("error");
      return;
    }
    stopPlayback();
    activeTimeline = timeline._0;
    activeTimelineKey = null;
    activeIndex = 0;
    lastLabel = `${academy.label} tutorial`;
    renderState(initialState, lastLabel);
    updatePlaybackUi(true);
  };

  academySolve.addEventListener("click", () => {
    const method = selectedTutorialMethod();
    if (size !== 3 || activeRecognized === null) return;
    const initialState = activeRecognized.state;
    const target = academyTargetState();
    const academy = academyForMethod(method);
    if (target.TAG === "Error") {
      academy.status.textContent = target._0;
      academy.status.classList.add("error");
      return;
    }
    const relative = relativeAcademyState(initialState, target._0);
    if (relative.TAG === "Error") {
      academy.status.textContent = relative._0;
      academy.status.classList.add("error");
      return;
    }
    const request = academyRequestGuard.begin();
    academySolveBusy = true;
    updateAcademySolveButton();
    academy.status.classList.remove("error");
    academy.status.textContent = method === "beginner"
      ? "Building and replay-verifying the seven beginner phases…"
      : `Building and replay-verifying the ${academy.phaseCount} ${academy.label} phases…`;
    void solverClient.solve(method, relative._0).then((solution) => {
      if (!academyRequestGuard.isCurrent(request)) return;
      academySolveBusy = false;
      const replay = MoveExecutor.applyAlg(initialState, solution.alg) as Result<CubeState, unknown>;
      if (replay.TAG === "Error" || FaceletCodec.render(replay._0) !== FaceletCodec.render(target._0)) {
        academy.status.textContent = "The generated solution did not replay from setup to the target pattern.";
        academy.status.classList.add("error");
        updateAcademySolveButton();
        return;
      }
      savedTutorialSolutions.set(method, {initialState, solution});
      updateAcademyComparison();
      updateAcademySolveButton();
      presentTutorialSolution(initialState, solution, academy);
    }).catch((reason: unknown) => {
      if (!academyRequestGuard.isCurrent(request)) return;
      academySolveBusy = false;
      academy.status.textContent = reason instanceof Error ? reason.message : String(reason);
      academy.status.classList.add("error");
      updateAcademySolveButton();
    });
  });

  academyInstantDrill.addEventListener("click", () => {
    if (!smartCubeConnected || !activeRecognized || size !== 3) {
      academyForMethod(selectedTutorialMethod()).status.textContent = "Connect a 3×3 smart cube to start an instant drill.";
      return;
    }
    setSmartCubeControllerMode(true);
    loadVirtualControllerState(activeRecognized.state, "Virtual controller · Academy instant drill");
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Academy drill loaded; physical stickers are ignored.`;
    if (academyWcaDrillEnabled) {
      window.dispatchEvent(new CustomEvent("cubelab:timer-arena", {detail: {enabled: true}}));
      window.dispatchEvent(new Event("cubelab:timer-cover"));
    }
  });

  academyWcaDrill.addEventListener("click", () => {
    academyWcaDrillEnabled = !academyWcaDrillEnabled;
    academyWcaDrill.classList.toggle("active", academyWcaDrillEnabled);
    academyWcaDrill.setAttribute("aria-pressed", String(academyWcaDrillEnabled));
    academyWcaDrill.textContent = academyWcaDrillEnabled ? "WCA drill on" : "WCA drill off";
  });

  const loadCuratedDrill = (drill: DrillCase, yRotation = 0) => {
    if (!drill || !smartCubeConnected) {
      academyForMethod(selectedTutorialMethod()).status.textContent = "Connect a smart cube to load a curated virtual drill.";
      return;
    }
    const parsed = MoveParser.parseWithOptions(3, "Wide", "Modern", drill.algorithm) as Result<unknown[], {message: string}>;
    if (parsed.TAG === "Error") {
      academyForMethod(selectedTutorialMethod()).status.textContent = parsed._0.message;
      return;
    }
    const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
    if (solved.TAG !== "Ok") return;
    const rotated = MoveTransform.rotate(parsed._0, "Y", yRotation);
    const caseState = MoveExecutor.applyAlg(solved._0, MoveTransform.invert(rotated)) as Result<CubeState, unknown>;
    if (caseState.TAG === "Error") {
      academyForMethod(selectedTutorialMethod()).status.textContent = "Could not construct the selected drill case.";
      return;
    }
    setSmartCubeControllerMode(true);
    const orientation = yRotation % 4 === 0 ? "" : ` · y${yRotation % 4 === 1 ? "" : yRotation % 4}`;
    const algorithm = MoveTransform.serialize(rotated) as string;
    loadVirtualControllerState(caseState._0, `Virtual controller · ${drill.label}${orientation}`);
    smartCubeStatus.textContent = `${smartCubeDeviceName} · ${drill.label}${orientation} loaded. Solve: ${algorithm}`;
    if (academyWcaDrillEnabled) {
      window.dispatchEvent(new CustomEvent("cubelab:timer-arena", {detail: {enabled: true}}));
      window.dispatchEvent(new Event("cubelab:timer-cover"));
    }
  };

  academyLoadDrill.addEventListener("click", () => {
    const drill = drillCaseById(academyDrillCase.value);
    if (drill) loadCuratedDrill(drill);
  });
  academyDrillFamily.addEventListener("change", () => populateDrillCases());
  academyRandomDrill.addEventListener("click", () => {
    const drill = randomDrillCase(selectedDrillFamily());
    if (!drill) return;
    academyDrillCase.value = drill.id;
    const yRotation = nextRandomDrillRotation;
    nextRandomDrillRotation = advanceDrillRotation(nextRandomDrillRotation);
    loadCuratedDrill(drill, yRotation);
  });

  academyTarget.addEventListener("input", () => {
    if (activeRecognized) updateAcademySource(activeRecognized);
  });

  academies.forEach((academy) => {
    academy.phases.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-tutorial-phase-start]");
      if (!button) return;
      const start = Number(button.dataset.tutorialPhaseStart);
      const end = Number(button.dataset.tutorialPhaseEnd);
      void seek(start, false);
      if (start === end) {
        const selected = tutorialPhases.find(
          (phase) => phase.number === Number(button.dataset.tutorialPhase),
        );
        if (selected) showTutorialPhase(selected, true);
      }
    });
    academy.copy.addEventListener("click", async () => {
      if (activeAcademy !== academy || commentedTutorialSolution === "") return;
      await navigator.clipboard.writeText(commentedTutorialSolution);
      academy.copy.textContent = "Copied";
      window.setTimeout(() => {
        academy.copy.textContent = isCfopMethod(academy.method)
          ? "Copy commented CFOP solution"
          : isPetrusMethod(academy.method)
            ? `Copy commented ${academy.label} solution`
            : "Copy commented solution";
      }, 1500);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-cube-style]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({cubeStyle: button.dataset.cubeStyle as CubeStyle});
    });
  });
  const bluetoothPolicyAllows = () => {
    const policyDocument = document as Document & {
      permissionsPolicy?: {allowsFeature: (feature: string) => boolean};
      featurePolicy?: {allowsFeature: (feature: string) => boolean};
    };
    const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
    return policy?.allowsFeature("bluetooth") ?? true;
  };
  const showBluetoothUnavailable = (message: string) => {
    smartCubeDock.hidden = false;
    smartCubeDock.dataset.phase = "error";
    smartCubeStatus.textContent = message;
    smartCubeStatus.title = message;
  };
  const smartCubeChunkReloadKey = "cube-rosetta:smart-cube-chunk-reload";
  const isStaleDynamicModuleError = (reason: unknown) =>
    /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i
      .test(reason instanceof Error ? reason.message : String(reason));
  const smartCubeChunkReloadAttempted = () => {
    try {
      return sessionStorage.getItem(smartCubeChunkReloadKey) === "attempted";
    } catch {
      return false;
    }
  };
  const markSmartCubeChunkReloadAttempted = () => {
    try {
      sessionStorage.setItem(smartCubeChunkReloadKey, "attempted");
    } catch {}
  };
  const clearSmartCubeChunkReload = () => {
    try {
      sessionStorage.removeItem(smartCubeChunkReloadKey);
    } catch {}
  };
  if (smartCubeChunkReloadAttempted()) {
    showBluetoothUnavailable("CubeLab was updated while this page was open. Click Connect cube again.");
    smartCubeDock.dataset.phase = "disconnected";
  }
  const bluetoothChooserWasCancelled = (reason: unknown) => {
    if (!(reason instanceof DOMException) || reason.name !== "NotFoundError") return false;
    return /(?:chooser|request).*(?:cancelled|canceled)|user cancelled|no (?:bluetooth )?device (?:was )?selected/i
      .test(reason.message);
  };
  const isBraveBrowser = async () => {
    const brave = (navigator as Navigator & {
      brave?: {isBrave?: () => Promise<boolean>};
    }).brave;
    return await brave?.isBrave?.().catch(() => false) ?? false;
  };
  const braveBluetoothHelp =
    "Brave disables Web Bluetooth by default. Open brave://flags/#brave-web-bluetooth-api, set Web Bluetooth API to Enabled, relaunch Brave, then retry.";
  const describeBluetoothFailure = (reason: unknown, usingBrave: boolean) => {
    const detail = reason instanceof Error ? reason.message : String(reason);
    if (/globally disabled|permission has been blocked|enterprise policy|disabled web bluetooth/i.test(detail)) {
      if (usingBrave) return braveBluetoothHelp;
      return window.self === window.top
        ? "Bluetooth is blocked by the browser. Allow Bluetooth devices in Chrome or Edge site settings and enable the browser in macOS Privacy & Security, then retry."
        : "Bluetooth is blocked in this embedded preview. Open CubeLab directly in Chrome or Edge, then connect again.";
    }
    if (/denied.*(?:scan|permission)|not allowed/i.test(detail)) {
      return "Bluetooth scanning was denied. Allow Bluetooth access for this browser and site, then retry.";
    }
    return detail;
  };
  smartCubeConnect.addEventListener("click", async () => {
    void smartCubeAudio.unlock();
    const usingBrave = await isBraveBrowser();
    if ((typeof isSecureContext !== "undefined" && !isSecureContext) || !bluetoothPolicyAllows()) {
      showBluetoothUnavailable("Bluetooth permission is blocked for this page");
      return;
    }
    // Read the permission-gated API only after a user gesture. Some embedded
    // browsers log a warning every time this property is probed.
    const bluetooth = navigator.bluetooth;
    if (typeof bluetooth?.requestDevice !== "function") {
      showBluetoothUnavailable("Web Bluetooth requires Chrome or Edge in a secure context");
      return;
    }
    if (typeof bluetooth.getAvailability === "function") {
      const available = await bluetooth.getAvailability().catch(() => null);
      if (available === false) {
        showBluetoothUnavailable(usingBrave
          ? braveBluetoothHelp
          : "Bluetooth is unavailable or blocked. Turn Bluetooth on and allow Chrome or Edge in macOS Privacy & Security, then retry.");
        return;
      }
    }
    store.patch({size: 3});
    try {
      const manager = await loadSmartCubeManager();
      smartCubeStateSyncPending = true;
      await manager.connect({
        enableAddressSearch: true,
        macAddressProvider: async (device, isFallbackCall) => {
          // Let the transport inspect GAN manufacturer advertisements first.
          // This callback is invoked once before and once after that attempt.
          if (!isFallbackCall) return null;
          const experimentalFeaturesUrl = usingBrave
            ? "brave://flags/#enable-experimental-web-platform-features"
            : "chrome://flags/#enable-experimental-web-platform-features";
          const value = window.prompt(
            `${device.name ?? "This encrypted cube"} did not expose its Bluetooth MAC address. `
              + `Enter it as aa:bb:cc:dd:ee:ff, or Cancel. For automatic detection, enable `
              + `${experimentalFeaturesUrl} and restart the browser.`,
          );
          return value?.trim() || null;
        },
      });
    } catch (reason) {
      if (bluetoothChooserWasCancelled(reason)) {
        await smartCubeManager?.disconnect();
        return;
      }
      smartCubeDock.hidden = false;
      smartCubeDock.dataset.phase = "error";
      smartCubeStatus.textContent = describeBluetoothFailure(reason, usingBrave);
      smartCubeStatus.title = smartCubeStatus.textContent;
    }
  });
  smartCubeDisconnect.addEventListener("click", () => {
    void smartCubeManager?.disconnect();
  });
  smartCubeSound.addEventListener("click", () => {
    const enabled = !smartCubeAudio.isEnabled();
    smartCubeAudio.setEnabled(enabled);
    try {
      writeSmartCubeSoundPreference(window.localStorage, enabled);
    } catch {}
    updateSmartCubeSoundUi();
    if (enabled) void smartCubeAudio.unlock().then(() => smartCubeAudio.play("realigned"));
  });
  smartCubeReroute.addEventListener("click", () => {
    if (!smartCubeLiveState || activeTab !== "academy") return;
    clearSmartCubeRecovery();
    smartCubeHalfTurnProgress = null;
    stopPlayback();
    const facelets = FaceletCodec.render(smartCubeLiveState);
    store.patch({size: 3, input: facelets});
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Re-routing from physical state…`;
    coachStatus.textContent = "Generating a fresh verified route from the current physical state.";
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => academySolve.click()));
  });
  smartCubeSync.addEventListener("click", async () => {
    if (!smartCubeConnected || !smartCubeManager) return;
    smartCubeStateSyncPending = true;
    smartCubeSync.disabled = true;
    smartCubeSync.textContent = "Syncing…";
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Reading physical state…`;
    try {
      await smartCubeManager.refresh();
    } catch (reason) {
      smartCubeStateSyncPending = false;
      smartCubeStatus.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      smartCubeSync.disabled = false;
      smartCubeSync.textContent = "Sync state";
    }
  });
  smartCubeResetState.addEventListener("click", async () => {
    if (!smartCubeConnected || !smartCubeManager) return;
    const confirmed = window.confirm(
      "Set the smart cube's internal state to solved? Continue only if the physical cube is already solved.",
    );
    if (!confirmed) return;
    smartCubeResetState.disabled = true;
    smartCubeResetState.textContent = "Setting solved…";
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Setting internal state to solved…`;
    try {
      await smartCubeManager.resetCubeState();
      const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
      if (solved.TAG !== "Ok") throw new Error("Could not create the solved 3×3 baseline");
      smartCubeStateSyncPending = false;
      smartCubeLiveState = solved._0;
      smartCubeRenderedState = solved._0;
      smartCubePendingMoves.length = 0;
      renderSmartCubeLiveState();
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Internal state set to solved; local baseline updated without reading facelets.`;
    } catch (reason) {
      smartCubeStateSyncPending = false;
      smartCubeStatus.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      smartCubeResetState.disabled = false;
      smartCubeResetState.textContent = "Set state to solved";
    }
  });
  smartCubeOrientation.addEventListener("click", () => {
    setSmartCubeOrientationTracking(!smartCubeOrientationTracking);
  });
  smartCubeController.addEventListener("click", () => {
    setSmartCubeControllerMode(smartCubeSyncMode !== "VirtualController");
  });
  const resetCameraView = () => {
    if (smartCubeConnected && smartCubeManager) {
      smartCubeManager.refresh().catch((reason) => {
        smartCubeStatus.textContent = reason instanceof Error ? reason.message : String(reason);
      });
    }
    tutorialCameraGeneration += 1;
    tutorialCameraRestore = null;
    delete canvas.dataset.sequenceCameraRestoreYaw;
    delete canvas.dataset.sequenceCameraRestorePitch;
    autoOrbitButton.setAttribute("aria-pressed", "false");
    autoOrbitButton.classList.remove("active");
    viewport?.setAutoOrbit(false);
    viewport?.resetCamera();
    syncSmartCubeTrackedOrientation();
  };
  root.querySelector<HTMLButtonElement>("[data-reset-camera]")!.addEventListener("click", resetCameraView);
  shortcutsHelp.addEventListener("click", () => shortcutsDialog.showModal());
  shortcutsClose.addEventListener("click", () => shortcutsDialog.close());
  autoOrbitButton.addEventListener("click", () => {
    if (smartCubeOrientationTracking) return;
    const enabled = autoOrbitButton.getAttribute("aria-pressed") !== "true";
    autoOrbitButton.setAttribute("aria-pressed", String(enabled));
    autoOrbitButton.classList.toggle("active", enabled);
    viewport?.setAutoOrbit(enabled);
  });
  turnGuidesButton.addEventListener("click", () => {
    store.patch({turnGuides: !turnGuides});
  });
  moveRibbon.addEventListener("mouseleave", () => {
    if (hoverPreviewCursor !== null && !moveRibbon.contains(document.activeElement)) {
      clearTurnGuide("restore");
    }
    if (tutorialCameraRestore !== null && !moveRibbon.contains(document.activeElement)) {
      clearTutorialFocus("restore");
    }
  });
  playbackBegin.addEventListener("click", () => {
    void seek(0, false);
  });
  root.querySelector<HTMLButtonElement>("[data-playback-back]")!.addEventListener("click", () => {
    void executeSingleMove(-1);
  });
  playbackReverse.addEventListener("click", () => {
    if (playbackDirection === -1) return;
    void play(-1);
  });
  playbackPause.addEventListener("click", () => {
    smartCubeHalfTurnProgress = null;
    stopPlayback();
    clearTurnGuide("restore");
  });
  playbackPlay.addEventListener("click", () => {
    if (playbackDirection === 1 || smartCubeCoachingWaiting) return;
    if (hamiltonStream !== null && activeTimeline === null) void playHamiltonStream();
    else if (smartCubeConnected) waitForSmartCubeMove();
    else void play(1);
  });
  root.querySelector<HTMLButtonElement>("[data-playback-forward]")!.addEventListener("click", () => {
    void executeSingleMove(1);
  });
  playbackEnd.addEventListener("click", () => {
    if (activeTimeline) void seek(activeTimeline.steps.length, false);
  });
  scrubber.addEventListener("input", () => {
    void seek(Number(scrubber.value), false);
  });
  moveRibbon.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-move-index]");
    if (button) void seekTimelineToken(Number(button.dataset.moveIndex));
  });
  root.querySelectorAll<HTMLButtonElement>("[data-playback-speed]").forEach((button) => {
    button.addEventListener("click", () => {
      playbackSpeed = Number(button.dataset.playbackSpeed);
      root.querySelectorAll<HTMLButtonElement>("[data-playback-speed]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-coaching-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      coachedPlayback = button.dataset.coachingMode === "coached";
      root.querySelectorAll<HTMLButtonElement>("[data-coaching-mode]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
    });
  });
  root.querySelector<HTMLButtonElement>("[data-playback-loop]")!.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    looping = !looping;
    button.classList.toggle("active", looping);
    button.setAttribute("aria-pressed", String(looping));
  });

  const appendDirectMove = (token: string) => {
    if (input.value.trim() !== "" && activeTimeline === null) return;
    const trimmed = input.value.trimEnd();
    const lastLine = trimmed.slice(trimmed.lastIndexOf("\n") + 1);
    const afterLineComment = lastLine.includes("//") || /(^|\s)#/.test(lastLine);
    const separator = trimmed === "" ? "" : afterLineComment ? "\n" : " ";
    const next = `${trimmed}${separator}${token}`;
    if (next.length <= 20_000) store.patch({input: next});
  };

  const flushPendingDirectMove = () => {
    if (pendingDirectMove === null) return;
    const pending = pendingDirectMove;
    window.clearTimeout(pending.timeout);
    pendingDirectMove = null;
    appendDirectMove(pending.token);
  };

  const queueDirectMove = (base: string, wide: boolean, prime: boolean) => {
    const stem = `${base}${wide ? "w" : ""}`;
    const signature = `${stem}${prime ? "'" : ""}`;
    if (pendingDirectMove !== null) {
      const pending = pendingDirectMove;
      window.clearTimeout(pending.timeout);
      pendingDirectMove = null;
      if (pending.signature === signature) {
        appendDirectMove(pending.doubledToken);
        return;
      }
      appendDirectMove(pending.token);
    }
    const token = `${stem}${prime ? "'" : ""}`;
    const timeout = window.setTimeout(() => {
      if (pendingDirectMove?.signature !== signature) return;
      pendingDirectMove = null;
      appendDirectMove(token);
    }, 250);
    pendingDirectMove = {signature, token, doubledToken: `${stem}2`, timeout};
  };

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing = target instanceof HTMLElement && (
      target.isContentEditable || target.closest("input, textarea, select") !== null
    );
    const buttonFocused = target instanceof HTMLElement && target.closest("button") !== null;
    if (editing || event.metaKey || event.ctrlKey) return;
    if (
      event.key === "?"
      || (event.code === "Slash" && event.shiftKey)
      || event.key.toLowerCase() === "h"
    ) {
      event.preventDefault();
      flushPendingDirectMove();
      if (shortcutsDialog.open) shortcutsDialog.close();
      else shortcutsDialog.showModal();
      return;
    }
    if (shortcutsDialog.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (playerMode) {
        if (timerArenaMode) setTimerArenaMode(false);
        setPlayerMode(false);
        return;
      }
      if (pendingDirectMove !== null) {
        window.clearTimeout(pendingDirectMove.timeout);
        pendingDirectMove = null;
      }
      stopPlayback();
      clearTutorialFocus();
      clearTurnGuide();
      return;
    }
    if (event.key.toLowerCase() === "c" && !event.altKey) {
      event.preventDefault();
      flushPendingDirectMove();
      resetCameraView();
      return;
    }
    if (!event.repeat && event.code === "KeyW" && !event.altKey) {
      event.preventDefault();
      widePrefixExpires = performance.now() + 600;
      return;
    }
    if (!event.repeat && (event.code === "Digit2" || event.code === "Numpad2")) {
      if (pendingDirectMove !== null) {
        event.preventDefault();
        const pending = pendingDirectMove;
        window.clearTimeout(pending.timeout);
        pendingDirectMove = null;
        appendDirectMove(pending.doubledToken);
      }
      return;
    }
    const directCode = /^Key([RUFLDBMESXYZ])$/.exec(event.code)?.[1];
    if (!event.repeat && directCode) {
      const face = "RUFLDB".includes(directCode);
      if (!event.altKey || face) {
        event.preventDefault();
        const wide = face && (event.altKey || performance.now() <= widePrefixExpires);
        widePrefixExpires = 0;
        const base = "XYZ".includes(directCode) ? directCode.toLowerCase() : directCode;
        queueDirectMove(base, wide, event.shiftKey);
        return;
      }
    }
    if (event.altKey) return;
    flushPendingDirectMove();
    if (buttonFocused) return;
    if (!activeTimeline?.states || playback.hidden) return;
    switch (event.key) {
      case " ":
        event.preventDefault();
        if (playbackDirection !== 0 || smartCubeCoachingWaiting) {
          smartCubeHalfTurnProgress = null;
          stopPlayback();
          clearTurnGuide("restore");
        }
        else if (smartCubeConnected) waitForSmartCubeMove();
        else void play(1);
        break;
      case "Home":
        event.preventDefault();
        void seek(0, false);
        break;
      case "End":
        event.preventDefault();
        void seek(activeTimeline.steps.length, false);
        break;
      case "0":
        event.preventDefault();
        void seek(0, false);
        break;
      case "$":
        event.preventDefault();
        void seek(activeTimeline.steps.length, false);
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (event.shiftKey) void executeSequence(-1);
        else void executeSingleMove(-1);
        break;
      case "ArrowRight":
        event.preventDefault();
        if (event.shiftKey) void executeSequence(1);
        else void executeSingleMove(1);
        break;
      case "[":
        event.preventDefault();
        void executeSequence(-1);
        break;
      case "]":
        event.preventDefault();
        void executeSequence(1);
        break;
    }
  });
  root.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const presetSize = button.dataset.presetSize;
      store.patch({
        input: button.dataset.preset ?? "",
        ...(presetSize ? {size: Number(presetSize)} : {}),
      });
    });
  });

  patternSearch.addEventListener("input", renderPatternBrowser);
  patternExtremalFilter.addEventListener("change", renderPatternBrowser);
  patternSelect.addEventListener("change", renderSelectedPattern);
  patternLoad.addEventListener("click", () => {
    if (!selectedPattern) return;
    store.patch({size: selectedPattern.size, input: selectedPattern.construction});
  });
  patternPreviewSolution.addEventListener("click", previewDetectedPatternSolution);
  patternCopySolution.addEventListener("click", async () => {
    if (!detectedPattern?.solution) return;
    const copied = await copyText(detectedPattern.solution);
    patternCopySolution.textContent = copied ? "Copied" : "Copy failed";
    window.setTimeout(() => {
      patternCopySolution.textContent = "Copy solution";
    }, 1500);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    const idleLabel = button.textContent ?? "Copy";
    button.addEventListener("click", async () => {
      const key = button.dataset.copy;
      const output = key ? root.querySelector<HTMLElement>(`[data-output="${key}"]`) : null;
      if (button.disabled || !output || output.textContent === "—") return;
      const copied = await copyText(output.textContent ?? "");
      button.textContent = copied ? "Copied" : "Copy failed";
      button.classList.toggle("copied", copied);
      window.setTimeout(() => {
        button.textContent = idleLabel;
        button.classList.remove("copied");
      }, 1500);
    });
  });

  const unsubscribe = store.subscribe(applyAppState);
  const stopHashSync = synchronizeHash(store, window);
  applyAppState(initialState);
  window.addEventListener(
    "pagehide",
    () => {
      unsubscribe();
      stopHashSync();
      void smartCubeManager?.disconnect();
      smartCubeAudio.dispose();
      viewport?.dispose();
    },
    {once: true},
  );
}
