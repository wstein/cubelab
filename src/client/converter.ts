import * as ColorCodec from "../State/ColorCodec.res.mjs";
import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as NetCodec from "../State/NetCodec.res.mjs";
import * as Orbit64Codec from "../State/Orbit64Codec.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";
import {validate4x4} from "../State/StateValidation4x4.res.mjs";
import * as MoveCompatibility from "../Move/MoveCompatibility.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";
import * as MoveNiss from "../Move/MoveNiss.res.mjs";
import * as MoveParser from "../Move/MoveParser.res.mjs";
import * as MoveTransform from "../Move/MoveTransform.res.mjs";
import * as HamiltonMacro from "../Move/HamiltonMacro.res.mjs";
import * as AlgorithmOptimizer from "../Solver/AlgorithmOptimizer.res.mjs";
import {inspectReduction4x4, planOLLParityRepair4x4, planPLLParityRepair4x4, reduce4x4} from "../Solver/Reduction4x4.res.mjs";
import {inspectReduction5x5, planOLLParityRepair5x5, planPLLParityRepair5x5, reduce5x5} from "../Solver/Reduction5x5.res.mjs";
import {createAcademyGuideCache} from "./academy-guide-cache";
import {
  createPetrus5x5EvaluationCache,
  petrus5x5PhaseDefinitions,
} from "./petrus-5x5-academy";
import {
  createOptimal2x2SolverClient,
  createRandom2x2ScrambleClient,
  createTwoByTwoAcademySolverClient,
  createTwoByTwoPetrusSolverClient,
  createReduction4x4SolverClient,
  createLazyWorker,
  createReductionGuideClient,
  createReduction5x5BarSolverClient,
  createReduction5x5CycleSolverClient,
  createReduction5x5L2ESolverClient,
  createManualStateVerifierClient,
  createSolverClient,
  createTwoPhaseSolverClient,
} from "./workers/solver-client";
import {mountTimerWorkspace} from "./timer/workspace";
import {defaultPreferences, hasVerifiedTnoodle, readPreferences, writePreferences} from "./preferences";
import {TnoodleClient} from "./scramble/tnoodle-client";
import {createAcademyRequestGuard} from "./academy-request";
import {computed, signal} from "./signal";
import {looksLikeAcubeState, parseAcubeState} from "./acube-state";
import {countAcubeCompletions, materializeAcubeConstraint, parseAcubeConstraint, renderAcubeState} from "./acube-engine";
import {looksLikeSseState, parseSseState, renderSseState} from "./sse-state";
import {dialectForAlgorithmInput} from "./notation-dialect";
import {looksLikeLargeCubeState, parseLargeCubeState, renderLargeCubeState} from "./large-cube-state";
import {
  looksLikeSingmasterCycleState,
  parseSingmasterCycleState,
  renderSingmasterCycleState,
} from "./singmaster-cycle-state";
import {
  allowedManualStateColours,
  canCompleteManualState,
  emptyManualState,
  faceletOrder,
  fillForcedManualStateColours,
  fillForcedManualStateCoreCentres,
  fillLocallyForcedManualStateColours,
  isManualStateColourAllowedByScarcity,
  isManualStateCoreCentre,
  largeManualStateProgress,
  locallyAllowedManualStateColours,
  manualStateCornerSlots,
  manualStateEdgeSlots,
  manualStateEnteredCount,
  manualStateFaces,
  manualStateFrameStatus,
  manualStatePieceMates,
  manualStateViewDestination,
  manualStateLocalConstraintIndices,
  manualStateOrbits,
  resetManualState,
  manualStateStickerCount,
  solvedManualState,
  type ManualStateDraft,
  type ManualStateFace,
  type ManualStateSize,
} from "./manual-state";
import {dotTrace} from "./manual-state-trace";
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
} from "./cube-gl";
import {
  evaluateAlgorithm,
  buildTimeline,
  formatStep,
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
  hashForPath,
  pathWithDeploymentBase,
  pathWithoutDeploymentBase,
  pathForTab,
  readHash,
  readLocation,
  synchronizeHash,
  writeHash,
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
import {isMonochromeSolved2x2} from "./two-by-two-academy";
import {twoByTwoDrillCases, twoByTwoPetrusDrillCases} from "./two-by-two-drills";
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
import {reduceSmartCubeMirrorInput} from "./smart-cube/live-state";
import {createGestureRecenterDetector} from "./smart-cube/gesture-recenter";
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
type ReplayControls = {
  getReplayState: () => {status: "playing" | "paused"; offsetMs: number; eventIndex: number; rate: number; durationMs: number};
  play: () => void;
  pause: () => void;
  seek: (offsetMs: number) => void;
  step: () => void;
  setRate: (rate: number) => void;
  subscribeReplayReset: (listener: () => void) => () => void;
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
type ManualStateRepresentation = "standard" | "attached" | "open-cube" | "dual-3d" | "isometric";
type Scheme = "Western" | "Japanese" | {TAG: "Custom"; _0: string};
type CompatibilityAssessment = {compatible: boolean; reasons: string[]};
type CompatibilityResult = Record<"wca" | "signLgn" | "cubingJs" | "speedsolving" | "ruwix" | "sse" | "acube", CompatibilityAssessment>;
type RecognizedInput = {
  state: CubeState;
  label: string;
  timeline?: AlgorithmTimeline;
  timelineKey?: string;
};
type TutorialMethod = Exclude<AcademyMethod, "reduction4x4" | "reduction5x5" | "petrus5x5">;
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
type ReductionAcademyElements = {
  status: HTMLElement;
  current: HTMLElement;
  phases: HTMLElement;
  guide: HTMLElement;
  applyCentre: HTMLButtonElement;
  applyGuide: HTMLButtonElement;
  repairParity: HTMLButtonElement;
  finish: HTMLButtonElement;
};

const root = document.querySelector<HTMLElement>("[data-converter]");

if (root) {
  let playerMode = pathWithoutDeploymentBase(window.location.pathname) === "/player"
    || new URL(window.location.href).searchParams.get("player") === "1";
  let timerArenaMode = false;
  const playerPageLink = root.querySelector<HTMLAnchorElement>("[data-player-page-link]")!;
  const viewportMaximize = root.querySelector<HTMLButtonElement>("[data-viewport-maximize]")!;
  const renderViewportMaximize = () => {
    const maximized = document.fullscreenElement !== null;
    viewportMaximize.setAttribute("aria-pressed", String(maximized));
    viewportMaximize.classList.toggle("active", maximized);
    viewportMaximize.innerHTML = maximized
      ? '<span aria-hidden="true">⛶</span> Restore window'
      : '<span aria-hidden="true">⛶</span> Maximize';
    viewportMaximize.title = maximized
      ? "Restore the CubeLab window"
      : "Maximize CubeLab in this window";
  };
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
  renderViewportMaximize();
  const input = root.querySelector<HTMLTextAreaElement>("[data-input]")!;
  const movesInput = root.querySelector<HTMLTextAreaElement>("[data-moves-input]")!;
  const manualStateOpen = root.querySelector<HTMLButtonElement>("[data-manual-state-open]")!;
  const manualStateDialog = root.querySelector<HTMLDialogElement>("[data-manual-state-dialog]")!;
  const manualStateTitle = root.querySelector<HTMLElement>("[data-manual-state-title]")!;
  const manualStateIntro = root.querySelector<HTMLElement>(".manual-state-intro")!;
  const manualStateCancel = root.querySelector<HTMLButtonElement>("[data-manual-state-cancel]")!;
  const manualStateNet = root.querySelector<HTMLElement>("[data-manual-state-net]")!;
  const manualStateGrid = root.querySelector<HTMLElement>("[data-manual-state-grid]")!;
  const manualStateRepresentationButtons = root.querySelectorAll<HTMLButtonElement>("[data-manual-state-representation]");
  const manualStateRotationGroup = root.querySelector<HTMLElement>("[data-manual-state-rotation-group]")!;
  const manualStateRotateButtons = root.querySelectorAll<HTMLButtonElement>("[data-manual-state-rotate]");
  const manualStateFlipButton = root.querySelector<HTMLButtonElement>('[data-manual-state-rotate="flip"]')!;
  const manualStateRotateShortcut = root.querySelector<HTMLElement>("[data-manual-state-shortcut-rotate]")!;
  const manualStateFlipShortcut = root.querySelector<HTMLElement>("[data-manual-state-shortcut-flip]")!;
  const manualStatePalette = root.querySelector<HTMLElement>("[data-manual-state-palette]")!;
  const manualStateEraser = root.querySelector<HTMLButtonElement>("[data-manual-state-eraser]")!;
  const manualStateReset = root.querySelector<HTMLButtonElement>("[data-manual-state-reset]")!;
  const manualStateSolved = root.querySelector<HTMLButtonElement>("[data-manual-state-solved]")!;
  const manualStateUndo = root.querySelector<HTMLButtonElement>("[data-manual-state-undo]")!;
  const manualStateRedo = root.querySelector<HTMLButtonElement>("[data-manual-state-redo]")!;
  const manualStateSmartCubeSync = root.querySelector<HTMLButtonElement>("[data-manual-state-smart-cube-sync]")!;
  const manualStateSmartCubeStatus = root.querySelector<HTMLOutputElement>("[data-manual-state-smart-cube-status]")!;
  const manualStateSummary = root.querySelector<HTMLElement>("[data-manual-state-summary]")!;
  const manualStateFrame = root.querySelector<HTMLOutputElement>("[data-manual-state-frame]")!;
  const manualStateNotation = root.querySelector<HTMLTextAreaElement>("[data-manual-state-notation]")!;
  const manualStateNotationApply = root.querySelector<HTMLButtonElement>("[data-manual-state-notation-apply]")!;
  const manualStateNotationStatus = root.querySelector<HTMLOutputElement>("[data-manual-state-notation-status]")!;
  const manualStateLoad = root.querySelector<HTMLButtonElement>("[data-manual-state-load]")!;
  const manualStateCopyToggle = root.querySelector<HTMLButtonElement>("[data-manual-state-copy-toggle]")!;
  const manualStateCopyMenu = root.querySelector<HTMLElement>("[data-manual-state-copy-menu]")!;
  const schemeSelect = root.querySelector<HTMLSelectElement>("[data-scheme]")!;
  const customScheme = root.querySelector<HTMLInputElement>("[data-custom-scheme]")!;
  const converterColourNet = root.querySelector<HTMLElement>("[data-converter-colour-net]")!;
  const noteInput = root.querySelector<HTMLInputElement>("[data-note-input]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const setupOrientation = root.querySelector<HTMLElement>("[data-setup-orientation]")!;
  const setupCanonicalise = root.querySelector<HTMLButtonElement>("[data-setup-canonicalise]")!;
  const error = root.querySelector<HTMLElement>("[data-error]")!;
  const lowercaseControls = root.querySelector<HTMLElement>("[data-lowercase-controls]")!;
  const canvas = root.querySelector<HTMLCanvasElement>("[data-cube-canvas]")!;
  const motionOverlay = root.querySelector<HTMLCanvasElement>("[data-motion-overlay]")!;
  const previewHistory = root.querySelector<HTMLTextAreaElement>("[data-preview-history]")!;
  const previewHistoryCopy = root.querySelector<HTMLButtonElement>("[data-preview-history-copy]")!;
  const previewHistoryClear = root.querySelector<HTMLButtonElement>("[data-preview-history-clear]")!;
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
  const playbackGuide = root.querySelector<HTMLButtonElement>("[data-playback-guide]")!;
  const playbackRecord = root.querySelector<HTMLButtonElement>("[data-playback-record]")!;
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
  const acubeGeneratorInput = root.querySelector<HTMLTextAreaElement>("[data-acube-generator-input]")!;
  const acubeGeneratorSeed = root.querySelector<HTMLInputElement>("[data-acube-generator-seed]")!;
  const acubeGeneratorChoice = root.querySelector<HTMLSelectElement>("[data-acube-generator-choice]")!;
  const acubeGeneratorRun = root.querySelector<HTMLButtonElement>("[data-acube-generator-run]")!;
  const acubeGeneratorNext = root.querySelector<HTMLButtonElement>("[data-acube-generator-next]")!;
  const acubeGeneratorResult = root.querySelector<HTMLOutputElement>("[data-acube-generator-result]")!;
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
  const twoByTwoDrillCase = root.querySelector<HTMLSelectElement>("[data-two-by-two-drill-case]")!;
  const twoByTwoLoadDrill = root.querySelector<HTMLButtonElement>("[data-two-by-two-load-drill]")!;
  const twoByTwoPetrusDrillCase = root.querySelector<HTMLSelectElement>("[data-two-by-two-petrus-drill-case]")!;
  const twoByTwoPetrusLoadDrill = root.querySelector<HTMLButtonElement>("[data-two-by-two-petrus-load-drill]")!;
  const academyDrillFamily = root.querySelector<HTMLSelectElement>("[data-academy-drill-family]")!;
  const academyLoadDrill = root.querySelector<HTMLButtonElement>("[data-academy-load-drill]")!;
  const academyRandomDrill = root.querySelector<HTMLButtonElement>("[data-academy-random-drill]")!;
  const academySharedActions = root.querySelectorAll<HTMLElement>(".academy-shared-action");
  const twoPhaseSolve = root.querySelector<HTMLButtonElement>("[data-two-phase-solve]")!;
  const twoPhaseApply = root.querySelector<HTMLButtonElement>("[data-two-phase-apply]")!;
  const twoPhaseResult = root.querySelector<HTMLOutputElement>("[data-two-phase-result]")!;
  const twoPhaseTarget = root.querySelector<HTMLInputElement>("[data-two-phase-target]")!;
  const optimal2x2Row = root.querySelector<HTMLElement>("[data-optimal-2x2-row]")!;
  const optimal2x2Solve = root.querySelector<HTMLButtonElement>("[data-optimal-2x2-solve]")!;
  const optimal2x2Apply = root.querySelector<HTMLButtonElement>("[data-optimal-2x2-apply]")!;
  const optimal2x2Result = root.querySelector<HTMLOutputElement>("[data-optimal-2x2-result]")!;
  const reduction4x4Row = root.querySelector<HTMLElement>("[data-reduction-4x4-row]")!;
  const reduction4x4Solve = root.querySelector<HTMLButtonElement>("[data-reduction-4x4-solve]")!;
  const reduction4x4Apply = root.querySelector<HTMLButtonElement>("[data-reduction-4x4-apply]")!;
  const reduction4x4Result = root.querySelector<HTMLOutputElement>("[data-reduction-4x4-result]")!;
  const academyTarget = root.querySelector<HTMLInputElement>("[data-academy-target]")!;
  const academyTargetControl = academyTarget.closest<HTMLElement>(".academy-target-input");
  const academyDom = (prefix: string) => ({
    status: root.querySelector<HTMLElement>(`[data-${prefix}-status]`)!,
    current: root.querySelector<HTMLElement>(`[data-${prefix}-current]`)!,
    phases: root.querySelector<HTMLElement>(`[data-${prefix}-phases]`)!,
    copy: root.querySelector<HTMLButtonElement>(`[data-${prefix}-copy]`)!,
    solution: root.querySelector<HTMLElement>(`[data-${prefix}-solution]`)!,
  });
  const academyComparison = root.querySelector<HTMLElement>("[data-academy-comparison]")!;
  const reduction4x4Academy: ReductionAcademyElements = {
    status: root.querySelector<HTMLElement>("[data-reduction-4x4-academy-status]")!,
    current: root.querySelector<HTMLElement>("[data-reduction-4x4-academy-current]")!,
    phases: root.querySelector<HTMLElement>("[data-reduction-4x4-academy-phases]")!,
    guide: root.querySelector<HTMLElement>("[data-reduction-4x4-academy-guide]")!,
    applyCentre: root.querySelector<HTMLButtonElement>("[data-reduction-4x4-academy-apply-centre]")!,
    applyGuide: root.querySelector<HTMLButtonElement>("[data-reduction-4x4-academy-apply-guide]")!,
    repairParity: root.querySelector<HTMLButtonElement>("[data-reduction-4x4-academy-repair-parity]")!,
    finish: root.querySelector<HTMLButtonElement>("[data-reduction-4x4-academy-finish]")!,
  };
  const reduction5x5Academy = {
    status: root.querySelector<HTMLElement>("[data-reduction-5x5-academy-status]")!,
    current: root.querySelector<HTMLElement>("[data-reduction-5x5-academy-current]")!,
    phases: root.querySelector<HTMLElement>("[data-reduction-5x5-academy-phases]")!,
    guide: root.querySelector<HTMLElement>("[data-reduction-5x5-academy-guide]")!,
    findBar: root.querySelector<HTMLButtonElement>("[data-reduction-5x5-academy-find-bar]")!,
    findCycle: root.querySelector<HTMLButtonElement>("[data-reduction-5x5-academy-find-cycle]")!,
    findL2E: root.querySelector<HTMLButtonElement>("[data-reduction-5x5-academy-find-l2e]")!,
    repairParity: root.querySelector<HTMLButtonElement>("[data-reduction-5x5-academy-repair-parity]")!,
    applyCentre: root.querySelector<HTMLButtonElement>("[data-reduction-5x5-academy-apply-centre]")!,
    applyWing: root.querySelector<HTMLButtonElement>("[data-reduction-5x5-academy-apply-wing]")!,
  };
  const petrus5x5Academy = {
    status: root.querySelector<HTMLElement>("[data-petrus-5x5-academy-status]")!,
    current: root.querySelector<HTMLElement>("[data-petrus-5x5-academy-current]")!,
    phases: root.querySelector<HTMLElement>("[data-petrus-5x5-academy-phases]")!,
    guide: root.querySelector<HTMLElement>("[data-petrus-5x5-academy-guide]")!,
    step: root.querySelector<HTMLButtonElement>("[data-petrus-5x5-academy-step]")!,
  };
  const autoOrbitButton = root.querySelector<HTMLButtonElement>("[data-auto-orbit]")!;
  const turnGuidesButton = root.querySelector<HTMLButtonElement>("[data-turn-guides]")!;
  const settingsOpen = root.querySelector<HTMLButtonElement>("[data-settings-open]")!;
  const settingsDialog = root.querySelector<HTMLDialogElement>("[data-settings-dialog]")!;
  const settingsClose = root.querySelector<HTMLButtonElement>("[data-settings-close]")!;
  const settingsAutoOrbit = root.querySelector<HTMLButtonElement>("[data-settings-auto-orbit]")!;
  const settingsSize = root.querySelector<HTMLSelectElement>("[data-settings-size]")!;
  const settingsScheme = root.querySelector<HTMLSelectElement>("[data-settings-scheme]")!;
  const settingsDialect = root.querySelector<HTMLSelectElement>("[data-settings-dialect]")!;
  const settingsTnoodleUrl = root.querySelector<HTMLInputElement>("[data-settings-tnoodle-url]")!;
  const settingsTnoodleEnabled = root.querySelector<HTMLButtonElement>("[data-settings-tnoodle-enabled]")!;
  const settingsTnoodleEvent = root.querySelector<HTMLSelectElement>("[data-settings-tnoodle-event]")!;
  const settingsTnoodleStatus = root.querySelector<HTMLElement>("[data-settings-tnoodle-status]")!;
  const settingsTnoodleTest = root.querySelector<HTMLButtonElement>("[data-settings-tnoodle-test]")!;
  const practice2x2Difficulty = root.querySelector<HTMLElement>("[data-practice-2x2-difficulty]")!;
  const practice2x2DifficultySelect = root.querySelector<HTMLSelectElement>("[data-practice-2x2-difficulty-select]")!;
  const settingsInspectionSeconds = root.querySelector<HTMLInputElement>(
    "[data-settings-inspection-seconds]",
  )!;
  const coachingControls = root.querySelector<HTMLElement>("[data-coaching-controls]")!;
  const coachStatus = root.querySelector<HTMLElement>("[data-coach-status]")!;
  const smartCubeConnect = root.querySelector<HTMLButtonElement>("[data-smart-cube-connect]")!;
  const smartCubeDock = root.querySelector<HTMLElement>("[data-smart-cube-dock]")!;
  const smartCubeStatus = root.querySelector<HTMLElement>("[data-smart-cube-status]")!;
  const smartCubeBattery = root.querySelector<HTMLElement>("[data-smart-cube-battery]")!;
  const smartCubeRecordCapability = root.querySelector<HTMLElement>("[data-smart-cube-record-capability]")!;
  const smartCubeMistakes = root.querySelector<HTMLElement>("[data-smart-cube-mistakes]")!;
  const smartCubeReroute = root.querySelector<HTMLButtonElement>("[data-smart-cube-reroute]")!;
  const smartCubeSound = root.querySelector<HTMLButtonElement>("[data-smart-cube-sound]")!;
  const smartCubeSync = root.querySelector<HTMLButtonElement>("[data-smart-cube-sync]")!;
  const smartCubeResetState = root.querySelector<HTMLButtonElement>("[data-smart-cube-reset-state]")!;
  const smartCubeOrientation = root.querySelector<HTMLButtonElement>("[data-smart-cube-orientation]")!;
  const smartCubeRecenter = root.querySelector<HTMLButtonElement>("[data-smart-cube-recenter]")!;
  const smartCubeDiagnostics = root.querySelector<HTMLButtonElement>("[data-smart-cube-diagnostics]")!;
  const smartCubeCopyTrace = root.querySelector<HTMLButtonElement>("[data-smart-cube-copy-trace]")!;
  const smartCubeController = root.querySelector<HTMLButtonElement>("[data-smart-cube-controller]")!;
  const smartCubeDisconnect = root.querySelector<HTMLButtonElement>("[data-smart-cube-disconnect]")!;
  const smartCubeCapture = root.querySelector<HTMLButtonElement>("[data-smart-cube-capture]")!;
  const smartCubeReplayControls = root.querySelector<HTMLElement>("[data-smart-cube-replay-controls]")!;
  const smartCubeReplayPlay = root.querySelector<HTMLButtonElement>("[data-smart-cube-replay-play]")!;
  const smartCubeReplayStep = root.querySelector<HTMLButtonElement>("[data-smart-cube-replay-step]")!;
  const smartCubeReplaySeek = root.querySelector<HTMLInputElement>("[data-smart-cube-replay-seek]")!;
  const smartCubeReplayPosition = root.querySelector<HTMLOutputElement>("[data-smart-cube-replay-position]")!;
  const smartCubeReplayRate = root.querySelector<HTMLSelectElement>("[data-smart-cube-replay-rate]")!;
  const smartCubeQaSession = root.querySelector<HTMLElement>("[data-smart-cube-qa-session]")!;
  const smartCubeQaPanel = root.querySelector<HTMLElement>("[data-smart-cube-qa-panel]")!;
  const smartCubeQaLog = root.querySelector<HTMLElement>("[data-smart-cube-qa-log]")!;
  const smartCubeQaDiffValue = root.querySelector<HTMLElement>("[data-smart-cube-qa-diff-value]")!;
  const smartCubeChooseSession = root.querySelector<HTMLButtonElement>("[data-smart-cube-choose-session]")!;
  const smartCubeTapePicker = root.querySelector<HTMLDialogElement>("[data-smart-cube-tape-picker]")!;
  const smartCubeTapePickerList = root.querySelector<HTMLElement>("[data-smart-cube-tape-picker-list]")!;
  const smartCubeImportSession = root.querySelector<HTMLButtonElement>("[data-smart-cube-import-session]")!;
  const smartCubeImportSessionFile = root.querySelector<HTMLInputElement>("[data-smart-cube-import-session-file]")!;
  const timerCover = root.querySelector<HTMLButtonElement>("[data-timer-cover]")!;
  const timerHud = root.querySelector<HTMLElement>("[data-timer-hud]")!;
  const timerHudPhase = root.querySelector<HTMLElement>("[data-timer-hud-phase]")!;
  const timerHudTime = root.querySelector<HTMLElement>("[data-timer-hud-time]")!;
  const timerHudStatus = root.querySelector<HTMLElement>("[data-timer-hud-status]")!;
  const timerHudStats = root.querySelector<HTMLElement>("[data-timer-hud-stats]")!;
  const initialState = readLocation(window.location);
  const store = createStore(initialState);
  // Local-device preferences (playback speed and reserved TNoodle/inspection
  // fields) never enter AppState/the URL hash. Auto-orbit is intentionally
  // shareable workspace state, so a link reproduces that presentation choice.
  let preferences = readPreferences(window.localStorage);
  const persistPreferences = (changes: Partial<typeof preferences>) => {
    preferences = {...preferences, ...changes};
    writePreferences(window.localStorage, preferences);
    window.dispatchEvent(new Event("cubelab:preferences-changed"));
  };
  let size = initialState.size;
  let lowercaseMode: LowercaseMode = initialState.lowercaseMode;
  let notationDialect: NotationDialect = initialState.notationDialect;
  let cubeStyle: CubeStyle = initialState.cubeStyle;
  let turnGuides = initialState.turnGuides;
  let autoOrbit = initialState.autoOrbit;
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
  let manualStateDraft: ManualStateDraft = emptyManualState(2);
  let manualStateColour: ManualStateFace | null = "U";
  let manualStateShiftPressed = false;
  const manualStateExplicitIndices = new Set<number>();
  const manualStateAutoIndices = new Set<number>();
  let manualStateHoverIndex: number | null = null;
  // The keyboard target is a real, persistent cursor rather than whichever
  // button happened to retain browser focus after using the palette or view
  // controls. It makes keyboard painting predictable in every representation.
  let manualStateCursorIndex: number | null = null;
  let manualStateRepresentation: ManualStateRepresentation = "attached";
  let manualStateOrientation: 0 | 1 | 2 | 3 = 0;
  let manualStateIsRotating = false;
  let manualStateDotGeneration = 0;
  const manualStateDraftSignal = signal(manualStateDraft);
  const manualStateHoverSignal = signal<number | null>(manualStateHoverIndex);
  const manualStateCursorSignal = signal<number | null>(manualStateCursorIndex);
  const manualStateGenerationSignal = signal(manualStateDotGeneration);
  const manualStateComplete = computed([manualStateDraftSignal], () =>
    manualStateDraftSignal.get().every((face) => face !== null),
  );
  const setManualStateDraft = (draft: ManualStateDraft) => {
    manualStateDraft = draft;
    manualStateDraftSignal.set(draft);
  };
  const touchManualStateDraft = () => manualStateDraftSignal.set([...manualStateDraft]);
  const setManualStateHoverIndex = (index: number | null) => {
    manualStateHoverIndex = index;
    manualStateHoverSignal.set(index);
  };
  const setManualStateCursorIndex = (index: number | null) => {
    manualStateCursorIndex = index;
    manualStateCursorSignal.set(index);
  };
  let manualStateDirtyDots: Set<number> | null = null;
  const manualStateUnverifiedDots = new Set<number>();
  const manualStateDeadIndices = new Set<number>();
  type ManualStateSnapshot = {
    draft: ManualStateDraft;
    explicitIndices: number[];
    autoIndices: number[];
    deadIndices: number[];
  };
  type ManualStateAction = {
    before: ManualStateSnapshot;
    after: ManualStateSnapshot;
  };
  const manualStateUndoStack: ManualStateAction[] = [];
  const manualStateRedoStack: ManualStateAction[] = [];
  let updateManualStateSmartCubeControl = () => {};
  let importManualStateSmartCube = (_state: CubeState) => {};
  let updateManualStateMetrics: (manualSize: ManualStateSize) => void = () => {};
  let renderManualStatePaletteLabels = () => {};
  // Built once per manual-state size and reused across renders: recreating
  // every sticker button on every single paint or erase click would force a
  // full style/layout recompute and flicker.
  let manualStateBuiltSize: ManualStateSize | null = null;
  let manualStateArrangedFrame = "";
  const manualStateStickerElements: HTMLButtonElement[] = [];
  const manualStateFaceElements = new Map<ManualStateFace, HTMLElement>();
  let manualStateDualCopies: HTMLElement[] = [];
  let manualStateDualObservers: MutationObserver[] = [];
  let tutorialPhases: TutorialPhaseRange[] = [];
  let activeAcademy: AcademyElements | null = null;
  let commentedTutorialSolution = "";
  let academySolveBusy = false;
  let academyWcaDrillEnabled = false;
  const academyRequestGuard = createAcademyRequestGuard();
  const savedTutorialSolutions = new Map<TutorialMethod, SavedTutorialSolution>();
  const twoByTwoBeginnerAcademy: AcademyElements = {
    method: "twoByTwoBeginner",
    label: "2×2 Beginner / Ortega",
    phaseCount: 3,
    ...academyDom("two-by-two-beginner"),
  };
  const twoByTwoPetrusAcademy: AcademyElements = {
    method: "twoByTwoPetrus",
    label: "2×2 Petrus-inspired",
    phaseCount: 3,
    ...academyDom("two-by-two-petrus"),
  };
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
    twoByTwoBeginnerAcademy,
    twoByTwoPetrusAcademy,
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
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
  );
  const twoByTwoAcademySolverClient = createTwoByTwoAcademySolverClient<CubeState, TutorialSolution>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
  );
  const twoByTwoPetrusSolverClient = createTwoByTwoPetrusSolverClient<CubeState, TutorialSolution>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
  );
  const manualStateVerifier = createManualStateVerifierClient(
    createLazyWorker(() => new Worker(new URL("./workers/manual-state.worker.ts", import.meta.url), {type: "module"})),
  );
  let twoPhaseSolveBusy = false;
  let optimal2x2SolveBusy = false;
  let reduction4x4SolveBusy = false;
  let reduction5x5CycleBusy = false;
  let reduction5x5CycleRequest = 0;
  let reduction5x5CycleGuide: any = null;
  let reduction5x5CycleKey = "";
  let reduction5x5ImmediateGuide: any = null;
  let reduction5x5ImmediateGuideKey = "";
  let reduction5x5BarBusy = false;
  let reduction5x5BarRequest = 0;
  let reduction5x5BarGuide: any = null;
  let reduction5x5BarKey = "";
  let reduction5x5L2EBusy = false;
  let reduction5x5L2ERequest = 0;
  let reduction5x5L2EGuide: any = null;
  let reduction5x5L2EKey = "";
  let optimal2x2Request = 0;
  let reduction4x4Request = 0;
  let nissSide: "normal" | "inverse" = "normal";
  let nissNormalState: CubeState | null = null;
  let nissInverseState: CubeState | null = null;
  let twoPhaseRequest = 0;
  let twoPhaseAlgorithm = "";
  let twoPhaseBestMoveCount: number | null = null;
  let twoPhaseSourceKey = "";
  let twoPhasePendingState: CubeState | null = null;
  let twoPhasePendingTarget: CubeState | null = null;
  let optimal2x2Algorithm = "";
  let optimal2x2SourceKey = "";
  let reduction4x4Algorithm = "";
  let reduction4x4SourceKey = "";
  let academySetupKey: string | null = null;
  const newTwoPhaseSolverClient = () => createTwoPhaseSolverClient<CubeState, TwoPhaseSolution>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
    (stage) => {
      if (twoPhaseSolveBusy) {
        twoPhaseResult.textContent = twoPhaseBestMoveCount === null
          ? stage
          : `Best so far: ${twoPhaseBestMoveCount} HTM · ${twoPhaseAlgorithm} · ${stage}`;
      }
    },
    (solution) => {
      if (
        !twoPhaseSolveBusy
        || twoPhasePendingState === null
        || twoPhasePendingTarget === null
        || twoPhaseSourceKeyForCurrent() !== twoPhaseSourceKey
      ) return;
      const replay = MoveExecutor.applyAlg(twoPhasePendingState, solution.alg) as Result<CubeState, unknown>;
      if (replay.TAG !== "Ok"
        || FaceletCodec.render(replay._0) !== FaceletCodec.render(twoPhasePendingTarget)) return;
      twoPhaseAlgorithm = MoveTransform.serialize(solution.alg) as string;
      twoPhaseBestMoveCount = solution.moveCount;
      twoPhaseApply.disabled = twoPhaseAlgorithm === "";
      twoPhaseResult.textContent = `Best so far: ${solution.moveCount} HTM · ${twoPhaseAlgorithm}`;
      twoPhaseResult.classList.remove("success", "failure");
    },
  );
  let twoPhaseSolverClient = newTwoPhaseSolverClient();
  const newOptimal2x2SolverClient = () => createOptimal2x2SolverClient<CubeState, {alg: unknown; moveCount: number}>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
    (stage) => {
      if (optimal2x2SolveBusy) optimal2x2Result.textContent = stage;
    },
  );
  let optimal2x2SolverClient = newOptimal2x2SolverClient();
  const random2x2ScrambleClient = createRandom2x2ScrambleClient<{alg: unknown; state: CubeState; coordinate: number; moveCount: number}>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
  );
  const newReduction4x4SolverClient = () => createReduction4x4SolverClient<CubeState, {alg: unknown; stm: number; obtm: number}>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
    (stage) => {
      if (reduction4x4SolveBusy) reduction4x4Result.textContent = stage;
    },
  );
  let reduction4x4SolverClient = newReduction4x4SolverClient();
  const newReduction5x5CycleClient = () => createReduction5x5CycleSolverClient<CubeState, any>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
    (stage) => { if (reduction5x5CycleBusy) reduction5x5Academy.guide.textContent = stage; },
  );
  let reduction5x5CycleClient = newReduction5x5CycleClient();
  const newReduction5x5BarClient = () => createReduction5x5BarSolverClient<CubeState, any>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
    (stage) => { if (reduction5x5BarBusy) reduction5x5Academy.guide.textContent = stage; },
  );
  let reduction5x5BarClient = newReduction5x5BarClient();
  const newReduction5x5L2EClient = () => createReduction5x5L2ESolverClient<CubeState, any>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
    (stage) => { if (reduction5x5L2EBusy) reduction5x5Academy.guide.textContent = stage; },
  );
  let reduction5x5L2EClient = newReduction5x5L2EClient();
  const newReductionGuideClient = () => createReductionGuideClient<CubeState, any>(
    createLazyWorker(() => new Worker(new URL("./workers/solver.worker.ts", import.meta.url), {type: "module"})),
  );
  let reductionGuideClient = newReductionGuideClient();
  const reductionGuideCache = createAcademyGuideCache<any>(
    () => {
      if (academySetupSourceKey() !== academySetupKey) return;
      renderReduction4x4Academy(activeRecognized);
      renderReduction5x5Academy(activeRecognized);
    },
    () => {
      reductionGuideClient.terminate();
      reductionGuideClient = newReductionGuideClient();
    },
    (error) => ({TAG: "Error", _0: {message: error instanceof Error ? error.message : "Guide search failed."}}),
  );
  const reductionGuideKey = (state: CubeState, kind: "centre" | "wing") =>
    `${size}:${kind}:${FaceletCodec.render(state)}`;
  const reductionGuide = (state: CubeState, kind: "centre" | "wing") =>
    reductionGuideCache.get(reductionGuideKey(state, kind), () =>
      reductionGuideClient.solve({size: size as 4 | 5, kind, state}),
    ) ?? {TAG: "Pending", _0: {message: "Finding the next replay-verified guide…"}};
  const clearHiddenReductionGuide = () => {
    if (activeTab !== "academy" || !(
      size === 4 && academyMethod === "reduction4x4"
      || size === 5 && academyMethod === "reduction5x5"
    )) reductionGuideCache.clear();
  };
  const resetTwoPhaseRefinement = () => {
    // Setup defines every solver request. A Setup change makes any in-flight
    // search and its retained candidate unusable, so stop the dedicated worker
    // rather than leaving an obsolete refinement to consume CPU.
    if (twoPhaseSolveBusy) {
      twoPhaseRequest += 1;
      twoPhaseSolverClient.terminate();
      twoPhaseSolverClient = newTwoPhaseSolverClient();
      twoPhaseSolveBusy = false;
    }
    twoPhaseAlgorithm = "";
    twoPhaseBestMoveCount = null;
    twoPhaseSourceKey = "";
    twoPhasePendingState = null;
    twoPhasePendingTarget = null;
    twoPhaseApply.disabled = true;
    twoPhaseSolve.textContent = "Find two-phase solution";
  };
  const resetOptimal2x2Solution = () => {
    if (optimal2x2SolveBusy) {
      optimal2x2Request += 1;
      optimal2x2SolverClient.terminate();
      optimal2x2SolverClient = newOptimal2x2SolverClient();
      optimal2x2SolveBusy = false;
    }
    optimal2x2Algorithm = "";
    optimal2x2SourceKey = "";
    optimal2x2Apply.disabled = true;
    optimal2x2Solve.textContent = "Find optimal solution";
    optimal2x2Result.textContent = "Find an HTM-optimal solution for the Setup state.";
    optimal2x2Result.classList.remove("success", "failure");
  };
  const resetReduction4x4Solution = () => {
    if (reduction4x4SolveBusy) {
      reduction4x4Request += 1;
      reduction4x4SolverClient.terminate();
      reduction4x4SolverClient = newReduction4x4SolverClient();
      reduction4x4SolveBusy = false;
    }
    reduction4x4Algorithm = "";
    reduction4x4SourceKey = "";
    reduction4x4Apply.disabled = true;
    reduction4x4Solve.textContent = "Finish reduced state";
    reduction4x4Result.textContent = "Requires completed centres and paired wings; then solves the reduced 3×3 state.";
    reduction4x4Result.classList.remove("success", "failure");
  };
  const viewport = createCubeViewport(canvas, motionOverlay, (message) => {
    viewportFallback.textContent = `${message} Text conversions remain fully functional.`;
    viewportFallback.hidden = false;
  });
  if (!viewport) {
    autoOrbitButton.disabled = true;
    settingsAutoOrbit.disabled = true;
  }
  // Auto-orbit has two live controls (the contextual viewport button and its
  // mirror in Settings). Automatic camera/gyro overrides never mutate the
  // shareable preference; only an explicit user toggle patches AppState.
  const setAutoOrbitEnabled = (enabled: boolean, share = true) => {
    autoOrbitButton.setAttribute("aria-pressed", String(enabled));
    autoOrbitButton.classList.toggle("active", enabled);
    settingsAutoOrbit.setAttribute("aria-pressed", String(enabled));
    settingsAutoOrbit.classList.toggle("active", enabled);
    settingsAutoOrbit.textContent = enabled ? "On" : "Off";
    viewport?.setAutoOrbit(enabled);
    if (share) store.patch({autoOrbit: enabled});
  };
  setAutoOrbitEnabled(initialState.autoOrbit, false);
  const setPlayerMode = (enabled: boolean, pushHistory = true) => {
    if (playerMode === enabled) return;
    playerMode = enabled;
    renderPlayerPresentation();
    if (pushHistory) {
      const state = store.get();
      const path = enabled ? "/player" : pathForTab(state.activeTab);
      // /player has no workspace pathname, so retain #tab there; returning to
      // a workspace removes that redundant tab while preserving all state.
      const hash = enabled ? writeHash(state) : hashForPath(state, path);
      window.history.pushState(null, "", `${pathWithDeploymentBase(path)}${hash}`);
    }
    viewport?.refresh();
  };
  window.addEventListener("popstate", () => {
    setPlayerMode(pathWithoutDeploymentBase(window.location.pathname) === "/player", false);
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

  const updatePreviewHistoryUi = () => {
    const hasHistory = previewHistory.value.trim() !== "";
    previewHistoryCopy.disabled = !hasHistory;
    previewHistoryClear.disabled = !hasHistory;
  };

  const appendPreviewHistoryToken = (token: string) => {
    previewHistory.value = appendRecordedMove(previewHistory.value, token);
    updatePreviewHistoryUi();
  };
  const removeTrailingPreviewHistoryTokens = (tokens: readonly string[]) => {
    const history = previewHistory.value.trim().split(/\s+/).filter(Boolean);
    if (
      tokens.length === 0
      || history.length < tokens.length
      || !tokens.every((token, index) => history[history.length - tokens.length + index] === token)
    ) return false;
    previewHistory.value = history.slice(0, -tokens.length).join(" ");
    updatePreviewHistoryUi();
    return true;
  };
  updatePreviewHistoryUi();
  previewHistory.addEventListener("input", updatePreviewHistoryUi);
  previewHistoryCopy.addEventListener("click", async () => {
    if (!(await copyText(previewHistory.value.trim()))) return;
    previewHistoryCopy.textContent = "Copied";
    window.setTimeout(() => { previewHistoryCopy.textContent = "Copy history"; }, 1_000);
  });
  previewHistoryClear.addEventListener("click", () => {
    previewHistory.value = "";
    updatePreviewHistoryUi();
    previewHistory.focus();
  });

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
    if (state.size === 4) return validate4x4(state);
    if (state.size !== 2 && state.size !== 3) return null;
    const pieces = PieceReducer.reduce(state) as Result<PieceState, unknown>;
    return pieces.TAG === "Ok" ? null : PieceReducer.describeError(pieces._0);
  };

  const manualStateFaceName: Record<ManualStateFace, string> = {
    U: "Up", R: "Right", F: "Front", D: "Down", L: "Left", B: "Back",
  };
  const manualStateColourName: Record<ManualStateFace, string> = {
    U: "White", R: "Red", F: "Green", D: "Yellow", L: "Orange", B: "Blue",
  };

  const renderManualStateFrame = (manualSize: ManualStateSize) => {
    const frame = manualStateFrameStatus(manualSize, manualStateDraft);
    manualStateFrame.hidden = frame === null;
    if (frame === null) {
      delete manualStateFrame.dataset.canonical;
      manualStateFrame.textContent = "";
      return;
    }
    manualStateFrame.dataset.canonical = String(frame.canonical);
    const label = frame.canonical ? "✓ Canonical frame" : "⟳ Rotated frame";
    manualStateFrame.textContent = `${label} · U: ${manualStateColourName[frame.up]} · F: ${manualStateColourName[frame.front]}`;
  };

  const manualStateCompactFacelets = (): string => manualStateDraft.join("");

  const manualStateSpacedFacelets = (manualSize: ManualStateSize): string => {
    const perFace = manualSize * manualSize;
    return faceletOrder
      .map((_, faceIndex) => manualStateDraft.slice(faceIndex * perFace, (faceIndex + 1) * perFace).join(""))
      .join(" ");
  };

  const toSpacedFacelets = (rawFacelets: string, cubeSize: number = size): string => {
    const perFace = cubeSize * cubeSize;
    const clean = rawFacelets.replace(/\s+/g, "");
    const blocks: string[] = [];
    for (let i = 0; i < clean.length; i += perFace) {
      blocks.push(clean.slice(i, i + perFace));
    }
    return blocks.join(" ");
  };

  const manualStateSingmasterCycles = (manualSize: ManualStateSize): string => {
    const parsed = FaceletCodec.parse(manualSize, manualStateDraft.join("")) as Result<CubeState>;
    if (parsed.TAG === "Error") return "";
    const rendered = renderSingmasterCycleState(parsed._0);
    return rendered.TAG === "Ok" ? rendered._0 : "";
  };

  const manualStateCompleteDiagnostic = (): string | null => {
    const manualSize = size as ManualStateSize;
    if (manualStateDraft.some((face) => face === null)) return "Complete every sticker first.";
    if (!canCompleteManualState(manualSize, manualStateDraft)) return "The entered stickers do not form a physically valid cube state.";
    const parsed = FaceletCodec.parse(manualSize, manualStateDraft.join("")) as Result<CubeState>;
    if (parsed.TAG === "Error") return describeError(parsed._0);
    return validatePhysicalState(parsed._0);
  };

  /** Rebuild the visible draft from user-entered stickers, never stale auto-fill. */
  const manualStateSourceDraft = (manualSize: ManualStateSize): ManualStateDraft => {
    const source = emptyManualState(manualSize);
    manualStateExplicitIndices.forEach((index) => {
      source[index] = manualStateDraft[index];
    });
    return source;
  };

  const refreshManualStateAutoFill = (
    manualSize: ManualStateSize,
    fill: boolean,
    previousDraft?: ManualStateDraft,
  ) => {
    const before = previousDraft ?? [...manualStateDraft];
    const source = manualStateSourceDraft(manualSize);
    manualStateAutoIndices.clear();
    manualStateDirtyDots = null;
    if (!fill) {
      setManualStateDraft(source);
      return;
    }
    // Big cubes use the same cheap local propagation as their dots; the full
    // reachability predicate still gates every candidate it writes.
    const propagated = manualSize >= 4
      ? fillLocallyForcedManualStateColours(manualSize, source)
      : fillForcedManualStateColours(manualSize, source);
    setManualStateDraft(fillForcedManualStateCoreCentres(manualSize, propagated));
    manualStateDraft.forEach((colour, index) => {
      if (source[index] === null && colour !== null) manualStateAutoIndices.add(index);
    });
    const dirty = manualStateDirtyDots ?? new Set<number>();
    const beforeCounts = before.filter((colour): colour is ManualStateFace => colour !== null);
    const afterCounts = manualStateDraft.filter((colour): colour is ManualStateFace => colour !== null);
    const quotaChanged = manualStateFaces.some((face) =>
      (beforeCounts.filter((colour) => colour === face).length === manualSize * manualSize)
      !== (afterCounts.filter((colour) => colour === face).length === manualSize * manualSize),
    );
    const touchedColours = new Set<ManualStateFace>();
    manualStateDraft.forEach((colour, index) => {
      if (before[index] === colour) return;
      if (before[index]) touchedColours.add(before[index]!);
      if (colour) touchedColours.add(colour);
      manualStateLocalConstraintIndices(manualSize, index).forEach((affected) => dirty.add(affected));
    });
    if (quotaChanged) {
      manualStateDraft.forEach((colour, index) => { if (colour === null) dirty.add(index); });
    } else {
      touchedColours.forEach((col) => dirtyManualStateOrbitsForScarcity(manualSize, manualStateDraft, col, dirty, before));
    }
    manualStateDirtyDots = dirty;
  };

  const dirtyManualStateOrbitsForScarcity = (
    manualSize: ManualStateSize,
    draft: ManualStateDraft,
    colour: ManualStateFace,
    target: Set<number>,
    beforeDraft?: ManualStateDraft,
  ) => {
    manualStateOrbits(manualSize).forEach((orbit) => {
      const sample = orbit.slots[0][0];
      const allowed = isManualStateColourAllowedByScarcity(manualSize, draft, sample, colour);
      if (!allowed || (beforeDraft && isManualStateColourAllowedByScarcity(manualSize, beforeDraft, sample, colour) !== allowed)) {
        orbit.slots.forEach((slot) => slot.forEach((idx) => { if (draft[idx] === null) target.add(idx); }));
      }
    });
  };

  const captureManualStateSnapshot = (): ManualStateSnapshot => ({
    draft: [...manualStateDraft],
    explicitIndices: [...manualStateExplicitIndices].sort((a, b) => a - b),
    autoIndices: [...manualStateAutoIndices].sort((a, b) => a - b),
    deadIndices: [...manualStateDeadIndices].sort((a, b) => a - b),
  });

  const manualStateSnapshotsEqual = (left: ManualStateSnapshot, right: ManualStateSnapshot): boolean =>
    left.draft.length === right.draft.length
    && left.draft.every((value, index) => value === right.draft[index])
    && left.explicitIndices.length === right.explicitIndices.length
    && left.explicitIndices.every((value, index) => value === right.explicitIndices[index])
    && left.autoIndices.length === right.autoIndices.length
    && left.autoIndices.every((value, index) => value === right.autoIndices[index])
    && left.deadIndices.length === right.deadIndices.length
    && left.deadIndices.every((value, index) => value === right.deadIndices[index]);

  const syncManualStateHistoryControls = () => {
    manualStateUndo.disabled = manualStateUndoStack.length === 0;
    manualStateRedo.disabled = manualStateRedoStack.length === 0;
  };

  const clearManualStateHistory = () => {
    manualStateUndoStack.length = 0;
    manualStateRedoStack.length = 0;
    syncManualStateHistoryControls();
  };

  const commitManualStateAction = (before: ManualStateSnapshot) => {
    const after = captureManualStateSnapshot();
    if (manualStateSnapshotsEqual(before, after)) return;
    manualStateUndoStack.push({before, after});
    if (manualStateUndoStack.length > 100) manualStateUndoStack.shift();
    manualStateRedoStack.length = 0;
    syncManualStateHistoryControls();
  };

  const restoreManualStateSnapshot = (snapshot: ManualStateSnapshot) => {
    setManualStateDraft([...snapshot.draft]);
    manualStateExplicitIndices.clear();
    snapshot.explicitIndices.forEach((index) => manualStateExplicitIndices.add(index));
    manualStateAutoIndices.clear();
    snapshot.autoIndices.forEach((index) => manualStateAutoIndices.add(index));
    manualStateDeadIndices.clear();
    snapshot.deadIndices.forEach((index) => manualStateDeadIndices.add(index));
    manualStateUnverifiedDots.clear();
    manualStateDirtyDots = null;
    renderManualStateEditor();
  };

  const undoManualStateAction = () => {
    const action = manualStateUndoStack.pop();
    if (!action) return;
    manualStateRedoStack.push(action);
    restoreManualStateSnapshot(action.before);
    syncManualStateHistoryControls();
  };

  const redoManualStateAction = () => {
    const action = manualStateRedoStack.pop();
    if (!action) return;
    manualStateUndoStack.push(action);
    restoreManualStateSnapshot(action.after);
    syncManualStateHistoryControls();
  };

  // Shared by the flat net, both preview cubes, and the keyboard shortcut:
  // one place decides whether a sticker can take a colour and applies it.
  const eraseManualStateSticker = (index: number, recordAction = true) => {
    if (manualStateAutoIndices.has(index)) return;
    if (manualStateDraft[index] === null) return;
    const actionStart = recordAction ? captureManualStateSnapshot() : null;
    const manualSize = size as ManualStateSize;
    const before = [...manualStateDraft];
    manualStateDraft[index] = null;
    touchManualStateDraft();
    manualStateExplicitIndices.delete(index);
    manualStateAutoIndices.delete(index);
    manualStateDeadIndices.delete(index);
    const sticker = manualStateStickerElements[index];
    if (sticker) delete sticker.dataset.dead;
    refreshManualStateAutoFill(manualSize, true, before);
    renderManualStateEditor();
    if (actionStart) commitManualStateAction(actionStart);
  };

  const resetManualStateColour = (face: ManualStateFace) => {
    const actionStart = captureManualStateSnapshot();
    const manualSize = size as ManualStateSize;
    let changed = false;
    for (let index = 0; index < manualStateDraft.length; index += 1) {
      if (manualStateDraft[index] === face) {
        manualStateDraft[index] = null;
        manualStateExplicitIndices.delete(index);
        manualStateAutoIndices.delete(index);
        manualStateDeadIndices.delete(index);
        const sticker = manualStateStickerElements[index];
        if (sticker) delete sticker.dataset.dead;
        changed = true;
      }
    }
    if (changed) {
      touchManualStateDraft();
      manualStateDirtyDots = null;
      refreshManualStateAutoFill(manualSize, true);
      renderManualStateEditor();
      commitManualStateAction(actionStart);
    }
  };

  const paintManualStateSticker = (index: number, colour: ManualStateFace, recordAction = true): boolean => {
    const manualSize = size as ManualStateSize;
    const source = manualStateSourceDraft(manualSize);
    source[index] = null;
    if (!allowedManualStateColours(manualSize, source, index).includes(colour)) {
      return false;
    }
    const actionStart = recordAction ? captureManualStateSnapshot() : null;
    const before = [...manualStateDraft];
    manualStateDraft[index] = colour;
    touchManualStateDraft();
    manualStateExplicitIndices.add(index);
    manualStateAutoIndices.delete(index);
    manualStateDeadIndices.delete(index);
    const sticker = manualStateStickerElements[index];
    if (sticker) delete sticker.dataset.dead;
    refreshManualStateAutoFill(manualSize, true, before);
    renderManualStateEditor();
    if (actionStart) commitManualStateAction(actionStart);
    return true;
  };

  // An inferred sticker is already the only legal colour, so a plain click
  // confirms that colour instead of treating the tile as an immutable fill.
  // Going through the normal paint path records it in history and rebuilds
  // the remaining inferred draft from this newly explicit choice.
  const fixManualStateAutoSticker = (index: number, recordAction = true): boolean => {
    const colour = manualStateDraft[index];
    return manualStateAutoIndices.has(index) && colour !== null
      ? paintManualStateSticker(index, colour, recordAction)
      : false;
  };

  const renderManualStateDots = (element: HTMLElement, choices: ManualStateFace[]) => {
    element.replaceChildren();
    manualStateFaces.forEach((choice) => {
      const dot = document.createElement("i");
      dot.dataset.face = choice;
      dot.dataset.available = String(choices.includes(choice));
      element.append(dot);
    });
  };
  // High-order cubes paint cheap per-cubie candidates immediately, then
  // replace them with exact worker results. A 2×2/3×3 exact pass is small
  // enough to stay synchronous, so those pads never briefly advertise a
  // colour that violates piece uniqueness or permutation parity.
  let activeManualStateBatch: {cancel: () => void} | null = null;

  const verifyManualStateDots = (
    manualSize: ManualStateSize,
    pending: Array<{index: number; element: HTMLElement}>,
  ) => {
    activeManualStateBatch?.cancel();
    const generation = manualStateDotGeneration;
    const snapshot = [...manualStateDraft];
    const pendingIndices = pending.map((p) => p.index);

    activeManualStateBatch = manualStateVerifier.verifyBatch(
      manualSize,
      snapshot,
      pendingIndices,
      ({index, choices}) => {
        if (generation !== manualStateDotGeneration) return;
        const next = {index, element: manualStateStickerElements[index]?.querySelector<HTMLElement>(".manual-state-dots")};
        if (choices.length === 1 && manualStateDraft[next.index] === null) {
          const promotedColour = choices[0] as ManualStateFace;
          manualStateDraft[next.index] = promotedColour;
          snapshot[next.index] = promotedColour;
          touchManualStateDraft();
          manualStateAutoIndices.add(next.index);
          manualStateUnverifiedDots.delete(next.index);
          manualStateDeadIndices.delete(next.index);
          const sticker = manualStateStickerElements[next.index];
          if (sticker) {
            sticker.dataset.face = promotedColour;
            sticker.dataset.auto = "true";
            delete sticker.dataset.dead;
            sticker.textContent = "";
          }
          const quotaExhausted = manualStateDraft.filter((c) => c === promotedColour).length === manualSize * manualSize;
          const dirty = manualStateDirtyDots ?? new Set<number>();
          const affected = new Set(manualStateLocalConstraintIndices(manualSize, next.index));
          if (quotaExhausted) manualStateDraft.forEach((c, idx) => { if (c === null) affected.add(idx); });
          else dirtyManualStateOrbitsForScarcity(manualSize, manualStateDraft, promotedColour, affected);
          affected.forEach((idx) => {
            if (manualStateDraft[idx] !== null) return;
            dirty.add(idx);
            manualStateUnverifiedDots.add(idx);
            const dots = manualStateStickerElements[idx]?.querySelector<HTMLElement>(".manual-state-dots");
            if (dots) {
              renderManualStateDots(dots, locallyAllowedManualStateColours(manualSize, manualStateDraft, idx));
            }
          });
          manualStateDirtyDots = dirty;
          updateManualStateMetrics(manualSize);

          dotTrace.log({
            type: "promote",
            index: next.index,
            colour: promotedColour,
            generation,
          });
          return;
        }

        dotTrace.log({
          type: "verify",
          index: next.index,
          choices: choices as ManualStateFace[],
          generation,
        });

        // An empty exact result means this draft has no legal completion at
        // all: the paint gate accepted a sticker it should have refused.
        if (choices.length === 0) {
          manualStateDeadIndices.add(next.index);
          const sticker = manualStateStickerElements[next.index];
          if (sticker) sticker.dataset.dead = "true";
          dotTrace.deadTile(manualSize, snapshot, next.index, "verify");
          updateManualStateMetrics(manualSize);
        } else {
          manualStateDeadIndices.delete(next.index);
          const sticker = manualStateStickerElements[next.index];
          if (sticker) delete sticker.dataset.dead;
        }
        if (next.element) {
          renderManualStateDots(next.element, choices as ManualStateFace[]);
        }
        manualStateUnverifiedDots.delete(next.index);
      },
    );
  };

  const manualStateSummaryRow = (label: string, value: string, pct: number, colour: string): HTMLElement => {
    const row = document.createElement("div");
    row.className = "manual-state-summary-row";
    const labels = document.createElement("div");
    labels.className = "manual-state-summary-labels";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    const valueSpan = document.createElement("span");
    valueSpan.textContent = value;
    labels.append(labelSpan, valueSpan);
    const bar = document.createElement("div");
    bar.className = "manual-state-summary-bar";
    const fill = document.createElement("div");
    fill.className = "manual-state-summary-bar-fill";
    fill.style.width = `${pct}%`;
    fill.style.background = colour;
    bar.append(fill);
    row.append(labels, bar);
    return row;
  };

  const renderManualStateSummary = (
    manualSize: ManualStateSize,
    entered: number,
    total: number,
    perColourPlaced: Record<ManualStateFace, number>,
    completionDiagnostic: string | null,
  ) => {
    manualStateSummary.replaceChildren(
      manualStateSummaryRow("Entered", `${entered}/${total}`, (entered / total) * 100, "#63b3ff"),
    );
    if (manualSize <= 3) {
      const cornerSlots = manualStateCornerSlots(manualSize);
      const corners = cornerSlots.filter((slot) => slot.every((i) => manualStateDraft[i] !== null)).length;
      manualStateSummary.append(
        manualStateSummaryRow("Corners", `${corners}/${cornerSlots.length}`, (corners / cornerSlots.length) * 100, "#f0c419"),
      );
    }
    if (manualSize === 3) {
      const edgeSlots = manualStateEdgeSlots();
      const edges = edgeSlots.filter((slot) => slot.every((i) => manualStateDraft[i] !== null)).length;
      manualStateSummary.append(manualStateSummaryRow("Edges", `${edges}/12`, (edges / 12) * 100, "#f0c419"));
    }
    if (manualSize >= 4) {
      const labels = {corners: "Corners", centres: "Centres", wings: "Wings", midges: "Midges"} as const;
      const colours = {corners: "#f0c419", centres: "#4ade80", wings: "#fb923c", midges: "#a78bfa"} as const;
      largeManualStateProgress(manualSize, manualStateDraft).forEach((metric) => {
        manualStateSummary.append(manualStateSummaryRow(
          labels[metric.name],
          `${metric.completed}/${metric.total}`,
          metric.total === 0 ? 0 : (metric.completed / metric.total) * 100,
          colours[metric.name],
        ));
      });
    }
    const remaining = total - entered;
    // Keep the final 0-left row visible: stable summary geometry makes the
    // completion state easier to verify than a row disappearing at the end.
    const divider = document.createElement("div");
    divider.className = "manual-state-summary-divider";
    const remainingRow = document.createElement("div");
    remainingRow.className = "manual-state-summary-row";
    const remainingLabels = document.createElement("div");
    remainingLabels.className = "manual-state-summary-labels";
    const remainingLabel = document.createElement("span");
    remainingLabel.textContent = "Remaining";
    const remainingValue = document.createElement("span");
    remainingValue.textContent = `${remaining} left`;
    remainingLabels.append(remainingLabel, remainingValue);
    const remainingBar = document.createElement("div");
    remainingBar.className = "manual-state-summary-bar";
    const remainingFill = document.createElement("div");
    remainingFill.className = "manual-state-summary-remaining";
    remainingFill.style.width = `${(remaining / total) * 100}%`;
    manualStateFaces.forEach((face) => {
      const left = manualSize * manualSize - perColourPlaced[face];
      if (left <= 0) return;
      const segment = document.createElement("span");
      segment.style.flex = String(left);
      segment.dataset.face = face;
      remainingFill.append(segment);
    });
    remainingBar.append(remainingFill);
    remainingRow.append(remainingLabels, remainingBar);
    manualStateSummary.append(divider, remainingRow);
    const diagnostic = completionDiagnostic
      ?? (manualStateDeadIndices.size > 0 ? "Dead end: tile has no legal colours" : null);
    if (diagnostic !== null) {
      const deadRow = document.createElement("div");
      deadRow.className = "manual-state-dead-row";
      const deadMsg = document.createElement("span");
      deadMsg.className = "manual-state-dead-message";
      deadMsg.textContent = diagnostic;
      const undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.className = "manual-state-undo-btn";
      undoBtn.textContent = "Undo";
      undoBtn.title = "Undo last action (Ctrl+Z / Cmd+Z)";
      undoBtn.addEventListener("click", () => {
        undoManualStateAction();
      });
      deadRow.append(deadMsg, undoBtn);
      manualStateSummary.append(deadRow);
    }
  };

  // Which [face, localIndex] a 3×3 keyboard cursor lands on after moving off
  // one edge of the given face in the given direction, indexed by the
  // stepped-over row (left/right) or column (top/bottom). Ported from the
  // design mock's own verified topology rather than re-derived here.
  const MANUAL_STATE_EDGE_WRAP: Record<ManualStateFace, Record<"top" | "bottom" | "left" | "right", [ManualStateFace, number][]>> = {
    U: {top: [["B", 2], ["B", 1], ["B", 0]], bottom: [["F", 0], ["F", 1], ["F", 2]], left: [["L", 0], ["L", 1], ["L", 2]], right: [["R", 2], ["R", 1], ["R", 0]]},
    D: {top: [["F", 6], ["F", 7], ["F", 8]], bottom: [["B", 8], ["B", 7], ["B", 6]], left: [["L", 8], ["L", 7], ["L", 6]], right: [["R", 6], ["R", 7], ["R", 8]]},
    F: {top: [["U", 6], ["U", 7], ["U", 8]], bottom: [["D", 0], ["D", 1], ["D", 2]], left: [["L", 2], ["L", 5], ["L", 8]], right: [["R", 0], ["R", 3], ["R", 6]]},
    R: {top: [["U", 8], ["U", 5], ["U", 2]], bottom: [["D", 2], ["D", 5], ["D", 8]], left: [["F", 2], ["F", 5], ["F", 8]], right: [["B", 0], ["B", 3], ["B", 6]]},
    L: {top: [["U", 0], ["U", 3], ["U", 6]], bottom: [["D", 6], ["D", 3], ["D", 0]], left: [["B", 2], ["B", 5], ["B", 8]], right: [["F", 0], ["F", 3], ["F", 6]]},
    B: {top: [["U", 2], ["U", 1], ["U", 0]], bottom: [["D", 8], ["D", 7], ["D", 6]], left: [["R", 2], ["R", 5], ["R", 8]], right: [["L", 0], ["L", 3], ["L", 6]]},
  };

  const buildManualStateGrid = (manualSize: ManualStateSize) => {
    manualStateDualObservers.forEach((observer) => observer.disconnect());
    manualStateDualObservers = [];
    manualStateDualCopies = [];
    manualStateGrid.replaceChildren();
    manualStateStickerElements.length = 0;
    manualStateFaceElements.clear();
    manualStateArrangedFrame = "";
    (["U", "L", "F", "R", "B", "D"] as ManualStateFace[]).forEach((face) => {
      const faceIndex = (["U", "R", "F", "D", "L", "B"] as ManualStateFace[]).indexOf(face);
      const group = document.createElement("section");
      group.className = "manual-state-face";
      group.dataset.face = face;
      group.style.setProperty("--manual-state-size", String(manualSize));
      // Named view-transition participants let the same six editor faces
      // travel between unfolded and attached layouts in either direction.
      group.style.setProperty("view-transition-name", `manual-state-face-${face.toLowerCase()}`);
      group.setAttribute("aria-label", `${manualStateFaceName[face]} face`);
      manualStateFaceElements.set(face, group);
      // No visual face-letter headline: the net's fixed U/L/F/R/B/D cross
      // arrangement already says which cluster is which, and repeating it as
      // a heading on every one of the six clusters was pure redundancy.
      // aria-label above keeps that information for assistive tech.
      for (let localIndex = 0; localIndex < manualSize * manualSize; localIndex += 1) {
        const index = faceIndex * manualSize * manualSize + localIndex;
        const sticker = document.createElement("button");
        sticker.type = "button";
        sticker.className = "manual-state-sticker";
        sticker.dataset.manualStateIndex = String(index);
        const centre = isManualStateCoreCentre(manualSize, index);
        sticker.dataset.centre = String(centre);
        group.append(sticker);
        manualStateStickerElements[index] = sticker;
      }
      manualStateGrid.append(group);
    });
  };

  const arrangeManualStateView = (manualSize: ManualStateSize) => {
    if (manualStateStickerElements.length === 0) return;
    const frame = manualStateRepresentation === "isometric"
      ? `${manualSize}:isometric:canonical`
      : `${manualSize}:${manualStateRepresentation}:${manualStateOrientation}:${manualStateFlipped}`;
    if (frame === manualStateArrangedFrame) return;
    const perFace = manualSize * manualSize;
    const destinations: HTMLButtonElement[] = [];
    const yQuarterTurns = (4 - manualStateOrientation) % 4;
    manualStateStickerElements.forEach((sticker, source) => {
      let destination = manualStateRepresentation === "isometric" || manualStateRepresentation === "dual-3d"
        ? source
        : manualStateViewDestination(manualSize, source, yQuarterTurns, manualStateFlipped);
      // The complementary cube presents D as a floor beneath its B/L walls.
      // Its near edge is therefore D's bottom row, not the top row used by
      // the flat net, and the inner vertex is on the displayed right. Turn
      // D by 180deg in its own plane so the shared inner corner is DBL on all
      // three planes; this is presentation-only and leaves canonical draft
      // indices untouched.
      destinations[destination] = sticker;
    });
    faceletOrder.forEach((face, faceIndex) => {
      manualStateFaceElements.get(face)?.replaceChildren(
        ...destinations.slice(faceIndex * perFace, (faceIndex + 1) * perFace),
      );
    });
    manualStateArrangedFrame = frame;
  };

  const clearManualStateDualRig = () => {
    manualStateDualObservers.forEach((observer) => observer.disconnect());
    manualStateDualObservers = [];
    manualStateDualCopies.forEach((face) => face.remove());
    manualStateDualCopies = [];
    manualStateFaceElements.forEach((face) => delete face.dataset.dualRig);
  };

  const syncManualStateDualRig = () => {
    clearManualStateDualRig();
    if (manualStateRepresentation !== "dual-3d") return;
    manualStateFaceElements.forEach((sourceFace) => {
      sourceFace.dataset.dualRig = "upper";
      const copyFace = sourceFace.cloneNode(true) as HTMLElement;
      copyFace.classList.add("manual-state-dual-copy");
      copyFace.dataset.dualRig = "lower";
      copyFace.style.removeProperty("view-transition-name");
      const mirrorFace = () => {
        copyFace.dataset.face = sourceFace.dataset.face;
        copyFace.dataset.facing = sourceFace.dataset.facing;
        copyFace.dataset.interactive = sourceFace.dataset.interactive;
        copyFace.replaceChildren(...Array.from(sourceFace.children, (child) => child.cloneNode(true)));
        copyFace.querySelectorAll<HTMLElement>("[data-manual-state-index]").forEach((sticker) => {
          sticker.tabIndex = -1;
        });
      };
      mirrorFace();
      const observer = new MutationObserver(mirrorFace);
      observer.observe(sourceFace, {attributes: true, childList: true, subtree: true, characterData: true});
      manualStateDualObservers.push(observer);
      manualStateDualCopies.push(copyFace);
      manualStateGrid.append(copyFace);
    });
  };

  const manualStateVisibleFaces = (): readonly ManualStateFace[] => {
    if (manualStateRepresentation !== "isometric") return manualStateFaces;
    const visible = manualStateFlipped
      ? ([
        ["B", "R", "D"], ["L", "B", "D"], ["F", "L", "D"], ["R", "F", "D"],
      ] as const)
      : ([
        ["F", "R", "U"], ["L", "F", "U"], ["B", "L", "U"], ["R", "B", "U"],
      ] as const);
    return visible[manualStateOrientation];
  };

  const isManualStateStickerInteractive = (index: number): boolean =>
    Number.isInteger(index) && index >= 0 && index < manualStateDraft.length;

  const syncManualStateInteraction = () => {
    const visibleFaces = new Set(manualStateVisibleFaces());
    manualStateGrid.querySelectorAll<HTMLElement>(".manual-state-face").forEach((face) => {
      face.dataset.interactive = "true";
      face.dataset.facing = visibleFaces.has(face.dataset.face as ManualStateFace) ? "front" : "rear";
    });
    if (manualStateCursorIndex === null || !isManualStateStickerInteractive(manualStateCursorIndex)) {
      setManualStateCursorIndex(manualStateStickerElements.findIndex((_, index) => isManualStateStickerInteractive(index)));
      if (manualStateCursorIndex < 0) setManualStateCursorIndex(null);
    }
    manualStateStickerElements.forEach((sticker, index) => {
      sticker.dataset.cursor = String(index === manualStateCursorIndex);
    });
  };

  const renderManualStateEditor = () => {
    if (manualStateDirtyDots === null || manualStateDirtyDots.size > 0) {
      manualStateDeadIndices.clear();
      dotTrace.log({
        type: "cancel",
        from: manualStateDotGeneration,
        to: manualStateDotGeneration + 1,
        debt: manualStateUnverifiedDots.size,
      });
      manualStateDotGeneration += 1;
      manualStateGenerationSignal.set(manualStateDotGeneration);
    }
    const manualSize = size as ManualStateSize;
    const total = manualStateStickerCount(manualSize);
    const entered = manualStateEnteredCount(manualStateDraft);
    const displayTotal = total;
    const displayEntered = entered;
    const diagnostic = manualStateComplete.get() ? manualStateCompleteDiagnostic() : null;
    manualStateLoad.disabled = entered !== total || diagnostic !== null;
    manualStateCopyToggle.disabled = manualStateLoad.disabled;
    root.querySelector<HTMLButtonElement>('[data-manual-state-copy-format="singmaster"]')!.hidden = manualSize >= 4;
    if (manualStateLoad.disabled) {
      manualStateCopyMenu.hidden = true;
      manualStateCopyToggle.setAttribute("aria-expanded", "false");
    }
    const perColourPlaced: Record<ManualStateFace, number> = {U: 0, D: 0, R: 0, L: 0, F: 0, B: 0};
    manualStateDraft.forEach((value) => {
      if (value !== null) perColourPlaced[value] += 1;
    });
    manualStatePalette.querySelectorAll<HTMLButtonElement>("[data-manual-state-colour]").forEach((button) => {
      const face = button.dataset.manualStateColour as ManualStateFace;
      button.setAttribute("aria-pressed", String(manualStateColour === face));
    });
    manualStateEraser.setAttribute("aria-pressed", String(manualStateColour === null));
    manualStateEraser.classList.toggle("active", manualStateColour === null);
    manualStateEraser.dataset.shiftActive = String(manualStateShiftPressed);
    manualStateEraser.classList.toggle("shift-active", manualStateShiftPressed);
    manualStateNet.dataset.representation = manualStateRepresentation;
    manualStateNet.dataset.orientation = String(manualStateOrientation);
    const canRotateView = manualStateRepresentation === "dual-3d" || manualStateRepresentation === "isometric";
    manualStateRotationGroup.hidden = !canRotateView;
    manualStateFlipButton.hidden = manualStateRepresentation !== "isometric";
    manualStateRotateShortcut.hidden = !canRotateView;
    manualStateFlipShortcut.hidden = manualStateRepresentation !== "isometric";
    manualStateRepresentationButtons.forEach((button) => {
      const selected = button.dataset.manualStateRepresentation === manualStateRepresentation;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderManualStateSummary(manualSize, displayEntered, displayTotal, perColourPlaced, diagnostic);
    renderManualStateFrame(manualSize);
    renderManualStatePaletteLabels();
    if (manualStateBuiltSize !== manualSize) {
      buildManualStateGrid(manualSize);
      manualStateBuiltSize = manualSize;
    }
    arrangeManualStateView(manualSize);
    syncManualStateInteraction();
    const pendingDots: Array<{index: number; element: HTMLElement}> = [];
    const dirtyDots = manualStateDirtyDots;
    const hoverMates = manualStateHoverIndex === null
      ? []
      : manualStatePieceMates(manualSize, manualStateHoverIndex);
    (["U", "L", "F", "R", "B", "D"] as ManualStateFace[]).forEach((face) => {
      const faceIndex = (["U", "R", "F", "D", "L", "B"] as ManualStateFace[]).indexOf(face);
      for (let localIndex = 0; localIndex < manualSize * manualSize; localIndex += 1) {
        const index = faceIndex * manualSize * manualSize + localIndex;
        const sticker = manualStateStickerElements[index];
        const value = manualStateDraft[index];
        const centre = isManualStateCoreCentre(manualSize, index);
        sticker.dataset.face = value ?? "unknown";
        sticker.dataset.centre = String(centre);
        sticker.dataset.auto = String(manualStateAutoIndices.has(index));
        sticker.dataset.cursor = String(index === manualStateCursorIndex);
        if (manualStateDeadIndices.has(index)) {
          sticker.dataset.dead = "true";
        } else {
          delete sticker.dataset.dead;
        }
        sticker.tabIndex = 0;
        sticker.removeAttribute("aria-disabled");
        sticker.removeAttribute("title");
        if (index === manualStateHoverIndex) {
          sticker.dataset.pieceHover = "self";
        } else if (hoverMates.includes(index)) {
          sticker.dataset.pieceHover = "mate";
        } else {
          delete sticker.dataset.pieceHover;
        }
        sticker.setAttribute("aria-label", `${manualStateFaceName[face]} sticker ${localIndex + 1}${centre ? ", core centre" : ""}${value === null ? ", blank" : `, ${manualStateFaceName[value]}${manualStateAutoIndices.has(index) ? ", filled automatically; click to fix" : ""}`}`);
        if (value !== null) {
          manualStateUnverifiedDots.delete(index);
          sticker.textContent = "";
        } else {
          let dots = sticker.querySelector<HTMLElement>(".manual-state-dots");
          const needsDots = dirtyDots === null || dirtyDots.has(index) || dots === null;
          if (!dots) {
            // Only reached right after a fill was erased: textContent above
            // wipes a sticker's children along with its text, so the dots
            // span needs remaking exactly once per such transition, not on
            // every render.
            sticker.textContent = "";
            dots = document.createElement("span");
            dots.className = "manual-state-dots";
            sticker.append(dots);
          }
          if (!needsDots) {
            if (manualStateUnverifiedDots.has(index)) pendingDots.push({index, element: dots});
            continue;
          }
          if (manualSize <= 3 || centre) {
            const exact = allowedManualStateColours(manualSize, manualStateDraft, index);
            renderManualStateDots(dots, exact);
            if (exact.length === 0) {
              manualStateDeadIndices.add(index);
              dotTrace.deadTile(manualSize, manualStateDraft, index, "render");
            }
          } else {
            const local = locallyAllowedManualStateColours(manualSize, manualStateDraft, index);
            renderManualStateDots(dots, local);
            dotTrace.log({type: "render", index, local, generation: manualStateDotGeneration});
            manualStateUnverifiedDots.add(index);
            pendingDots.push({index, element: dots});
          }
        }
      }
    });
    if (manualStateDeadIndices.size > 0) {
      renderManualStateSummary(manualSize, displayEntered, displayTotal, perColourPlaced, diagnostic);
    }
    if (manualSize >= 4) {
      dotTrace.log({
        type: "queue",
        queued: pendingDots.length,
        debt: manualStateUnverifiedDots.size,
        generation: manualStateDotGeneration,
      });
      verifyManualStateDots(manualSize, pendingDots);
    }
    manualStateDirtyDots = new Set();
    syncManualStateDualRig();
    if (manualStateCursorIndex !== null && isManualStateStickerInteractive(manualStateCursorIndex)) {
      const active = document.activeElement;
      if (!active || active === document.body || active.closest("[data-manual-state-index]")) {
        manualStateStickerElements[manualStateCursorIndex]?.focus({preventScroll: true});
      }
    }
  };

  renderManualStatePaletteLabels = () => {
    const manualSize = size as ManualStateSize;
    const faceNames: Record<ManualStateFace, string> = {
      U: "Up", D: "Down", R: "Right", L: "Left", F: "Front", B: "Back",
    };
    const perColourPlaced: Record<ManualStateFace, number> = {U: 0, D: 0, R: 0, L: 0, F: 0, B: 0};
    manualStateDraft.forEach((value) => {
      if (value !== null) perColourPlaced[value] += 1;
    });
    manualStatePalette.querySelectorAll<HTMLButtonElement>("[data-manual-state-colour]").forEach((button) => {
      const face = button.dataset.manualStateColour as ManualStateFace;
      const remaining = manualSize * manualSize - perColourPlaced[face];
      const left = button.querySelector<HTMLElement>("[data-manual-state-colour-left]");
      if (left) left.textContent = `${remaining} left`;
      button.dataset.clearColour = String(manualStateShiftPressed);
      button.setAttribute("aria-label", manualStateShiftPressed
        ? `Clear all ${faceNames[face]} stickers`
        : faceNames[face]);
      button.title = manualStateShiftPressed
        ? `Shift-click to clear all ${faceNames[face]} stickers`
        : `${remaining} ${faceNames[face]} sticker${remaining === 1 ? "" : "s"} left`;
    });
  };

  updateManualStateMetrics = (manualSize: ManualStateSize) => {
    const total = manualStateStickerCount(manualSize);
    const entered = manualStateEnteredCount(manualStateDraft);
    const displayTotal = total;
    const displayEntered = entered;
    const diagnostic = manualStateComplete.get() ? manualStateCompleteDiagnostic() : null;
    manualStateLoad.disabled = entered !== total || diagnostic !== null;
    manualStateCopyToggle.disabled = manualStateLoad.disabled;
    if (manualStateLoad.disabled) {
      manualStateCopyMenu.hidden = true;
      manualStateCopyToggle.setAttribute("aria-expanded", "false");
    }
    const perColourPlaced: Record<ManualStateFace, number> = {U: 0, D: 0, R: 0, L: 0, F: 0, B: 0};
    manualStateDraft.forEach((value) => {
      if (value !== null) perColourPlaced[value] += 1;
    });
    renderManualStateSummary(manualSize, displayEntered, displayTotal, perColourPlaced, diagnostic);
    renderManualStateFrame(manualSize);
    renderManualStatePaletteLabels();
  };

  const setManualStateShiftPressed = (pressed: boolean) => {
    if (manualStateShiftPressed === pressed) return;
    manualStateShiftPressed = pressed;
    manualStateEraser.dataset.shiftActive = String(pressed);
    manualStateEraser.classList.toggle("shift-active", pressed);
    renderManualStatePaletteLabels();
  };

  // Hover only re-rings the affected stickers rather than calling
  // renderManualStateEditor(), which would rebuild the whole grid and restart
  // the (already carefully bounded) async dot-resolution pass on every mouse
  // movement.
  const updateManualStatePieceHighlight = () => {
    const manualSize = size as ManualStateSize;
    manualStateGrid.querySelectorAll<HTMLElement>("[data-piece-hover]").forEach((el) => {
      delete el.dataset.pieceHover;
    });
    if (manualStateHoverIndex === null) return;
    const mates = manualStatePieceMates(manualSize, manualStateHoverIndex);
    const self = manualStateStickerElements[manualStateHoverIndex];
    if (self) {
      self.dataset.pieceHover = "self";
    }
    mates.forEach((mate) => {
      const mateEl = manualStateStickerElements[mate];
      if (mateEl && mateEl.dataset.centre !== "true") {
        mateEl.dataset.pieceHover = "mate";
      }
    });
  };
  const wireManualStateHover = (hoverRoot: HTMLElement) => {
    hoverRoot.addEventListener("mouseover", (event) => {
      const sticker = (event.target as Element).closest("[data-manual-state-index]");
      if (!sticker) return;
      const index = Number(sticker.dataset.manualStateIndex);
      if (manualStateHoverIndex === index) return;
      setManualStateHoverIndex(index);
      updateManualStatePieceHighlight();
    });
    hoverRoot.addEventListener("mouseout", (event) => {
      const related = (event as MouseEvent).relatedTarget as Element | null;
      if (related && hoverRoot.contains(related) && related.closest("[data-manual-state-index]")) return;
      setManualStateHoverIndex(null);
      updateManualStatePieceHighlight();
    });
  };
  wireManualStateHover(manualStateGrid);
  let manualStateYaw = -35;
  let manualStateFlip = 0;
  let manualStateDualYaw = 0;
  let manualStateFlipped = false;
  const resetManualState3dOrientation = (immediate: boolean = true) => {
    manualStateOrientation = 0;
    manualStateYaw = -35;
    manualStateFlip = 0;
    manualStateDualYaw = 0;
    manualStateFlipped = false;
    manualStateIsRotating = false;
    manualStateNet.dataset.orientation = "0";
    delete manualStateNet.dataset.flipped;
    if (immediate) {
      manualStateNet.dataset.animState = "resetting";
    } else {
      delete manualStateNet.dataset.animState;
    }
    manualStateNet.style.setProperty("--manual-state-yaw", `${manualStateYaw}deg`);
    manualStateNet.style.setProperty("--manual-state-flip", `${manualStateFlip}deg`);
    manualStateNet.style.setProperty("--manual-state-dual-yaw", `${manualStateDualYaw}deg`);
    manualStateGrid.style.removeProperty("--manual-state-yaw");
    manualStateGrid.style.removeProperty("--manual-state-flip");
    if (immediate) {
      void manualStateNet.offsetHeight;
      void manualStateGrid.offsetHeight;
      requestAnimationFrame(() => {
        if (manualStateNet.dataset.animState === "resetting") {
          delete manualStateNet.dataset.animState;
        }
      });
    }
  };
  const rotateManualStateView = async (direction: "cw" | "ccw") => {
    if (manualStateIsRotating || (manualStateRepresentation !== "dual-3d" && manualStateRepresentation !== "isometric")) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextOrientation = (direction === "cw"
      ? (manualStateOrientation + 3) % 4
      : (manualStateOrientation + 1) % 4) as 0 | 1 | 2 | 3;

    if (manualStateRepresentation === "dual-3d") {
      const delta = direction === "cw" ? -90 : 90;
      manualStateDualYaw += delta;
      if (prefersReducedMotion) {
        manualStateOrientation = nextOrientation;
        manualStateYaw += delta;
        manualStateNet.dataset.orientation = String(nextOrientation);
        manualStateNet.style.setProperty("--manual-state-dual-yaw", `${manualStateDualYaw}deg`);
        syncManualStateInteraction();
        return;
      }
      manualStateIsRotating = true;
      try {
        manualStateNet.style.setProperty("--manual-state-dual-yaw", `${manualStateDualYaw}deg`);
        await new Promise((resolve) => setTimeout(resolve, 380));
        manualStateOrientation = nextOrientation;
        manualStateYaw += delta;
        manualStateNet.dataset.orientation = String(nextOrientation);
        syncManualStateInteraction();
      } finally {
        manualStateIsRotating = false;
      }
      return;
    }

    if (prefersReducedMotion) {
      manualStateOrientation = nextOrientation;
      manualStateYaw += (direction === "cw" ? -90 : 90);
      manualStateNet.style.setProperty("--manual-state-yaw", `${manualStateYaw}deg`);
      manualStateNet.dataset.orientation = String(nextOrientation);
      syncManualStateInteraction();
      return;
    }

    manualStateIsRotating = true;
    try {
      // 1. Unexplode hidden faces flush into the cube
      manualStateNet.dataset.animState = "unexploded";
      await new Promise((resolve) => setTimeout(resolve, 220));

      // 2. Rotate closed cube cw or ccw in 3D
      manualStateYaw += (direction === "cw" ? -90 : 90);
      manualStateNet.style.setProperty("--manual-state-yaw", `${manualStateYaw}deg`);
      await new Promise((resolve) => setTimeout(resolve, 380));

      // 3. Explode newly hidden faces outward for the next orientation
      manualStateOrientation = nextOrientation;
      manualStateNet.dataset.orientation = String(nextOrientation);
      syncManualStateInteraction();
      delete manualStateNet.dataset.animState;
      await new Promise((resolve) => setTimeout(resolve, 220));
    } finally {
      delete manualStateNet.dataset.animState;
      manualStateIsRotating = false;
    }
  };

  const flipManualStateView = async () => {
    if (manualStateIsRotating || manualStateRepresentation !== "isometric") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextFlipped = !manualStateFlipped;

    if (prefersReducedMotion) {
      manualStateFlipped = nextFlipped;
      manualStateFlip = nextFlipped ? 180 : 0;
      manualStateNet.style.setProperty("--manual-state-flip", `${manualStateFlip}deg`);
      if (nextFlipped) {
        manualStateNet.dataset.flipped = "true";
      } else {
        delete manualStateNet.dataset.flipped;
      }
      syncManualStateInteraction();
      return;
    }

    manualStateIsRotating = true;
    try {
      // 1. Unexplode hidden faces flush into the cube
      manualStateNet.dataset.animState = "unexploded";
      await new Promise((resolve) => setTimeout(resolve, 220));

      // 2. Rotate closed cube via two distinct x turns with a 200ms pause
      manualStateFlip += 90;
      manualStateNet.style.setProperty("--manual-state-flip", `${manualStateFlip}deg`);
      await new Promise((resolve) => setTimeout(resolve, 360));

      await new Promise((resolve) => setTimeout(resolve, 200));

      manualStateFlip += 90;
      manualStateNet.style.setProperty("--manual-state-flip", `${manualStateFlip}deg`);
      await new Promise((resolve) => setTimeout(resolve, 360));

      // 3. Explode newly hidden faces outward for the flipped orientation
      manualStateFlipped = nextFlipped;
      if (nextFlipped) {
        manualStateNet.dataset.flipped = "true";
      } else {
        delete manualStateNet.dataset.flipped;
      }
      syncManualStateInteraction();
      delete manualStateNet.dataset.animState;
      await new Promise((resolve) => setTimeout(resolve, 220));
    } finally {
      delete manualStateNet.dataset.animState;
      manualStateIsRotating = false;
    }
  };

  manualStateRotateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const dir = button.dataset.manualStateRotate as "cw" | "ccw" | "flip";
      if (dir === "cw" || dir === "ccw") {
        rotateManualStateView(dir);
      } else if (dir === "flip") {
        flipManualStateView();
      }
    });
  });

  const setManualStateRepresentation = (representation: ManualStateRepresentation) => {
    if (representation === manualStateRepresentation) return;
    manualStateIsRotating = false;
    delete manualStateNet.dataset.animState;
    if (representation === "isometric") {
      manualStateYaw = -35 + manualStateOrientation * 90;
      manualStateNet.style.setProperty("--manual-state-yaw", `${manualStateYaw}deg`);
      manualStateNet.style.setProperty("--manual-state-flip", `${manualStateFlip}deg`);
      if (manualStateFlipped) {
        manualStateNet.dataset.flipped = "true";
      } else {
        delete manualStateNet.dataset.flipped;
      }
    } else if (representation === "dual-3d") {
      manualStateDualYaw = manualStateOrientation === 3 ? -90 : manualStateOrientation * 90;
      manualStateNet.style.setProperty("--manual-state-dual-yaw", `${manualStateDualYaw}deg`);
    }
    const renderRepresentation = () => {
      manualStateRepresentation = representation;
      renderManualStateEditor();
    };
    const startViewTransition = (document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    }).startViewTransition;
    if (startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      startViewTransition.call(document, renderRepresentation);
    } else {
      renderRepresentation();
    }
  };
  manualStateRepresentationButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setManualStateRepresentation(button.dataset.manualStateRepresentation as ManualStateRepresentation);
    });
  });

  const openManualStateEditor = () => {
    if (size < 2 || size > 5) return;
    resetManualState3dOrientation(true);
    const manualSize = size as ManualStateSize;
    const setup = input.value.trim() === "" ? null : parseState(input.value);
    const hasSetupState = setup?.TAG === "Ok" && setup._0.state.size === manualSize;
    setManualStateDraft(hasSetupState
      ? (FaceletCodec.render(setup._0.state) as string).split("") as ManualStateDraft
      : resetManualState(manualSize));
    manualStateExplicitIndices.clear();
    manualStateDraft.forEach((colour, index) => {
      if (colour !== null) manualStateExplicitIndices.add(index);
    });
    manualStateAutoIndices.clear();
    manualStateUnverifiedDots.clear();
    manualStateDeadIndices.clear();
    manualStateDirtyDots = null;
    if (!hasSetupState) refreshManualStateAutoFill(manualSize, true);
    clearManualStateHistory();
    manualStateNotation.value = "";
    manualStateNotationStatus.textContent = "Paste a state to replace the draft, or moves to apply them.";
    setManualStateHoverIndex(null);
    setManualStateCursorIndex(null);
    manualStateIntro.textContent = manualSize <= 3
      ? "Pick a face colour, then fill the net. Nothing changes in Setup until the complete, physically valid state is loaded."
      : manualSize === 5
      ? "Pick a face colour, then fill the net. Colour quotas, core-centre orientation, and piece identities are enforced; nothing changes in Setup until the complete facelet state is loaded."
      : "Pick a face colour, then fill the net. Colour quotas and piece identities are enforced, and Load checks full 4×4 physical reachability.";
    manualStateDialog.dataset.manualStateSize = String(manualSize);
    manualStateColour = "U";
    setManualStateShiftPressed(false);
    // Put the dialog in the top layer before building its reachability-aware
    // dots, which are intentionally more substantial on big cubes.
    manualStateDialog.showModal();
    manualStateSmartCubeStatus.textContent = manualSize === 3
      ? smartCubeConnected
        ? smartCubeLiveState !== null || smartCubeSupportsFacelets
          ? "Import the connected cube's live physical state."
          : "The connected cube has not supplied a physical state."
        : "Connect a 3×3 smart cube to import its live state."
      : "Smart-cube state import is available for the 3×3 editor.";
    updateManualStateSmartCubeControl();
    renderManualStateEditor();
    void manualStateNet.offsetHeight;
    void manualStateGrid.offsetHeight;
    window.requestAnimationFrame(() => {
      if (manualStateCursorIndex !== null) setManualStateCursor(manualStateCursorIndex, true);
    });
    updateViewportDialogOcclusion();
  };

  const recognize = (result: Result<CubeState>, label: string): Result<RecognizedInput> => {
    if (result.TAG === "Error") return result;
    const diagnostic = validatePhysicalState(result._0);
    return diagnostic === null
      ? {TAG: "Ok", _0: {state: result._0, label}}
      : {TAG: "Error", _0: diagnostic};
  };

  /** Reconstruct a valid odd cube in CubeLab's fixed U/R/F centre frame. */
  const canonicaliseSetupOrientation = (state: CubeState): Result<CubeState, string> => {
    if (state.size === 5) {
      const canonical = Orbit64Codec.canonicaliseState(state) as Result<CubeState, unknown>;
      return canonical.TAG === "Ok"
        ? canonical
        : {TAG: "Error", _0: Orbit64Codec.describeError(canonical._0)};
    }
    if (state.size !== 3) return {TAG: "Error", _0: "Orientation canonicalisation is available for 3×3 and 5×5 states."};
    const pieces = PieceReducer.reduce(state) as Result<PieceState, unknown>;
    if (pieces.TAG === "Error") return {TAG: "Error", _0: PieceReducer.describeError(pieces._0)};
    const canonical = PieceReducer.reconstruct(pieces._0) as Result<CubeState, unknown>;
    return canonical.TAG === "Ok"
      ? canonical
      : {TAG: "Error", _0: "Could not reconstruct the canonical 3×3 orientation."};
  };

  const updateSetupOrientationUi = (recognized: RecognizedInput | null) => {
    const canonical = recognized === null ? null : canonicaliseSetupOrientation(recognized.state);
    if (canonical === null || canonical.TAG === "Error") {
      setupOrientation.hidden = true;
      setupCanonicalise.hidden = true;
      return;
    }
    const isCanonical = FaceletCodec.render(canonical._0) === FaceletCodec.render(recognized.state);
    setupOrientation.hidden = false;
    setupOrientation.textContent = isCanonical ? "Canonical U/R/F frame" : "Rotated centre frame";
    setupOrientation.classList.toggle("error", !isCanonical);
    setupCanonicalise.hidden = isCanonical;
  };

  // SSE delimiters and prefixed moves are unambiguous in CubeLab's other
  // dialects. Detect pasted SSE without changing the persistent selection.
  const dialectForPastedInput = (value: string): NotationDialect =>
    dialectForAlgorithmInput(size, notationDialect, value);

  const parseAlgorithm = (value: string): Result<RecognizedInput> => {
    const effectiveDialect = dialectForPastedInput(value);
    const evaluated = evaluateAlgorithm(
      size,
      lowercaseMode,
      effectiveDialect,
      value,
    );
    if (evaluated.TAG === "Error") return evaluated;
    const label = effectiveDialect === "Sse"
      ? `Algorithm · SSE${notationDialect === "Sse" ? "" : " (detected)"}`
      : size >= 4 && effectiveDialect === "Ruwix"
      ? `Algorithm · Ruwix${lowercaseMode === "InnerSlice" ? " + legacy lowercase" : ""}`
      : `Algorithm · ${size >= 4 && lowercaseMode === "InnerSlice" ? "Legacy" : "SiGN"}`;
    return {
      TAG: "Ok",
      _0: {
        state: evaluated._0.finalState,
        label,
        timeline: evaluated._0,
        timelineKey: `${size}\u0000${lowercaseMode}\u0000${effectiveDialect}\u0000${value}`,
      },
    };
  };

  const parseState = (inputValue: string): Result<RecognizedInput> => {
    const compact = inputValue.trim();
    if (compact === "") {
      return recognize(StateTypes.solved(size) as Result<CubeState>, "Solved default");
    }
    if ((size === 4 || size === 5) && looksLikeLargeCubeState(compact)) {
      const large = parseLargeCubeState(compact, size);
      return large.TAG === "Ok"
        ? {TAG: "Ok", _0: {state: large._0, label: "Cube Rosetta large-cube state"}}
        : large;
    }
    if ((size === 2 || size === 3) && compact.startsWith("cp:")) {
      const pieces = PieceReducer.parseState(size, compact) as Result<CubeState, unknown>;
      return pieces.TAG === "Ok"
        ? {TAG: "Ok", _0: {state: pieces._0, label: "Cubie coordinates"}}
        : {TAG: "Error", _0: PieceReducer.describeError(pieces._0)};
    }
    if ((size === 2 || size === 3) && looksLikeSingmasterCycleState(compact)) {
      const cycles = parseSingmasterCycleState(compact, size);
      return cycles.TAG === "Ok"
        ? {TAG: "Ok", _0: {state: cycles._0, label: "Singmaster permutation cycles"}}
        : cycles;
    }
    if (size === 3 && looksLikeAcubeState(compact, notationDialect === "Acube")) {
      const acube = parseAcubeState(compact);
      if (acube.TAG === "Ok") {
        return {TAG: "Ok", _0: {state: acube._0.state, label: "ACube cubie state"}};
      }
      if (notationDialect === "Acube") return acube;
    }
    if (size >= 2 && size <= 5 && looksLikeSseState(compact)) {
      const sse = parseSseState(compact, size);
      if (sse.TAG === "Error") return sse;
      const suffix = sse._0.ignoredCentreOrientations.length === 0
        ? ""
        : " · marked-centre orientation omitted";
      return {TAG: "Ok", _0: {state: sse._0.state, label: `SSE cubie state${suffix}`}};
    }
    if (Orbit64Codec.widths[size] === compact.length && /^[A-Za-z0-9_-]+$/.test(compact)) {
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
      if (colourNet.TAG === "Ok") return recognize(colourNet, "Colour net");
    }
    const facelets = FaceletCodec.parse(size, compact) as Result<CubeState>;
    if (facelets.TAG === "Ok") {
      return recognize(facelets, /\s/.test(compact) ? "Spaced facelets" : "Compact facelets");
    }
    const colours = ColorCodec.parseCompact(scheme(), size, compact) as Result<CubeState>;
    return colours.TAG === "Ok"
      ? recognize(colours, /\s/.test(compact) ? "Spaced colours" : "Compact colours")
      : parseAlgorithm(inputValue);
  };

  const macroDefinition = /(?:^|\n)\s*(?:def\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/;

  /** Expands macro-editor input only up to the ordinary materialized tape limit. */
  const parseMovesEditor = (value: string): Result<unknown[], string> => {
    if (!macroDefinition.test(value)) {
      const parsed = MoveParser.parseWithOptions(
        size,
        lowercaseMode,
        dialectForPastedInput(value),
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
        dialectForPastedInput(notation.join(" ")),
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

  const parseWorkspaceState = (setup = parseState(input.value)): Result<RecognizedInput> => {
    if (setup.TAG === "Error") return setup;
    // Setup is the state at tape position zero. An algorithm is a convenient
    // way to describe that state, but it is not silently prepended to Moves:
    // otherwise position zero renders solved instead of the Setup the user
    // explicitly supplied.
    if (movesInput.value.trim() === "") {
      // Pass setup through whole: when Setup itself resolves to an algorithm,
      // parseState already built its timeline/timelineKey, and dropping them
      // here (as opposed to only picking state/label) would silently turn
      // every Setup-only algorithm into a static single-state view with no
      // playback tape and no compatibility assessment.
      return setup;
    }
    const moves = parseMovesEditor(movesInput.value);
    if (moves.TAG === "Error") return {TAG: "Error", _0: moves._0};
    const baseState = setup._0.state;
    const applied = MoveExecutor.applyAlg(baseState, moves._0) as Result<CubeState, unknown>;
    if (applied.TAG === "Error") return {TAG: "Error", _0: "Could not apply Moves to Setup."};
    const timeline = buildTimeline(baseState, moves._0);
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
    controls.hidden = size < 4 || (notationDialect !== "Modern" && notationDialect !== "Ruwix");
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

  const renderConverterColourNet = (state: CubeState) => {
    const colours = ColorCodec.renderCompact(scheme(), state) as Result<string>;
    if (colours.TAG === "Error") {
      converterColourNet.hidden = true;
      return;
    }
    const faceLength = size * size;
    const serialFaces = ["U", "R", "F", "D", "L", "B"] as const;
    const colourForFace = new Map(
      serialFaces.map((face, index) => [face, colours._0.slice(index * faceLength, (index + 1) * faceLength)]),
    );
    converterColourNet.replaceChildren();
    converterColourNet.style.setProperty("--converter-net-size", String(size));
    faceletOrder.forEach((face) => {
      const group = document.createElement("div");
      group.className = "converter-colour-net-face";
      group.dataset.face = face;
      group.setAttribute("aria-label", `${face} face`);
      const stickers = colourForFace.get(face) ?? "";
      for (const colour of stickers) {
        const sticker = document.createElement("i");
        sticker.className = "converter-colour-net-sticker";
        sticker.dataset.colour = colour;
        sticker.setAttribute("aria-hidden", "true");
        group.append(sticker);
      }
      converterColourNet.append(group);
    });
    converterColourNet.hidden = false;
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
    if (orbitQuickCopy) orbitQuickCopy.hidden = !(size in Orbit64Codec.widths);
    manualStateOpen.disabled = size < 2 || size > 5;
    manualStateOpen.textContent = `Enter ${size}×${size} state`;
    manualStateOpen.title = size === 2 || size === 3
      ? `Build a ${size}×${size}×${size} cube state sticker by sticker with reachability guidance`
      : `Build a ${size}×${size}×${size} cube state sticker by sticker with constrained piece identities`;
    nissPanel.hidden = size !== 3 || activeTab !== "workbench";
    hamiltonPanel.hidden = activeTab !== "workbench";
    optimal2x2Row.hidden = size !== 2;
    optimal2x2Solve.disabled = size !== 2;
    reduction4x4Row.hidden = size !== 4;
    reduction4x4Solve.disabled = size !== 4;
    twoPhaseSolve.disabled = size !== 3;
    twoPhaseTarget.disabled = size !== 3;
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
    renderConverterColourNet(state);
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
        if (size === 2 || size === 3) {
          setOutput("orbit64", "Unavailable — invalid piece state", false);
        }
        if (size === 3) {
          setOutput("acube", "Unavailable — invalid piece state", false);
        }
        setOutput("sse", "Unavailable — invalid piece state", false);
        setOutput("singmaster", "Unavailable — invalid piece state", false);
      } else {
        const renderedPieces = PieceReducer.render(pieces._0) as Result<string, unknown>;
        setOutput(
          "pieces",
          renderedPieces.TAG === "Ok"
            ? renderedPieces._0
            : `Unavailable — ${PieceReducer.describeError(renderedPieces._0)}`,
          renderedPieces.TAG === "Ok",
        );
        if (size === 2 || size === 3) {
          const orbit = Orbit64Codec.encodeState(state) as Result<string, unknown>;
          setOutput(
            "orbit64",
            orbit.TAG === "Ok" ? orbit._0 : `Unavailable — ${Orbit64Codec.describeError(orbit._0)}`,
            orbit.TAG === "Ok",
          );
        }
        if (size === 3) {
          const acube = renderAcubeState(state);
          setOutput("acube", acube.TAG === "Ok" ? acube._0 : `Unavailable — ${acube._0}`, acube.TAG === "Ok");
        }
        const sse = renderSseState(state);
        setOutput("sse", sse.TAG === "Ok" ? sse._0 : `Unavailable — ${sse._0}`, sse.TAG === "Ok");
        const singmaster = renderSingmasterCycleState(state);
        setOutput(
          "singmaster",
          singmaster.TAG === "Ok" ? singmaster._0 : `Unavailable — ${singmaster._0}`,
          singmaster.TAG === "Ok",
        );
      }
    }
    if (size === 4 || size === 5) {
      const coordinates = renderLargeCubeState(state, "coordinates");
      setOutput("pieces", coordinates.TAG === "Ok" ? coordinates._0 : `Unavailable — ${coordinates._0}`, coordinates.TAG === "Ok");
      const sse = renderSseState(state);
      setOutput("sse", sse.TAG === "Ok" ? sse._0 : `Unavailable — ${sse._0}`, sse.TAG === "Ok");
      const singmaster = renderSingmasterCycleState(state);
      setOutput("singmaster", singmaster.TAG === "Ok" ? singmaster._0 : `Unavailable — ${singmaster._0}`, singmaster.TAG === "Ok");
      const orbit = Orbit64Codec.encodeState(state);
      setOutput(
        "orbit64",
        orbit.TAG === "Ok" ? orbit._0 : `Unavailable — ${Orbit64Codec.describeError(orbit._0)}`,
        orbit.TAG === "Ok",
      );
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
  let playbackSpeed = preferences.playbackSpeed;
  root.querySelectorAll<HTMLButtonElement>("[data-playback-speed]").forEach((candidate) => {
    const active = Number(candidate.dataset.playbackSpeed) === playbackSpeed;
    candidate.classList.toggle("active", active);
    candidate.setAttribute("aria-pressed", String(active));
  });
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
  let smartCubeReplayControlsApi: ReplayControls | null = null;
  let smartCubeTapeRecorder: {
    recordEvent: (event: SmartCubeEvent) => void;
    recordCommand: (command: import("./smart-cube/types").SmartCubeCommand) => void;
    recordDerived: (trigger: string, input: Record<string, unknown>, output: Record<string, unknown>) => void;
    finish: (note?: string) => unknown;
  } | null = null;
  let smartCubeDerivedComparator: {
    observe: (entry: {trigger: string; in: Record<string, unknown>; out: Record<string, unknown>}) => void;
    reset: () => void;
    getDiff: () => readonly unknown[];
  } | null = null;
  const smartCubeDevEnabled = new URLSearchParams(window.location.search).has("dev");
  const smartCubeMockMode = root.dataset.mock === "true";
  smartCubeQaPanel.hidden = !smartCubeMockMode;
  const appendSmartCubeQaEvent = (event: SmartCubeEvent) => {
    if (!smartCubeMockMode) return;
    const replay = smartCubeReplayControlsApi?.getReplayState();
    const row = document.createElement("div");
    row.textContent = `${replay?.offsetMs ?? 0} ms  input/${event.type}`;
    smartCubeQaLog.append(row);
    while (smartCubeQaLog.childElementCount > 80) smartCubeQaLog.firstElementChild?.remove();
    smartCubeQaLog.scrollTop = smartCubeQaLog.scrollHeight;
  };
  const requestedReplayName = smartCubeDevEnabled
    ? new URLSearchParams(window.location.search).get("replay")
    : null;
  const smartCubeReplayRequested = requestedReplayName !== null && /^[a-z0-9][a-z0-9_-]*$/i.test(requestedReplayName)
    ? requestedReplayName
    : null;
  let smartCubeConnected = false;
  let smartCubeDeviceName = "Smart cube";
  let smartCubeLedFeedback = false;
  let smartCubeSupportsFacelets = false;
  let smartCubeLiveState: CubeState | null = null;
  let smartCubeRenderedState: CubeState | null = null;
  let smartCubeStateSyncPending = false;
  let manualStateSmartCubeSyncPending = false;
  let smartCubeSyncMode: SyncMode = "PhysicalMirror";
  let smartCubeControllerState: CubeState | null = null;
  let smartCubeControllerInspection = false;
  let smartCubeControllerOrientation: Array<{axis: "X" | "Y" | "Z"; turns: number}> = [];
  let smartCubeOrientationTracking = false;
  let smartCubeRecording = false;
  let smartCubeRecordingTapeDirty = false;
  let smartCubeRecordingTapePresented = false;
  updateManualStateSmartCubeControl = () => {
    const isThreeByThree = size === 3;
    const canReadState = smartCubeLiveState !== null || (smartCubeSupportsFacelets && smartCubeManager !== null);
    manualStateSmartCubeSync.disabled = manualStateSmartCubeSyncPending
      || !smartCubeConnected
      || !isThreeByThree
      || !canReadState;
    manualStateSmartCubeSync.textContent = manualStateSmartCubeSyncPending
      ? "ᛒ Syncing…"
      : "ᛒ Sync from cube";
    manualStateSmartCubeSync.title = !isThreeByThree
      ? "Smart-cube state import is available for the 3×3 editor"
      : !smartCubeConnected
      ? "Connect a smart cube first"
      : !canReadState
      ? "The connected cube has not supplied a physical state"
      : "Replace the editor draft with the connected cube's live physical state";
  };
  let smartCubeGuidedTape = false;
  // Hardware faces stay fixed to the device. This is the accumulated tape
  // frame used to project later packets after visible x/y/z regrips.
  let smartCubeRecordingFrame: Array<{axis: "X" | "Y" | "Z"; turns: number}> = [];
  let smartCubeRecordingAnimation = Promise.resolve();
  let smartCubeRecordingAnimationGeneration = 0;
  let smartCubeDiagnosticsEnabled = window.localStorage.getItem("cubelab.smartCube.diagnostics") === "1";
  const smartCubeDiagnosticTrace: Array<{
    at: string;
    event: string;
    detail: Record<string, unknown>;
  }> = [];
  const updateSmartCubeDiagnosticsUi = () => {
    smartCubeDiagnostics.textContent = smartCubeDiagnosticsEnabled ? "Diagnostics on" : "Diagnostics off";
    smartCubeDiagnostics.setAttribute("aria-pressed", String(smartCubeDiagnosticsEnabled));
    smartCubeCopyTrace.disabled = !smartCubeDiagnosticsEnabled || smartCubeDiagnosticTrace.length === 0;
  };
  const traceSmartCubeStabilization = (event: string, detail: Record<string, unknown>) => {
    const trigger = event === "virtual regrip" ? "virtual-regrip"
      : event.startsWith("gyro view recentered (") ? "gyro-recenter"
      : event === "gyro orientation" ? "orientation-snapshot"
      : null;
    if (trigger) {
      const input = event === "virtual regrip"
        ? {coordinateFrame: detail.coordinateFrame}
        : event === "gyro orientation"
          ? {coordinateFrame: detail.coordinateFrame, rawQuaternion: detail.rawQuaternion}
          : {coordinates: detail.coordinates};
      smartCubeTapeRecorder?.recordDerived(trigger, input, detail);
      smartCubeDerivedComparator?.observe({trigger, in: input, out: detail});
      if (smartCubeMockMode && smartCubeDerivedComparator) {
        const differences = smartCubeDerivedComparator.getDiff();
        smartCubeQaDiffValue.textContent = differences.length === 0 ? "match" : `${differences.length} mismatch${differences.length === 1 ? "" : "es"}`;
      }
    }
    if (!smartCubeDiagnosticsEnabled) return;
    smartCubeDiagnosticTrace.push({at: new Date().toISOString(), event, detail});
    if (smartCubeDiagnosticTrace.length > 500) smartCubeDiagnosticTrace.shift();
    updateSmartCubeDiagnosticsUi();
  };
  const updateSmartCubeRegripGauge = () => viewport?.setRegripGauge(null);
  // During a recording session the physical cube is an input device. Keep a
  // separate virtual state so incoming facelet packets cannot repaint the
  // tape's Setup + Moves state over the viewport.
  let smartCubeRecordingState: CubeState | null = null;
  let lastOrientationLogTime = 0;
  let latestSmartCubeOrientation: Pick<
    SmartCubeOrientationEvent,
    "quaternion" | "coordinateFrame"
  > | null = null;

  const recenterSmartCubeGyroView = (
    source: "button" | "gesture" = "button",
    orientationOverride?: Pick<SmartCubeOrientationEvent, "quaternion" | "coordinateFrame">,
  ) => {
    if (!smartCubeOrientationTracking) return;
    const target = orientationOverride ?? latestSmartCubeOrientation;
    if (!target) return;
    viewport?.recenterDeviceOrientation(
      target.quaternion,
      target.coordinateFrame,
      true,
    );
    updateSmartCubeRegripGauge();
    traceSmartCubeStabilization(`gyro view recentered (${source})`, {
      coordinates: target.quaternion,
    });
    smartCubeStatus.textContent = source === "gesture"
      ? `${smartCubeDeviceName} · Gyro view centered (face flick gesture)`
      : `${smartCubeDeviceName} · Gyro view centered`;
    smartCubeRecenter.classList.add("pulse");
    window.setTimeout(() => smartCubeRecenter.classList.remove("pulse"), 450);
  };

  let smartCubeMovesInFlight = 0;
  let smartCubeMoveQueue = Promise.resolve();
  type QueuedSmartCubeMove = {
    /** Body-frame move: this is what the gyro-oriented 3D viewport animates. */
    move: string;
    /** Solver-frame notation used only by history and recorded algorithms. */
    solverMove?: string;
    omitPreviewHistory?: boolean;
    source?: "regrip-core";
  };
  const smartCubePendingMoves: QueuedSmartCubeMove[] = [];
  let omitNextGestureTriggerMove: string | null = null;
  let suppressNextSmartCubeExtension = false;
  let smartCubeCoachingWaiting = false;
  let smartCubeCoachingFrameActive = false;
  let smartCubeRotationWait: {
    action: ExpectedSmartCubeAction & {kind: "rotation"};
    generation: number;
    completedQuarterTurns: number;
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

  const smartCubeGestureRecenter = createGestureRecenterDetector({
    maxIntervalMs: 280,
    cooldownMs: 800,
    audioFeedback: smartCubeAudio,
    onRecenter: (event) => {
      if (!smartCubeOrientationTracking || smartCubeRecording) return;
      // The rapid face-and-return pair is an input gesture, not part of the
      // move ledger. Its first half may already be written, while the second
      // packet is queued immediately after this callback.
      removeTrailingPreviewHistoryTokens([event.move1, event.move2])
        || removeTrailingPreviewHistoryTokens([event.move1]);
      const firstTriggerMove = [...smartCubePendingMoves].reverse()
        .find((record) => record.move === event.move1);
      if (firstTriggerMove) firstTriggerMove.omitPreviewHistory = true;
      omitNextGestureTriggerMove = event.move2;
      recenterSmartCubeGyroView("gesture", event.restingOrientation ?? undefined);
    },
  });

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
      restoreIdleTurnGuide();
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

  // The toggle should describe a visible resting state as well as hover and
  // playback. At rest, guide the next playable move in the tape.
  const restoreIdleTurnGuide = () => {
    if (!turnGuides || activeTurnGuide || playbackDirection !== 0 || !activeTimeline) return;
    for (let index = activeIndex; index < activeTimeline.steps.length; index++) {
      const entry = activeTimeline.steps[index];
      if (!entry?.step || entry.kind === "pause") continue;
      viewport?.setTurnGuide({
        step: entry.step,
        label: activeTimeline.labels[index] ?? "",
        past: pastMoveTokens(index, 8),
        upcoming: upcomingMoveTokens(index, 12),
      });
      return;
    }
    viewport?.setTurnGuide(null);
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
    academyComparison.hidden = academyMethod === "reduction4x4" || academyMethod === "reduction5x5" || academyMethod === "petrus5x5" || compared.length < 2;
    if (academyMethod === "reduction4x4" || academyMethod === "reduction5x5" || academyMethod === "petrus5x5" || compared.length < 2) {
      academyComparison.textContent = "";
      return;
    }
    const best = compared.reduce((left, right) => right.moveCount < left.moveCount ? right : left);
    academyComparison.textContent = `Same-state comparison · ${compared
      .map(({label, moveCount}) => `${label} ${moveCount} HTM`)
      .join(" · ")}. Shortest: ${best.label}.`;
  };

  const selectedTutorialMethod = (): TutorialMethod | null =>
    academyMethod === "reduction4x4" || academyMethod === "reduction5x5" || academyMethod === "petrus5x5" ? null : academyMethod;

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

  const twoPhaseTargetState = (): Result<CubeState, string> => {
    if (twoPhaseTarget.value.trim() === "") {
      const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
      return solved.TAG === "Ok"
        ? {TAG: "Ok", _0: solved._0}
        : {TAG: "Error", _0: "Could not create the solved 3×3 target."};
    }
    const parsed = parseState(twoPhaseTarget.value);
    return parsed.TAG === "Ok"
      ? {TAG: "Ok", _0: parsed._0.state}
      : {TAG: "Error", _0: describeError(parsed._0)};
  };

  const twoPhaseSourceKeyForCurrent = (): string =>
    `${input.value}\u0000${twoPhaseTarget.value}`;

  // Solver output is valid only for the currently parsed Setup. Colour scheme
  // fields participate because they can change a colour-notation Setup
  // without changing its visible text.
  const solverSetupSourceKeyForCurrent = (): string =>
    `${input.value}\u0000${schemeSelect.value}\u0000${customScheme.value}`;

  const academySetupSourceKey = (): string =>
    `${size}\u0000${lowercaseMode}\u0000${notationDialect}\u0000${schemeSelect.value}\u0000${customScheme.value}\u0000${input.value}\u0000${academyMethod === "reduction4x4" || academyMethod === "reduction5x5" || academyMethod === "petrus5x5" ? movesInput.value : ""}`;

  const synchronizeAcademySetup = () => {
    const key = academySetupSourceKey();
    if (key === academySetupKey) return;
    academySetupKey = key;
    const setup = parseState(input.value);
    const source = academyMethod === "reduction4x4" || academyMethod === "reduction5x5" || academyMethod === "petrus5x5"
      ? parseWorkspaceState(setup)
      : setup;
    updateAcademySource(source.TAG === "Ok" ? source._0 : null);
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
    if (method === null) {
      academySolve.disabled = true;
      academySolve.textContent = "Use reduction milestones";
      return;
    }
    academySolve.disabled = academySolveBusy
      || activeRecognized === null
      || academyTargetDiagnostic() !== null
      || size !== (method === "twoByTwoBeginner" || method === "twoByTwoPetrus" ? 2 : 3);
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

  const reductionAcademyPhase = (
    number: number,
    title: string,
    instruction: string,
    metrics: string,
    satisfied: boolean,
    active: boolean,
    steps: string[],
  ) => {
    const phase = document.createElement("article");
    phase.className = `academy-phase reduction-academy-phase${satisfied ? " satisfied" : ""}${active ? " active" : ""}`;
    const heading = document.createElement("strong");
    heading.textContent = `${number}. ${title}`;
    const detail = document.createElement("span");
    detail.textContent = instruction;
    const metric = document.createElement("span");
    metric.className = "academy-phase-metrics";
    metric.textContent = metrics;
    const guide = document.createElement("ol");
    guide.className = "reduction-academy-steps";
    steps.forEach((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      guide.append(item);
    });
    phase.append(heading, detail, metric, guide);
    return phase;
  };

  const renderReduction4x4Academy = (recognized: RecognizedInput | null) => {
    if (activeTab !== "academy" || academyMethod !== "reduction4x4") return;
    const academy = reduction4x4Academy;
    academy.status.classList.remove("error");
    academy.guide.classList.remove("error");
    academy.phases.replaceChildren();
    academy.current.hidden = true;
    academy.guide.hidden = true;
    academy.guide.textContent = "";
    academy.applyCentre.hidden = true;
    academy.applyCentre.disabled = true;
    academy.applyGuide.hidden = true;
    academy.applyGuide.disabled = true;
    academy.repairParity.hidden = true;
    academy.repairParity.disabled = true;
    academy.finish.hidden = true;
    academy.finish.disabled = true;
    if (size !== 4) {
      academy.status.textContent = "4×4 Reduction Academy is available for 4×4 states.";
      return;
    }
    if (recognized === null) {
      academy.status.textContent = "Enter a complete, physically valid 4×4 state to inspect reduction.";
      return;
    }
    const inspection = inspectReduction4x4(recognized.state);
    if (inspection.TAG === "Error") {
      academy.status.textContent = "This 4×4 state cannot be inspected for reduction.";
      academy.status.classList.add("error");
      return;
    }
    const progress = inspection._0;
    academy.status.textContent = `${progress.centreBlocksComplete}/6 centre blocks · ${progress.wingRowsPaired}/24 wing rows paired${progress.centreBlocksComplete === 6 && !progress.centreFrameValid ? " · centre colour frame needs rebuilding." : "."}`;
    academy.current.hidden = false;
    academy.current.textContent = progress.nextGoal;
    const centresDone = progress.centreBlocksComplete === 6 && progress.centreFrameValid;
    const wingsDone = progress.wingRowsPaired === 24;
    const reduced = wingsDone ? reduce4x4(recognized.state) : null;
    const parityKind = reduced?.TAG === "Error"
      ? reduced._0.message.startsWith("4×4 OLL parity detected:") ? "OLL"
      : reduced._0.message.startsWith("4×4 PLL parity detected:") ? "PLL"
      : null
      : null;
    const finishReady = reduced?.TAG === "Ok";
    const centreGuide = progress.stage === "centres"
      ? reductionGuide(recognized.state, "centre")
      : null;
    const centreGuideStep = centreGuide?.TAG === "Ok"
      ? centreGuide._0.frameRepair
        ? `Verified centre-frame repair: ${centreGuide._0.algorithm}. This reorders the monochrome centre blocks into a valid U/R/F frame without returning to wing pairing.`
        : `Next verified centre setup: ${centreGuide._0.algorithm}. This improves ${centreGuide._0.beforeBlocks}/6 to ${centreGuide._0.afterBlocks}/6 completed blocks${centreGuide._0.afterBlocks === centreGuide._0.beforeBlocks ? ` (centre grouping ${centreGuide._0.beforeScore}/24 → ${centreGuide._0.afterScore}/24)` : ""}.`
      : null;
    const outstandingWings = progress.wingRows
      .filter((row) => !row.complete)
      .map((row) => `${row.face} ${row.edge}: ${row.colours?.join("/") ?? "?"}`);
    academy.phases.append(
      reductionAcademyPhase(
        1,
        "Build the first centre blocks",
        "Centres are free-moving pieces: make a 1×2 bar, make a second matching bar, then join them into a 2×2 face block.",
        `${progress.centreBlocksComplete}/6 centre blocks`,
        centresDone,
        progress.stage === "centres" && progress.centreBlocksComplete < 2,
        [
          "Choose one colour and make a 1×2 bar with an inner-slice turn; keep it out of the working layer.",
          "Make a second bar of the same colour, align the two bars, then join them to complete the 2×2 centre block.",
          "Use the completed block to establish the colour scheme: its opposite centre must be the opposite cube colour.",
          ...(progress.centreBlocksComplete < 2 && centreGuideStep === null
            ? [centreGuide?._0.message ?? "Request another centre guide after one setup move."]
            : []),
          ...(progress.centreBlocksComplete < 2 && centreGuideStep !== null ? [centreGuideStep] : []),
        ],
      ),
      reductionAcademyPhase(
        2,
        "Complete all six centre blocks",
        "Solve opposite centres first, then hold completed faces on L/R while forming the remaining four blocks. This keeps every protected 2×2 block out of the active inner slice.",
        `${progress.centreBlocksComplete}/6 monochrome blocks · ${centresDone ? "centre stage complete" : progress.centreBlocksComplete === 6 ? "rebuild the invalid U/R/F colour frame" : "finish before wing pairing"}`,
        centresDone,
        progress.stage === "centres" && progress.centreBlocksComplete >= 2,
        [
          "Build the opposite 2×2 block with the first completed centre held on the bottom or back.",
          "For each side centre, form two 1×2 bars in the free layers, join them, then restore the inner slice you opened.",
          "Before moving on, verify four stickers of one colour occupy every completed centre block; do not treat a mixed 2×2 as solved.",
          ...(progress.centreBlocksComplete >= 2 && centreGuideStep === null
            ? [centreGuide?._0.message ?? "Request another centre guide after one setup move."]
            : []),
          ...(progress.centreBlocksComplete >= 2 && centreGuideStep !== null ? [centreGuideStep] : []),
        ],
      ),
      reductionAcademyPhase(
        3,
        "Pair the first 22 wing rows",
        outstandingWings.length === 0
          ? "Every visible two-sticker wing row agrees. The paired rows form the dedges for the reduced 3×3."
          : `Match each visible two-sticker wing row. Next unmatched rows: ${outstandingWings.join(" · ")}.`,
        `${progress.wingRowsPaired}/24 wing rows${outstandingWings.length === 0 ? "" : ` · ${outstandingWings.length} to pair`}`,
        wingsDone,
        progress.stage === "wings",
        [
          "Choose two wing pieces with the same two colours. Bring them to the U-layer working slots without disturbing completed centres.",
          "Use a slice–pair–restore cycle: open an inner U slice, use outer R/U/F turns to align the two wings, then restore that exact inner slice.",
          "Store each finished dedge away from the working slots. After every pair, check that both visible row stickers agree before choosing the next colours.",
        ],
      ),
      reductionAcademyPhase(
        4,
        "Resolve the last two wing pairs",
        "When ordinary slice pairing would break a finished dedge, use the last-two-edge sequence instead of forcing a normal pair.",
        wingsDone ? "Use only if two final wing pairs remain" : "Unlocked after the first wing pairs are stored",
        wingsDone,
        progress.stage === "wings" && progress.wingRowsPaired >= 20,
        [
          "Place the two unfinished pairs in the U-layer working lanes; use a U or whole-cube y adjustment first if needed.",
          "Apply the edge-flip sequence: R U R' F R' F' R. It flips the working wing while preserving the centre structure.",
          "For the standard last-two setup, use: u' R U R' F R' F' R u. Re-check the two rows and repeat only after a new setup move.",
        ],
      ),
      reductionAcademyPhase(
        5,
        "Recognise parity, then finish the reduced 3×3",
        "A 4×4 can show a last-layer case impossible on a 3×3. Repair it before the 3×3 handoff; otherwise continue with the verified finisher.",
        finishReady
          ? "Reduction and parity check complete — ready for the 3×3 handoff"
          : parityKind !== null
          ? `${parityKind} parity detected — apply the verified repair`
          : progress.stage === "reduced"
          ? "Check the remaining reduced-state parity before handoff"
          : "Locked until centres and wings are reduced",
        finishReady,
        progress.stage === "reduced",
        [
          "OLL parity: one dedge appears flipped in the last layer. Hold it at UF and use: r U2 x r U2 r U2 r' U2 l U2 r' U2 r U2 r' U2 r'.",
          "PLL parity: two dedges need a swap after the 3×3 last layer. Use: 2R2 U2 2R2 u2 2R2 u2.",
          "When no parity case remains, choose Continue with reduced 3×3 finish. The worker replay-verifies the outer-layer solution against this exact 4×4 state.",
        ],
      ),
    );
    if (progress.stage === "centres") {
      const guide = centreGuide!;
      academy.guide.hidden = false;
      if (guide.TAG === "Ok") {
        const result = guide._0.afterBlocks > guide._0.beforeBlocks
          ? `${guide._0.beforeBlocks}/6 → ${guide._0.afterBlocks}/6 centre blocks`
          : `centre grouping score ${guide._0.beforeScore}/24 → ${guide._0.afterScore}/24`;
        academy.guide.textContent = `Next verified centre setup: ${guide._0.algorithm} · ${result}.`;
        academy.applyCentre.hidden = false;
        academy.applyCentre.disabled = false;
      } else {
        academy.guide.textContent = guide._0.message;
        academy.guide.classList.toggle("error", guide.TAG === "Error");
      }
    }
    if (progress.stage === "wings") {
      const guide = reductionGuide(recognized.state, "wing");
      academy.guide.hidden = false;
      if (guide.TAG === "Ok") {
        academy.guide.textContent = `Next verified pair: ${guide._0.algorithm} · ${guide._0.before}/24 → ${guide._0.after}/24 wing rows. This sequence preserves all six centre blocks.`;
        academy.applyGuide.hidden = false;
        academy.applyGuide.disabled = false;
      } else {
        academy.guide.textContent = guide._0.message;
        academy.guide.classList.toggle("error", guide.TAG === "Error");
      }
    }
    if (parityKind !== null) {
      const repair = parityKind === "OLL"
        ? planOLLParityRepair4x4(recognized.state)
        : planPLLParityRepair4x4(recognized.state);
      academy.guide.hidden = false;
      academy.guide.textContent = repair.TAG === "Ok"
        ? `${parityKind} parity is present in the reduced state. Apply: ${repair._0.algorithm}. The replay preserves centres and paired wings, then makes the 3×3 handoff legal.`
        : repair._0.message;
      academy.guide.classList.toggle("error", repair.TAG === "Error");
      academy.repairParity.hidden = repair.TAG !== "Ok";
      academy.repairParity.disabled = repair.TAG !== "Ok";
      academy.repairParity.textContent = `Apply ${parityKind}-parity repair`;
    }
    academy.finish.hidden = !finishReady;
    academy.finish.disabled = !finishReady;
  };

  const renderReduction5x5Academy = (recognized: RecognizedInput | null) => {
    if (activeTab !== "academy" || academyMethod !== "reduction5x5") return;
    const academy = reduction5x5Academy;
    academy.status.classList.remove("error");
    academy.phases.replaceChildren();
    academy.current.hidden = true;
    academy.guide.hidden = true;
    academy.guide.classList.remove("error");
    academy.applyCentre.hidden = true;
    academy.applyCentre.disabled = true;
    academy.findBar.hidden = true;
    academy.findCycle.hidden = true;
    academy.findL2E.hidden = true;
    academy.repairParity.hidden = true;
    academy.repairParity.disabled = true;
    academy.applyWing.hidden = true;
    academy.applyWing.disabled = true;
    if (size !== 5) {
      academy.status.textContent = "5×5 Reduction Academy is available for 5×5 states.";
      return;
    }
    if (recognized === null) {
      academy.status.textContent = "Enter a complete, physically valid 5×5 state to inspect reduction.";
      return;
    }
    const inspection = inspectReduction5x5(recognized.state);
    if (inspection.TAG === "Error") {
      academy.status.textContent = inspection._0.message;
      academy.status.classList.add("error");
      return;
    }
    const progress = inspection._0;
    academy.status.textContent = `${progress.centreFacesComplete}/6 3×3 centres · ${progress.xCentresComplete}/6 X-centre sets · ${progress.plusCentresComplete}/6 +‑centre sets · ${progress.wingPairsMatched}/24 wing pairs.`;
    academy.current.hidden = false;
    academy.current.textContent = progress.nextGoal;
    academy.phases.append(
      reductionAcademyPhase(1, "Build six 3×3 centres", "Each fixed core defines its face colour. Complete the diagonal X-centres and orthogonal +-centres around it before calling a centre solved.", `${progress.centreFacesComplete}/6 faces · X ${progress.xCentresComplete}/6 · + ${progress.plusCentresComplete}/6`, progress.centreFacesComplete === 6, progress.stage === "centres", ["Beginner pair: 2R U 2R' U'. Opposite-centre insert: 2U' Rw U Rw'.", "Make matching 1×3 bars with inner slices, store them, then join them around the fixed core.", "Keep completed centres on protected faces; verify all eight movable centres match their core."]),
      reductionAcademyPhase(2, "Pair wings around fixed middle edges", "Each edge has a fixed middle edge and two movable wings. Pair both wings to form one reduced dedge.", `${progress.wingPairsMatched}/24 wing pairs`, progress.wingPairsMatched === 24, progress.stage === "wings", ["Beginner dedge setup: 2L' U L U' 2L. Set up a matching wing pair, insert it, then restore protected centres.", "Use the fixed middle edge as the colour reference; do not pair wings by surface colour alone.", "The bounded guide tries only centre-preserving slice–setup–restore cycles."]),
      reductionAcademyPhase(3, "Solve the reduced 3×3 and parity", "Validate every wing against its fixed middle edge, then solve the projected 3×3. Apply a parity sequence only when replay verification identifies that exact case.", progress.stage === "handoff" ? "Milestones reached · validating projection" : "Locked", false, progress.stage === "handoff", ["OLL parity: 2R U2 2L F2 2L' F2 2R2 U2 2R U2 2L' U2 2R' U2 2R2.", "PLL parity: Rw2 F2 U2 2R U2 Rw' U2 2L U2 Rw U2 F2 Rw2.", "The inspector never labels a partly reduced 5×5 as a solved 3×3."]),
    );
    if (progress.stage === "centres") {
      const guide = reductionGuide(recognized.state, "centre");
      const key = FaceletCodec.render(recognized.state);
      reduction5x5ImmediateGuide = guide.TAG === "Ok" ? guide._0 : null;
      reduction5x5ImmediateGuideKey = key;
      academy.guide.hidden = false;
      if (guide.TAG === "Ok") {
        academy.guide.textContent = guide._0.kind === "bar"
          ? `Next replay-verified bar setup: ${guide._0.algorithm} · core-aligned 1×3 bars ${guide._0.barsBefore} → ${guide._0.barsAfter}; centre score temporarily ${guide._0.before}/48 → ${guide._0.after}/48.`
          : guide._0.kind === "orbit"
            ? `Next replay-verified centre-orbit setup: ${guide._0.algorithm} · completed X/+ centre orbits ${guide._0.completedBefore} → ${guide._0.completedAfter}; centre score ${guide._0.before}/48 → ${guide._0.after}/48.`
          : `Next replay-verified centre setup: ${guide._0.algorithm} · centre score ${guide._0.before}/48 → ${guide._0.after}/48.`;
        academy.applyCentre.hidden = false;
        academy.applyCentre.disabled = false;
      } else {
        if (reduction5x5BarGuide !== null && reduction5x5BarKey === key) {
          academy.guide.textContent = `Replay-verified 1×3 bar commutator: ${reduction5x5BarGuide.algorithm} · core-aligned bars ${reduction5x5BarGuide.barsBefore} → ${reduction5x5BarGuide.barsAfter}.`;
          academy.guide.classList.remove("error");
          academy.applyCentre.hidden = false;
          academy.applyCentre.disabled = false;
        } else if (reduction5x5CycleGuide !== null && reduction5x5CycleKey === key) {
          academy.guide.textContent = `Replay-verified ${reduction5x5CycleGuide.kind === "plusCycle" ? "+-centre" : "X-centre"} cycle: ${reduction5x5CycleGuide.algorithm}.`;
          academy.guide.classList.remove("error");
          academy.applyCentre.hidden = false;
          academy.applyCentre.disabled = false;
        } else {
          academy.guide.textContent = guide._0.message;
          academy.guide.classList.toggle("error", guide.TAG === "Error");
          academy.findBar.hidden = guide.TAG !== "Error";
          academy.findBar.disabled = reduction5x5BarBusy;
          academy.findBar.textContent = reduction5x5BarBusy ? "Stop bar-commutator search" : "Find 1×3 bar commutator";
          academy.findCycle.hidden = guide.TAG !== "Error";
          academy.findCycle.disabled = reduction5x5CycleBusy;
          academy.findCycle.textContent = reduction5x5CycleBusy ? "Stop centre-cycle search" : "Try bounded X-centre cycle";
        }
      }
    }
    if (progress.stage === "wings") {
      const guide = reductionGuide(recognized.state, "wing");
      academy.guide.hidden = false;
      if (guide.TAG === "Ok") {
        academy.guide.textContent = `Next replay-verified wing cycle: ${guide._0.algorithm} · ${guide._0.before}/24 → ${guide._0.after}/24 matched wing pairs; all six centres remain complete.`;
        academy.applyWing.hidden = false;
        academy.applyWing.disabled = false;
      } else if (reduction5x5L2EGuide !== null && reduction5x5L2EKey === FaceletCodec.render(recognized.state)) {
        academy.guide.textContent = `Replay-verified last-two-edges relation: ${reduction5x5L2EGuide.algorithm} · ${reduction5x5L2EGuide.before}/24 → ${reduction5x5L2EGuide.after}/24 matched wing pairs; all six centres remain complete.`;
        academy.guide.classList.remove("error");
        academy.applyWing.hidden = false;
        academy.applyWing.disabled = false;
      } else {
        academy.guide.textContent = guide._0.message;
        academy.guide.classList.toggle("error", guide.TAG === "Error");
        if (guide.TAG === "Error" && progress.wingPairsMatched === 22) {
          academy.findL2E.hidden = false;
          academy.findL2E.disabled = reduction5x5L2EBusy;
          academy.findL2E.textContent = reduction5x5L2EBusy ? "Stop last-two-edges search" : "Find last-two-edges relation";
        }
      }
    }
    if (progress.stage === "handoff") {
      const reduced = reduce5x5(recognized.state);
      academy.guide.hidden = false;
      const parityKind = reduced.TAG === "Error" && reduced._0.message.startsWith("5×5 PLL parity detected:")
        ? "PLL"
        : reduced.TAG === "Error" && reduced._0.message.startsWith("5×5 OLL parity detected:")
          ? "OLL"
          : null;
      academy.guide.textContent = reduced.TAG === "Ok"
        ? "Reduced 3×3 projection is physically valid. The replay-verified 5×5 finisher is the next increment."
        : reduced._0.message;
      academy.guide.classList.toggle("error", reduced.TAG === "Error");
      academy.repairParity.hidden = parityKind === null;
      academy.repairParity.disabled = parityKind === null;
      academy.repairParity.textContent = parityKind === null ? "Apply parity repair" : `Apply ${parityKind}-parity repair`;
    }
  };

  const petrus5x5Evaluation = createPetrus5x5EvaluationCache();

  const renderPetrus5x5Academy = (recognized: RecognizedInput | null) => {
    if (activeTab !== "academy" || academyMethod !== "petrus5x5") {
      petrus5x5Evaluation.evaluate(null, false);
      return;
    }
    const academy = petrus5x5Academy;
    academy.status.classList.remove("error");
    academy.phases.replaceChildren();
    academy.current.hidden = true;
    academy.guide.hidden = true;
    academy.guide.classList.remove("error");
    academy.step.hidden = true;
    academy.step.disabled = true;

    if (size !== 5) {
      petrus5x5Evaluation.evaluate(null, false);
      academy.status.textContent = "5×5 Petrus Academy is available for 5×5 states.";
      return;
    }
    if (recognized === null) {
      petrus5x5Evaluation.evaluate(null, false);
      academy.status.textContent = "Enter a complete, physically valid 5×5 state to inspect Petrus block building.";
      return;
    }

    const evaluation = petrus5x5Evaluation.evaluate(recognized.state, true);
    const status = evaluation?.status;
    if (status == null) {
      academy.status.textContent = "Unable to inspect 5×5 Petrus geometry for this state.";
      academy.status.classList.add("error");
      return;
    }

    academy.status.textContent = `${status.bestAnchor} anchor · 2×2×2: ${status.block222Progress.piecesSolved}/19 · 2×2×3: ${status.block223Progress.piecesSolved}/24 · EO: ${status.eoStatus.badCount} bad · Wings: ${status.wingsPaired}/24.`;
    academy.current.hidden = false;
    academy.current.textContent = status.milestoneDescription;

    academy.phases.append(
      reductionAcademyPhase(
        1,
        petrus5x5PhaseDefinitions[0].title,
        "Anchor on the corner with the most solved pieces and assemble the 19-piece composite block with zero cube rotations.",
        `${status.block222Progress.piecesSolved}/19 pieces · ${status.block222Progress.faceletsSolved}/27 facelets`,
        status.block222Progress.isComplete,
        status.phaseNumber === 1,
        [
          "Available moves depend on the anchor; automatic guides are replayed and checked for progress.",
          "Assemble center quadrants first, then pair flanking wings with midges.",
          "Recommended anchor: " + status.bestAnchor + ".",
        ]
      ),
      reductionAcademyPhase(
        2,
        petrus5x5PhaseDefinitions[1].title,
        "Extend the 2×2×2 block by adding a 1×3 center bar and edge pair along one face, expanding the block to 24 pieces.",
        `${status.block223Progress.piecesSolved}/24 pieces · Axis ${status.block223Progress.axis}`,
        status.block223Progress.isComplete,
        status.phaseNumber === 2,
        [
          "Automatic expansion guides must preserve the completed corner block.",
          "Add the center 1×3 bar, then join the edge cluster.",
        ]
      ),
      reductionAcademyPhase(
        3,
        petrus5x5PhaseDefinitions[2].title,
        petrus5x5PhaseDefinitions[2].instruction,
        `${status.eoStatus.orientedCount}/12 oriented · ${status.eoStatus.badCount} bad edges`,
        status.eoStatus.isComplete,
        status.phaseNumber === 3,
        [
          "Identify bad midges by their primary U/D or F/B facelet orientation.",
          "Use short F/B triggers (e.g. F R U R' F' or F' U F) to flip bad edge pairs into good ones.",
        ]
      ),
      reductionAcademyPhase(
        4,
        petrus5x5PhaseDefinitions[3].title,
        petrus5x5PhaseDefinitions[3].instruction,
        `${status.wingsPaired}/24 paired wings`,
        status.wingsPaired === 24,
        status.phaseNumber === 4,
        [
          "Pre-pair wings using slice-and-replace so that F2L turns into standard 3×3 Petrus inserts.",
          "Keep the lower F2L slots protected while cycling wings.",
        ]
      ),
      reductionAcademyPhase(
        5,
        petrus5x5PhaseDefinitions[4].title,
        petrus5x5PhaseDefinitions[4].instruction,
        status.phaseNumber === 6 ? "Solved!" : "Ready for LL",
        status.phaseNumber === 6,
        status.phaseNumber === 5,
        [
          "Since edges are already oriented, skip OLL and go straight to COLL.",
          "Cycle corners and edges with EPLL.",
          "OLL parity: Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'.",
        ]
      )
    );

    const guide = evaluation!.guide;
    if (guide !== null) {
      const actionable = guide.algorithm.length > 0;
      academy.guide.hidden = false;
      academy.guide.textContent = `${guide.title}: ${guide.instruction}${actionable ? ` (Suggested: ${guide.algorithm})` : ""}`;
      academy.step.hidden = !actionable;
      academy.step.disabled = !actionable;
    }
  };

  const updateAcademyMethodControls = () => {
    const reductionMode = academyMethod === "reduction4x4" || academyMethod === "reduction5x5" || academyMethod === "petrus5x5";
    const twoByTwoMode = academyMethod === "twoByTwoBeginner" || academyMethod === "twoByTwoPetrus";
    academySharedActions.forEach((control) => { control.hidden = reductionMode; });
    [academyInstantDrill, academyWcaDrill, academyLoadDrill, academyRandomDrill].forEach((control) => {
      control.hidden = reductionMode || twoByTwoMode;
    });
    academyDrillFamily.closest<HTMLElement>(".academy-target-input")!.hidden = reductionMode || twoByTwoMode;
    academyDrillCase.closest<HTMLElement>(".academy-target-input")!.hidden = reductionMode || twoByTwoMode;
    if (academyTargetControl) academyTargetControl.hidden = reductionMode || twoByTwoMode;
    if (reductionMode || twoByTwoMode) academyComparison.hidden = true;
  };

  const updateAcademySource = (recognized: RecognizedInput | null) => {
    if (recognized === null || activeRecognized === null
      || FaceletCodec.render(recognized.state) !== FaceletCodec.render(activeRecognized.state)) {
      reductionGuideCache.clear();
    }
    academyRequestGuard.invalidate();
    academySolveBusy = false;
    activeRecognized = recognized;
    resetAcademy();
    academies.forEach((academy) => {
      academy.status.classList.remove("error");
      academy.status.textContent = size !== (academy.method === "twoByTwoBeginner" || academy.method === "twoByTwoPetrus" ? 2 : 3)
        ? `${academy.label} Academy is available for ${academy.method === "twoByTwoBeginner" || academy.method === "twoByTwoPetrus" ? "2×2" : "3×3"} states.`
        : recognized === null
          ? "Enter a valid 3×3 state to begin."
          : isSolvedState(recognized.state) && academyTarget.value.trim() === ""
            ? "This cube is already solved. Every Academy phase is satisfied at 0 HTM; load a scramble for a non-zero tutorial."
            : `Ready to teach the recognized ${recognized.label.toLowerCase()} setup to the selected target pattern.`;
    });
    renderReduction4x4Academy(recognized);
    renderReduction5x5Academy(recognized);
    renderPetrus5x5Academy(recognized);
    const diagnostic = academyTargetDiagnostic();
    const method = selectedTutorialMethod();
    if (diagnostic !== null && method !== null) {
      const academy = academyForMethod(method);
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
    sse: "SSE / CubeTwister",
    acube: "ACube 4",
  };
  const compatibilitySuccess: Record<keyof CompatibilityResult, string> = {
    wca: "Uses only the WCA Article 12 move-token subset. This does not determine event-specific competition legality.",
    signLgn: "The original source fits the normative SiGN/LGN grammar used by this profile.",
    cubingJs: "The original source is portable to the documented cubing.js/Twizzle algorithm grammar.",
    speedsolving: "The original source uses conventions documented by the SpeedSolving Wiki profile.",
    ruwix: "The original source uses move forms documented by Ruwix Advanced notation.",
    sse: "The original source fits Randelshofer's SSE 2×2–5×5 / CubeTwister notation.",
    acube: "The original source fits ACube 4's 3×3 turn notation.",
  };

  const updateCompatibility = (recognized: RecognizedInput | null) => {
    compatibilityStrip.hidden = !recognized?.timeline;
    if (!recognized?.timeline) return;
    // A tape is described by Moves whenever it is present. Setup is only the
    // position-zero state, so assessing it here would report the wrong source
    // profile for a pasted SSE (or Twizzle) move sequence.
    const source = movesInput.value.trim() === "" ? input.value : movesInput.value;
    const result = MoveCompatibility.evaluate(
      source,
      lowercaseMode,
      dialectForPastedInput(source),
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
        : button.dataset.algTransform === "optimize-regrips"
          || button.dataset.algTransform === "expand-regrips"
          ? !available || size < 2 || size > 5
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
      updateSmartCubeGuideUi();
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
    updateSmartCubeGuideUi();
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
        const quarterTurn = rotationStep.turns < 0 ? -1 : 1;
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

  const canRecordSmartCube = () =>
    smartCubeConnected
    && size === 3
    && smartCubeSyncMode === "PhysicalMirror"
    && activeTab !== "academy"
    && !smartCubeGuidedTape
    && !smartCubeCoachingWaiting
    && hamiltonStream === null
    && !macroDefinition.test(movesInput.value);

  const canGuideSmartCube = () =>
    smartCubeConnected
    && (size === 2 || size === 3)
    && smartCubeSyncMode === "PhysicalMirror"
    && activeTab !== "academy"
    && !smartCubeRecording
    && !smartCubeRecovery
    && hamiltonStream === null
    && activeTimeline !== null
    && activeTimeline.states !== null
    && activeIndex < activeTimeline.steps.length;

  const updateSmartCubeGuideUi = () => {
    const active = smartCubeGuidedTape && smartCubeCoachingWaiting;
    const available = active || canGuideSmartCube();
    playbackGuide.disabled = !available;
    playbackGuide.classList.toggle("active", active);
    playbackGuide.setAttribute("aria-pressed", String(active));
    playbackGuide.setAttribute(
      "aria-label",
      active ? "Stop smart-cube turn guidance" : "Guide turns with smart cube",
    );
    playbackGuide.title = active
      ? "Stop guided turns"
      : available
        ? "Guide the next tape turn with the connected smart cube"
        : "Connect a 2×2 or 3×3 smart cube and choose a playable tape position";
  };

  const updateSmartCubeRecordingUi = () => {
    const available = canRecordSmartCube();
    if (smartCubeRecording && !available) {
      smartCubeRecording = false;
      smartCubeRecordingState = null;
      smartCubeRecordingTapePresented = false;
      smartCubeRecordingFrame = [];
      cancelSmartCubeRecordingAnimation();
      smartCubeRecordingTapeDirty = false;
    }
    playbackRecord.disabled = !available;
    playbackRecord.classList.toggle("active", smartCubeRecording);
    playbackRecord.setAttribute("aria-pressed", String(smartCubeRecording));
    playbackRecord.setAttribute(
      "aria-label",
      smartCubeRecording ? "Stop smart-cube recording" : "Start smart-cube recording",
    );
    playbackRecord.title = available
      ? smartCubeRecording
        ? "Stop recording physical smart-cube turns"
        : "Record physical smart-cube turns into Moves"
      : "Connect an eligible smart cube outside Academy to record physical turns";
    updateSmartCubeGuideUi();
  };

  const appendSmartCubeRecordingToken = (token: string) => {
    if (!smartCubeRecording) return;
    const next = appendRecordedMove(movesInput.value, token);
    if (next.length > 20_000) {
      smartCubeRecording = false;
      smartCubeRecordingState = null;
      smartCubeRecordingTapePresented = false;
      smartCubeRecordingFrame = [];
      cancelSmartCubeRecordingAnimation();
      smartCubeStatus.textContent = "Smart-cube recording stopped: Moves reached the 20,000-character limit.";
      updateSmartCubeRecordingUi();
      return;
    }
    // The physical move has already animated live. Rebuilding Moves must not
    // start the ordinary tape-extension animation over the same turn.
    suppressNextSmartCubeExtension = true;
    smartCubeRecordingTapeDirty = true;
    store.patch({moves: next});
  };

  const renderSmartCubeRecordingState = () => {
    if (!smartCubeRecordingState) return;
    const label = `${smartCubeDeviceName} · Recording tape`;
    renderState(smartCubeRecordingState, label);
    updatePatternDetection({state: smartCubeRecordingState, label});
  };

  const advanceSmartCubeRecordingState = (token: string) => {
    const step = smartCubeStep(token);
    if (!step || !smartCubeRecordingState) return;
    smartCubeRecordingState = MoveExecutor.applyStep(smartCubeRecordingState, step) as CubeState;
    renderSmartCubeRecordingState();
  };

  const animateSmartCubeRecordingToken = (token: string): Promise<void> => {
    const generation = smartCubeRecordingAnimationGeneration;
    smartCubeRecordingAnimation = smartCubeRecordingAnimation
      .then(async () => {
        const step = smartCubeStep(token);
        const transform = step ? turnTransform(size, step) : null;
        if (transform && viewport) await viewport.animateTurn(transform, 120);
        if (generation !== smartCubeRecordingAnimationGeneration || !smartCubeRecording) return;
        advanceSmartCubeRecordingState(token);
      })
      .catch((reason) => {
        smartCubeStatus.textContent = reason instanceof Error ? reason.message : String(reason);
      });
    return smartCubeRecordingAnimation;
  };

  const cancelSmartCubeRecordingAnimation = () => {
    smartCubeRecordingAnimationGeneration += 1;
    smartCubeRecordingAnimation = Promise.resolve();
  };

  const renderTimelineIndex = (index: number) => {
    if (!activeTimeline?.states) return;
    activeIndex = Math.max(0, Math.min(index, activeTimeline.steps.length));
    renderState(activeTimeline.states[activeIndex], status.textContent ?? "Algorithm");
    refreshTutorialFocus();
    updatePlaybackUi();
    syncMoveRibbon(activeIndex);
    restoreIdleTurnGuide();
  };

  const setSmartCubeTimelineIndex = (index: number) => {
    if (!activeTimeline) return;
    activeIndex = Math.max(0, Math.min(index, activeTimeline.steps.length));
    refreshTutorialFocus();
    updatePlaybackUi();
    syncMoveRibbon(activeIndex);
    restoreIdleTurnGuide();
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
    appendPreviewHistoryToken(formatStep(animatedStep));
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
    appendPreviewHistoryToken(event.token);
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
    // The gyro view never mirrors raw orientation directly (see handleSmartCubeEvent's
    // "orientation" case): it only moves in response to a confirmed regrip, via
    // reconcileDeviceOrientation. While tracking is active there is nothing to sync
    // here — the camera stays wherever the last confirmed regrip (or manual orbit)
    // left it. This still clears device tracking outright when it shouldn't apply
    // at all (tracking off, recording, or a still-guided coaching wait).
    if (
      smartCubeOrientationTracking
      && !smartCubeRecording
      && !smartCubeRecordingTapePresented
      && (!smartCubeCoachingWaiting || smartCubeSyncMode === "VirtualController")
    ) {
      return;
    }
    viewport?.setDeviceOrientation(null);
  };

  const waitForSmartCubeMove = () => {
    if (!smartCubeConnected || !activeTimeline?.states) return;
    const virtualController = smartCubeSyncMode === "VirtualController";
    clearTutorialFocus();
    clearTurnGuide();
    stopPlayback();
    if (smartCubeRecovery) {
      smartCubeCoachingFrameActive = !virtualController;
      if (!virtualController) renderSmartCubeCoachingState();
      showSmartCubeRecoveryGuide();
      syncSmartCubeTrackedOrientation();
      return;
    }
    smartCubeCoachingFrameActive = !virtualController;
    // Hardware facelets stay in the sensor's fixed frame. During coaching the
    // timeline owns presentation so a confirmed x/y/z regrip cannot be erased
    // by the next face packet.
    // Controller mode is intentionally different: its virtual state owns the
    // presentation, while the timeline only supplies coaching progress.
    if (!virtualController) renderSmartCubeCoachingState();
    const action = nextExpectedSmartCubeAction(
      activeTimeline.steps,
      activeTimeline.labels,
      activeIndex,
    );
    if (!action) {
      smartCubeHalfTurnProgress = null;
      smartCubeGuidedTape = false;
      syncSmartCubeTrackedOrientation();
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Timeline complete`;
      coachStatus.textContent = "Physical sequence complete.";
      updateSmartCubeGuideUi();
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
      smartCubeRotationWait = {
        action,
        generation,
        completedQuarterTurns: 0,
      };
      if (smartCubeOrientationTracking) {
        smartCubeStatus.textContent = `${smartCubeDeviceName} · Waiting for ${action.token} regrip`;
        coachStatus.textContent = `Rotate the physical cube ${action.token}. Regrip core will continue automatically.`;
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
    animate = true,
  ): Promise<void> => {
    smartCubeHalfTurnProgress = assessment.progress;
    waitForSmartCubeMove();
    if (animate) await animateSmartCubeMove(assessment.received, assessment.expected.timelineIndex);
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
    animate = true,
  ): Promise<void> => {
    const progress = smartCubeHalfTurnProgress;
    recordSmartCubeMistake(assessment.expected.token, assessment.received);
    if (animate) await animateSmartCubeMove(move, assessment.expected.timelineIndex);

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

  const applyWaitingTimelineMove = async (move: string, animate = true): Promise<boolean> => {
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
      }, move, animate);
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
      await applyPartialHalfTurn(assessment, animate);
      waitForSmartCubeMove();
      return true;
    }
    if (assessment.status === "unsupported") {
      smartCubeHalfTurnProgress = null;
      smartCubeStatus.textContent = `Expected ${assessment.expected.token}; received unsupported ${assessment.received}`;
      if (animate) await animateSmartCubeMove(move, assessment.expected.timelineIndex);
      return true;
    }
    if (assessment.status === "mismatch") {
      await applySmartCubeMismatch(assessment, move, animate);
      return true;
    }
    const moveIndex = assessment.expected.timelineIndex;
    smartCubeHalfTurnProgress = null;
    if (!assessment.completedHalfTurn && activeIndex !== moveIndex) setSmartCubeTimelineIndex(moveIndex);
    if (animate) await animateSmartCubeMove(move, moveIndex);
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
    // Controller mode deliberately decouples the virtual puzzle from the
    // physical stickers. A pending AppState update must not repaint the old
    // hardware facelets over an instant virtual scramble.
    if (smartCubeSyncMode === "VirtualController") return;
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
    const state = reduceSmartCubeMirrorInput(
      base,
      {kind: "move", move: record.move},
      (previous, move) => {
        const step = smartCubeStep(move);
        return step ? MoveExecutor.applyStep(previous, step) as CubeState : previous;
      },
    );
    if (!state) return;
    smartCubeRenderedState = state;
    smartCubeLiveState = state;
    updateManualStateSmartCubeControl();
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
    if (enabled && smartCubeRecording) {
      smartCubeRecording = false;
      smartCubeRecordingState = null;
      smartCubeRecordingTapePresented = false;
      smartCubeRecordingFrame = [];
      cancelSmartCubeRecordingAnimation();
      smartCubeRecordingTapeDirty = false;
    }
    if (enabled) smartCubeGuidedTape = false;
    smartCubeSyncMode = enabled ? "VirtualController" : "PhysicalMirror";
    smartCubeControllerInspection = false;
    smartCubeControllerOrientation = [];
    smartCubeController.classList.toggle("active", enabled);
    smartCubeController.setAttribute("aria-pressed", String(enabled));
    smartCubeDock.dataset.syncMode = enabled ? "controller" : "mirror";
    updateSmartCubeRecordingUi();
    window.dispatchEvent(new CustomEvent("cubelab:controller-mode", {detail: {enabled}}));
    if (enabled) {
      // AppState writes the new Setup synchronously but recognizes it on the
      // next animation frame. Read the editor now so enabling Controller
      // immediately after Quick load cannot resurrect the previous solved
      // `activeRecognized` state.
      const workspace = parseWorkspaceState();
      const state = workspace.TAG === "Ok"
        ? workspace._0.state
        : activeRecognized?.state
        ?? (StateTypes.solved(3) as Result<CubeState, unknown>)._0;
      if (!state) return;
      loadVirtualControllerState(
        state,
        workspace.TAG === "Ok"
          ? `Virtual controller · ${workspace._0.label}`
          : "Virtual controller · choose New scramble or an Academy case",
      );
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Controller mode: physical stickers are ignored.`;
      return;
    }
    smartCubeControllerState = null;
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Physical mirror restored. Sync state before using physical tracking.`;
    renderSmartCubeLiveState();
  };

  const mirrorSmartCubeFaceletsToInput = (rawFacelets: string) => {
    const facelets = toSpacedFacelets(rawFacelets, 3);
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
    }
    // The Timer workspace receives every projected controller turn, not merely
    // the first one, so a saved smart-cube solve can be replayed elsewhere.
    window.dispatchEvent(new CustomEvent("cubelab:controller-turn", {
      detail: {move: projectedMove, atMs: performance.now()},
    }));
    const transform = turnTransform(3, step);
    if (transform && viewport) await viewport.animateTurn(transform, 120);
    const next = MoveExecutor.applyStep(state, step) as CubeState;
    smartCubeControllerState = next;
    renderState(next, `Virtual controller · ${projectedMove}`);
    updatePatternDetection({state: next, label: "Virtual controller"});
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Virtual ${projectedMove}`;
    const continueCoaching = smartCubeCoachingWaiting;
    if (continueCoaching) {
      // The controller has already animated and applied the projected turn to
      // its own virtual state. Reuse the timeline matcher solely for coached
      // progress, otherwise a correct controller packet leaves the tape at
      // its current move forever.
      await applyWaitingTimelineMove(projectedMove, false);
      if (smartCubeCoachingWaiting || smartCubeRecovery) waitForSmartCubeMove();
    }
    if (controllerStateIsSolved(next)) {
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Virtual cube solved`;
      window.dispatchEvent(new Event("cubelab:controller-solved"));
    }
  };

  const applySmartCubeMove = async (record: QueuedSmartCubeMove): Promise<void> => {
    const move = record.move;
    const displayMove = record.solverMove ?? move;
    // console.log("[SmartCube Move] Received physical face move from Bluetooth:", move);
    if (smartCubeSyncMode === "VirtualController") {
      if (!record.omitPreviewHistory) appendPreviewHistoryToken(move);
      await applyVirtualControllerMove(move);
      return;
    }
    if (smartCubeRecording) {
      // Keep the body move used by the live viewport and recorded physical
      // tape distinct from core's solver/history token. Applying solver moves
      // to either physical path would compensate a gyro regrip twice.
      const tapeMove = record.source === "regrip-core"
        ? move
        : controllerMoveInViewportFrame(move, smartCubeRecordingFrame);
      const historyMove = record.source === "regrip-core" ? displayMove : tapeMove;
      if (!record.omitPreviewHistory) appendPreviewHistoryToken(historyMove);
      appendSmartCubeRecordingToken(tapeMove);
      await animateSmartCubeRecordingToken(tapeMove);
      return;
    }
    if (!record.omitPreviewHistory) appendPreviewHistoryToken(displayMove);
    // A fresh physical turn resumes the normal mirror after a recording
    // session deliberately left the recorded tape in view.
    smartCubeRecordingTapePresented = false;
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

  const setSmartCubeOrientationTracking = (enabled: boolean) => {
    const wasTracking = smartCubeOrientationTracking;
    smartCubeOrientationTracking = enabled && smartCubeConnected && !smartCubeOrientation.hidden;
    smartCubeOrientation.classList.toggle("active", smartCubeOrientationTracking);
    smartCubeOrientation.setAttribute("aria-pressed", String(smartCubeOrientationTracking));
    smartCubeRecenter.disabled = !smartCubeOrientationTracking;
    if (smartCubeOrientationTracking) {
      setAutoOrbitEnabled(false, false);
      autoOrbitButton.disabled = true;
      settingsAutoOrbit.disabled = true;
    } else {
      autoOrbitButton.disabled = !viewport;
      settingsAutoOrbit.disabled = !viewport;
      setAutoOrbitEnabled(autoOrbit, false);
      viewport?.setRegripGauge(null);
    }
    syncSmartCubeTrackedOrientation();
    smartCubeGestureRecenter.enabled = smartCubeOrientationTracking && !smartCubeRecording;
    if (!smartCubeOrientationTracking) smartCubeGestureRecenter.reset();
    if (wasTracking && !smartCubeOrientationTracking && smartCubeRotationWait) {
      waitForSmartCubeMove();
    }
  };

  const renderSmartCubeReplay = () => {
    const replay = smartCubeReplayControlsApi;
    smartCubeReplayControls.hidden = replay === null || !smartCubeConnected;
    if (!replay || !smartCubeConnected) return;
    const state = replay.getReplayState();
    smartCubeReplayPlay.textContent = state.status === "playing" ? "Pause" : "Play";
    smartCubeReplayPlay.setAttribute("aria-pressed", String(state.status === "playing"));
    smartCubeReplaySeek.max = String(state.durationMs);
    smartCubeReplaySeek.value = String(state.offsetMs);
    smartCubeReplayRate.value = String(state.rate);
    smartCubeReplayPosition.value = `${state.offsetMs} ms · ${state.eventIndex}`;
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
      const streamReadyMs = connectionState.device.timing?.streamReadyMs;
      const timing = streamReadyMs === undefined
        ? ""
        : ` · stream ready ${Math.round(streamReadyMs)}ms`;
      smartCubeStatus.textContent = smartCubeMockMode
        ? `Mock · ${connectionState.device.name} · Replay`
        : smartCubeReplayControlsApi
        ? `${connectionState.device.brandName} · ${connectionState.device.name} · Replay${timing}`
        : `${connectionState.device.brandName} · ${connectionState.device.name} · Live sync${timing}`;
      if (smartCubeMockMode) smartCubeQaSession.textContent = `${connectionState.device.name} · loaded`;
      const supportsOrientation = connectionState.device.capabilities.orientation;
      const supportsFacelets = connectionState.device.capabilities.facelets;
      smartCubeSupportsFacelets = supportsFacelets;
      const supportsReset = connectionState.device.capabilities.reset;
      const supportsBattery = connectionState.device.capabilities.battery;
      smartCubeRecordCapability.hidden = false;
      smartCubeRecordCapability.textContent = supportsFacelets
        ? supportsOrientation
          ? "Record · verified + gyro"
          : "Record · verified moves"
        : supportsOrientation
          ? "Record · moves + gyro"
          : "Record · moves only";
      smartCubeBattery.hidden = !supportsBattery;
      if (supportsBattery && (!wasConnected || !smartCubeBattery.textContent)) smartCubeBattery.textContent = "🔋 checking…";
      smartCubeSync.hidden = !supportsFacelets;
      smartCubeSync.disabled = !supportsFacelets;
      smartCubeResetState.hidden = !supportsReset;
      smartCubeResetState.disabled = !supportsReset;
      if (!wasConnected && supportsFacelets) smartCubeStateSyncPending = true;
      smartCubeOrientation.hidden = !supportsOrientation;
      smartCubeOrientation.disabled = !supportsOrientation;
      smartCubeRecenter.hidden = !supportsOrientation;
      smartCubeRecenter.disabled = !supportsOrientation;
      smartCubeDiagnostics.hidden = false;
      smartCubeCopyTrace.hidden = false;
      updateSmartCubeDiagnosticsUi();
      smartCubeController.hidden = false;
      smartCubeController.disabled = false;
      smartCubeCapture.hidden = !smartCubeDevEnabled || smartCubeReplayControlsApi !== null;
      smartCubeCapture.disabled = !smartCubeDevEnabled || smartCubeReplayControlsApi !== null;
      setSmartCubeOrientationTracking(supportsOrientation);
      updateSmartCubeMistakeUi();
    } else {
      if (smartCubeRecording) {
        smartCubeRecording = false;
        smartCubeRecordingState = null;
        smartCubeRecordingTapePresented = false;
        smartCubeRecordingFrame = [];
        cancelSmartCubeRecordingAnimation();
        smartCubeRecordingTapeDirty = false;
      }
      smartCubeGuidedTape = false;
      smartCubeLedFeedback = false;
      smartCubeSupportsFacelets = false;
      smartCubeRecordCapability.hidden = true;
      smartCubeSync.hidden = true;
      smartCubeResetState.hidden = true;
      smartCubeOrientation.hidden = true;
      smartCubeRecenter.hidden = true;
      smartCubeDiagnostics.hidden = true;
      smartCubeCopyTrace.hidden = true;
      smartCubeController.hidden = true;
      smartCubeCapture.hidden = true;
      smartCubeTapeRecorder = null;
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
        manualStateSmartCubeSyncPending = false;
        smartCubeCoachingFrameActive = false;
        smartCubeLiveState = null;
        smartCubeRenderedState = null;
        smartCubePendingMoves.length = 0;
        smartCubeReroute.hidden = true;
        scheduleUpdate();
      }
    }
    renderSmartCubeReplay();
    updateSmartCubeRecordingUi();
    updateManualStateSmartCubeControl();
  };

  const traceReceivedSmartCubeEvent = (event: SmartCubeEvent) => {
    switch (event.type) {
      case "move":
        traceSmartCubeStabilization("received event", {
          type: event.type,
          timestamp: event.timestamp,
          move: event.move,
          // The body-fixed packet is useful for transport debugging, while
          // solverMove is the face the virtual cube actually animates after
          // cumulative core regrips. Keep both in a diagnostic capture.
          solverMove: event.solverMove,
          source: event.source,
          face: event.face,
          direction: event.direction,
          localTimestamp: event.localTimestamp,
          cubeTimestamp: event.cubeTimestamp,
        });
        return;
      case "orientation":
        traceSmartCubeStabilization("received event", {
          type: event.type,
          timestamp: event.timestamp,
          quaternion: event.quaternion,
          rawQuaternion: event.rawQuaternion,
          coordinateFrame: event.coordinateFrame,
          source: event.source,
          angularVelocity: event.angularVelocity,
        });
        return;
      case "regrip":
        traceSmartCubeStabilization("received event", {
          type: event.type,
          timestamp: event.timestamp,
          notationToken: event.notationToken,
          sensorFrameToken: event.sensorFrameToken,
          solverNotationToken: event.solverNotationToken,
        });
        return;
      case "facelets":
        // Capture that a state packet arrived without exporting cube state.
        traceSmartCubeStabilization("received event", {
          type: event.type,
          timestamp: event.timestamp,
          faceletCount: event.facelets.length,
        });
        return;
      case "battery":
        traceSmartCubeStabilization("received event", event);
        return;
      case "hardware":
        traceSmartCubeStabilization("received event", {
          type: event.type,
          timestamp: event.timestamp,
          orientationSupported: event.orientationSupported,
        });
        return;
      case "disconnected":
        traceSmartCubeStabilization("received event", event);
        return;
    }
  };

  const handleSmartCubeEvent = (event: SmartCubeEvent) => {
    traceReceivedSmartCubeEvent(event);
    switch (event.type) {
      case "move": {
        smartCubeGestureRecenter.observeMove(event);
        // Turn acknowledgement is independent of coaching correctness: every
        // physical face turn gets the same cue when sound is enabled.
        smartCubeAudio.play("turn");
        const move = event.move;
        const solverMove = event.solverMove ?? move;
        const omitPreviewHistory = omitNextGestureTriggerMove === solverMove;
        if (omitPreviewHistory) omitNextGestureTriggerMove = null;
        const record: QueuedSmartCubeMove = {
          move,
          solverMove,
          omitPreviewHistory,
          source: event.source,
        };
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
            if (manualStateSmartCubeSyncPending) {
              manualStateSmartCubeSyncPending = false;
              manualStateSmartCubeStatus.textContent = diagnostic;
              updateManualStateSmartCubeControl();
            }
            smartCubeStatus.textContent = diagnostic;
            break;
          }
          if (manualStateSmartCubeSyncPending && manualStateDialog.open && size === 3) {
            manualStateSmartCubeSyncPending = false;
            importManualStateSmartCube(parsed._0);
            manualStateSmartCubeStatus.textContent = `${smartCubeDeviceName} state imported.`;
            updateManualStateSmartCubeControl();
          }
          if (smartCubeStateSyncPending) {
            smartCubeStateSyncPending = false;
            mirrorSmartCubeFaceletsToInput(event.facelets);
            smartCubeStatus.textContent = `${smartCubeDeviceName} · State synced`;
          }
          // Preserve wire order. A snapshot can arrive while one or more turn
          // animations are pending; binding it to the newest pending move
          // retroactively applies it after the wrong turn and makes x/y/z
          // regrips appear compensated twice (or not at all).
          smartCubeMoveQueue = smartCubeMoveQueue.then(() => {
            const state = reduceSmartCubeMirrorInput<CubeState>(
              smartCubeRenderedState ?? smartCubeLiveState,
              {kind: "snapshot", state: parsed._0},
              (previous) => previous,
            );
            if (!state) return;
            smartCubeLiveState = state;
            smartCubeRenderedState = state;
            updateManualStateSmartCubeControl();
            if (smartCubeMovesInFlight === 0 && !smartCubeRecording) renderSmartCubeLiveState();
          });
          updateSmartCubeMistakeUi();
        } else if (smartCubeStateSyncPending) {
          smartCubeStateSyncPending = false;
          smartCubeStatus.textContent = "The physical cube returned an invalid facelet state";
        } else if (manualStateSmartCubeSyncPending) {
          manualStateSmartCubeSyncPending = false;
          manualStateSmartCubeStatus.textContent = "The physical cube returned an invalid facelet state.";
          updateManualStateSmartCubeControl();
        }
        break;
      }
      case "battery":
        smartCubeBattery.hidden = false;
        smartCubeBattery.textContent = `🔋 ${Math.round(event.level)}%`;
        break;
      case "regrip": {
        appendPreviewHistoryToken(event.notationToken);
        smartCubeAudio.play("turn");
        // The core session is the sole regrip decision-maker and frame owner.
        // Its solver moves and facelets have already been projected through
        // this regrip. Recording the visible `y` as an algorithm move as well
        // would apply it a second time to CubeLab's recording state.
        traceSmartCubeStabilization("virtual regrip", {
          notationTokens: [event.notationToken],
          sensorFrameTokens: [event.sensorFrameToken],
          source: "regrip-core",
        });
        if (smartCubeRecording && smartCubeSyncMode === "PhysicalMirror") {
          if (event.source !== "regrip-core") {
            appendSmartCubeRecordingToken(event.notationToken);
            void animateSmartCubeRecordingToken(event.notationToken);
          }
          smartCubeStatus.textContent = event.source === "regrip-core"
            ? `${smartCubeDeviceName} · Virtual regrip ${event.notationToken}`
            : `${smartCubeDeviceName} · Recorded virtual regrip ${event.notationToken}`;
        }
        const pending = smartCubeRotationWait;
        const step = pending && activeTimeline?.steps[pending.action.timelineIndex]?.step;
        if (
          pending
          && step?.move.TAG === "Rotation"
          && pending.generation === playbackGeneration
        ) {
          const expectedToken = `${step.move._0.toLowerCase()}${step.turns < 0 ? "'" : ""}`;
          if ((event.solverNotationToken ?? event.notationToken) === expectedToken) {
            pending.completedQuarterTurns += 1;
            if (pending.completedQuarterTurns < Math.abs(step.turns)) {
              smartCubeStatus.textContent = `${smartCubeDeviceName} · ${pending.action.token} halfway`;
              break;
            }
            smartCubeRotationWait = null;
            clearTurnGuide();
            viewport?.setDeviceOrientation(null);
            const transform = turnTransform(size, step);
            if (transform && viewport) {
              void viewport.animateTurn(transform, 120).then(() => {
                if (pending.generation !== playbackGeneration) return;
                renderTimelineIndex(pending.action.timelineIndex + 1);
                signalSmartCubeFeedback("correct");
                smartCubeStatus.textContent = `${smartCubeDeviceName} · ${pending.action.token} regrip detected`;
                coachStatus.textContent = `${pending.action.token} detected by Regrip core. Continuing.`;
                waitForSmartCubeMove();
              });
            }
          }
        }
        break;
      }
      case "orientation": {
        latestSmartCubeOrientation = {
          quaternion: event.quaternion,
          coordinateFrame: event.coordinateFrame,
        };
        smartCubeGestureRecenter.observeOrientation(event.quaternion, event.coordinateFrame, event.timestamp);
        if (smartCubeOrientationTracking && !smartCubeRecording && !smartCubeRecordingTapePresented) {
          viewport?.setDeviceOrientation(event.quaternion, event.coordinateFrame);
        }
        updateSmartCubeRegripGauge();
        // Smart cube hardware face encoders are physically fixed to their turn indices
        // (U, R, F, D, L, B). Rotating the cube in hand rotates the 3D viewport view
        // via setDeviceOrientation, while face turn packets remain fixed to their physical faces.
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

          traceSmartCubeStabilization("gyro orientation", {
            coordinateFrame: event.coordinateFrame,
            rawQuaternion: event.rawQuaternion ?? event.quaternion,
            stabilizedQuaternion: event.source === "regrip-core" ? event.quaternion : undefined,
            viewportQuaternion: vq,
            eulerDegrees: {pitchX: pitch, yawY: yaw, rollZ: roll},
            tracking: smartCubeOrientationTracking,
            recording: smartCubeRecording,
          });

          // console.log(
          //   `[SmartCube Orientation] Live trace: frame=${event.coordinateFrame} ` +
          //   `rawQ=(${event.quaternion.x.toFixed(3)}, ${event.quaternion.y.toFixed(3)}, ${event.quaternion.z.toFixed(3)}, ${event.quaternion.w.toFixed(3)}) ` +
          //   `euler(pitchX=${pitch.toFixed(1)}°, yawY=${yaw.toFixed(1)}°, rollZ=${roll.toFixed(1)}°) ` +
          //   `tracking=${smartCubeOrientationTracking} waitingForRegrip=${Boolean(smartCubeRotationWait)}`
          // );
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

  const pickMockTape = <T extends {name: string; note?: string; brand?: string; durationMs?: number; profile?: string; load: () => Promise<unknown>}>(catalogue: readonly T[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      let selected = false;
      let settled = false;
      const cleanUp = () => {
        smartCubeImportSession.removeEventListener("click", openImport);
        smartCubeImportSessionFile.removeEventListener("change", importSession);
        smartCubeTapePicker.removeEventListener("close", cancel);
      };
      const settle = (action: () => void) => {
        if (settled) return;
        settled = true;
        selected = true;
        cleanUp();
        smartCubeTapePicker.close();
        action();
      };
      const openImport = () => smartCubeImportSessionFile.click();
      const importSession = async () => {
        const file = smartCubeImportSessionFile.files?.[0];
        smartCubeImportSessionFile.value = "";
        if (!file) return;
        try {
          const tape = JSON.parse(await file.text());
          settle(() => resolve(tape));
        } catch (reason) {
          if (reason instanceof SyntaxError) {
            smartCubeQaDiffValue.textContent = "Invalid JSON session file";
            return;
          }
          settle(() => reject(reason));
        }
      };
      const cancel = () => {
        if (!selected) {
          cleanUp();
          reject(new DOMException("Mock tape selection cancelled", "AbortError"));
        }
      };
      smartCubeTapePickerList.replaceChildren();
      catalogue.forEach((entry) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "viewport-control";
        const description = [entry.brand, entry.profile, entry.durationMs === undefined ? undefined : `${entry.durationMs} ms`, entry.note]
          .filter((value): value is string => typeof value === "string")
          .join(" · ");
        button.textContent = description ? `${entry.name} — ${description}` : entry.name;
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const tape = await entry.load();
            settle(() => resolve(tape));
          } catch (reason) {
            settle(() => reject(reason));
          }
        }, {once: true});
        smartCubeTapePickerList.append(button);
      });
      smartCubeImportSession.addEventListener("click", openImport);
      smartCubeImportSessionFile.addEventListener("change", importSession);
      smartCubeTapePicker.addEventListener("close", cancel);
      smartCubeTapePicker.showModal();
    });

  const loadSmartCubeManager = async (): Promise<SmartCubeManager> => {
    if (smartCubeManager) return smartCubeManager;
    if (!smartCubeManagerLoading) {
      smartCubeManagerLoading = import("./smart-cube/index")
        .then(async ({
          createReplaySmartCubeManager,
          createMockDeviceManager,
          createSmartCubeDerivedComparator,
          createRegripCoreManager,
          createSmartCubeTapeRecorder,
          loadReplayTape,
          replayTapeNameFromSearch,
          replayTapeStorageKey,
        }) => {
          // Capability is checked once, inside the explicit Connect gesture. Avoid
          // repeatedly touching navigator.bluetooth in permission-blocked embeds.
          const replayName = replayTapeNameFromSearch(window.location.search);
          const manager = smartCubeMockMode
            ? await (async () => {
              const catalogueRows = await fetch("/smart-cube/tapes/index.json").then((response) => {
                if (!response.ok) throw new Error("Mock tape catalogue could not be loaded");
                return response.json() as Promise<Array<{name: string; note?: string; brand?: string; durationMs?: number; profile?: "full" | "diagnostic"}>>;
              });
              const catalogue = catalogueRows.map((entry) => ({...entry, load: () => loadReplayTape(entry.name)}));
              return createMockDeviceManager({catalogue, pickTape: pickMockTape});
            })()
            : replayName
              ? createReplaySmartCubeManager(await loadReplayTape(replayName))
              : createRegripCoreManager({isBluetoothAvailable: () => true});
          smartCubeReplayControlsApi = "getReplayState" in manager ? manager : null;
          smartCubeReplayControlsApi?.subscribeReplayReset(() => {
            // A backward seek must start the real downstream chain from a clean
            // fold; queued move animations are non-idempotent.
            smartCubeMoveQueue = Promise.resolve();
            smartCubePendingMoves.length = 0;
            smartCubeHalfTurnProgress = null;
            clearSmartCubeRecovery();
            latestSmartCubeOrientation = null;
            smartCubeDerivedComparator?.reset();
            if (smartCubeMockMode) smartCubeQaDiffValue.textContent = "Awaiting replay";
          });
          manager.subscribeState((connectionState) => {
            if (smartCubeMockMode && connectionState.phase === "connected" && "getSelectedTape" in manager) {
              const tape = manager.getSelectedTape();
              smartCubeDerivedComparator = tape ? createSmartCubeDerivedComparator(tape) : null;
              smartCubeQaDiffValue.textContent = tape?.timeline.some((entry) => entry.kind === "derived")
                ? "Awaiting replay"
                : "No derived checkpoints";
              smartCubeQaLog.replaceChildren();
            }
            renderSmartCubeConnection(connectionState);
          });
          manager.subscribeCommands((command) => {
            traceSmartCubeStabilization("sent command", command);
            smartCubeTapeRecorder?.recordCommand(command);
          });
          manager.subscribeEvents(handleSmartCubeEvent);
          manager.subscribeEvents((event) => {
            smartCubeTapeRecorder?.recordEvent(event);
            appendSmartCubeQaEvent(event);
            renderSmartCubeReplay();
            window.setTimeout(renderSmartCubeReplay, 0);
          });
          smartCubeCapture.addEventListener("click", () => {
            const device = manager.getState().device;
            if (!device || smartCubeReplayControlsApi) return;
            if (smartCubeTapeRecorder) {
              const tape = smartCubeTapeRecorder.finish("Captured in CubeLab dev mode");
              smartCubeTapeRecorder = null;
              const defaultName = `smart-cube-${new Date().toISOString().replace(/[:.]/g, "-")}`;
              const name = window.prompt("Replay tape name", defaultName)?.trim() || defaultName;
              window.localStorage.setItem(replayTapeStorageKey(name), JSON.stringify(tape));
              const blob = new Blob([JSON.stringify(tape, null, 2)], {type: "application/json"});
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `${name}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
              smartCubeCapture.classList.remove("active");
              smartCubeCapture.textContent = "● Capture session";
              const inputCount = tape.timeline.filter((entry) => entry.kind === "input").length;
              smartCubeStatus.textContent = inputCount > 0
                ? `${smartCubeDeviceName} · Captured replay tape (${inputCount} input events).`
                : `${smartCubeDeviceName} · Capture contained no input packets. Keep the cube connected and move it while capture is active.`;
              return;
            }
            smartCubeTapeRecorder = createSmartCubeTapeRecorder({
              device,
              syncMode: smartCubeSyncMode,
              orientationTracking: smartCubeOrientationTracking,
              recording: smartCubeRecording,
              route: activeTab === "academy" ? window.location.hash || null : null,
              inputHash: window.location.hash,
              settings: {autoOrbit, regripThresholdDegrees: 65},
            });
            smartCubeCapture.classList.add("active");
            smartCubeCapture.textContent = "■ Stop capture";
            smartCubeStatus.textContent = `${smartCubeDeviceName} · Capturing full replay tape locally.`;
          });
          smartCubeManager = manager;
          updateManualStateSmartCubeControl();
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
    updateNissSource(recognized);
    updateCompatibility(recognized);
    updatePatternDetection(recognized);
    updateTransformAvailability(movesTransformReady());
    updateShortenAvailability();
    if (smartCubeRecording && smartCubeRecordingTapeDirty) return;
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
    synchronizeAcademySetup();
    const setup = parseState(input.value);
    const parsed = parseWorkspaceState(setup);
    if (parsed.TAG === "Error") {
      updateSetupOrientationUi(setup.TAG === "Ok" ? setup._0 : null);
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
      for (const key of ["facelets", "net", "colours", "colour-net", "pieces", "orbit64", "sse", "acube"]) {
        setOutput(key, "—", false);
      }
      lastLabel = "Parse error";
      return;
    }
    updateSetupOrientationUi(setup.TAG === "Ok" ? setup._0 : null);
    synchronizePlayback(parsed._0);
    if (!smartCubeRecording && !smartCubeRecordingTapePresented && smartCubeSyncMode === "PhysicalMirror" && smartCubeConnected && smartCubeLiveState) {
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
    const setupChanged = !appStateApplied
      || size !== state.size
      || lowercaseMode !== state.lowercaseMode
      || notationDialect !== state.notationDialect
      || input.value !== state.input
      || schemeSelect.value !== state.scheme
      || customScheme.value !== state.customScheme;
    size = state.size;
    lowercaseMode = state.lowercaseMode;
    notationDialect = state.notationDialect;
    cubeStyle = state.cubeStyle;
    const turnGuidesChanged = turnGuides !== state.turnGuides;
    const autoOrbitChanged = !appStateApplied || autoOrbit !== state.autoOrbit;
    const academyMethodChanged = academyMethod !== state.academyMethod;
    const academyTabChanged = activeTab !== state.activeTab;
    turnGuides = state.turnGuides;
    autoOrbit = state.autoOrbit;
    activeTab = state.activeTab;
    academyMethod = state.academyMethod;
    if (input.value !== state.input) input.value = state.input;
    if (movesInput.value !== state.moves) movesInput.value = state.moves;
    if (schemeSelect.value !== state.scheme) schemeSelect.value = state.scheme;
    if (customScheme.value !== state.customScheme) customScheme.value = state.customScheme;
    if (noteInput.value !== state.note) noteInput.value = state.note;
    if (appStateApplied && setupChanged) {
      academySetupKey = null;
      academyRequestGuard.invalidate();
      academySolveBusy = false;
      resetTwoPhaseRefinement();
      resetOptimal2x2Solution();
      resetReduction4x4Solution();
    }
    settingsSize.value = String(state.size);
    settingsScheme.value = state.scheme;
    settingsDialect.value = state.notationDialect;
    practice2x2Difficulty.hidden = state.size !== 2;
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
      if (turnGuides && !activeTurnGuide) restoreIdleTurnGuide();
      else viewport?.setTurnGuide(turnGuides ? activeTurnGuide : null);
    }
    if (autoOrbitChanged && !smartCubeOrientationTracking) {
      setAutoOrbitEnabled(state.autoOrbit, false);
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
    updateAcademyMethodControls();
    if (conversionChanged) reductionGuideCache.clear();
    clearHiddenReductionGuide();
    if (appStateApplied && academyMethodChanged) {
      academyRequestGuard.invalidate();
      academySolveBusy = false;
      const method = selectedTutorialMethod();
      if (method !== null) {
        const saved = savedTutorialSolutions.get(method);
        const academy = academyForMethod(method);
        if (saved) presentTutorialSolution(saved.initialState, saved.solution, academy);
      }
    }
    updateAcademySolveButton();
    updateSmartCubeRecordingUi();
    if (appStateApplied && !conversionChanged && (academyMethodChanged || academyTabChanged)) {
      if (activeTab === "academy" && academySetupSourceKey() !== academySetupKey) {
        synchronizeAcademySetup();
      } else {
        renderReduction4x4Academy(activeRecognized);
        renderReduction5x5Academy(activeRecognized);
        renderPetrus5x5Academy(activeRecognized);
      }
    }
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
  window.addEventListener("cubelab:timer-scramble", ((event: CustomEvent<{scramble: string}>) => {
    const evaluated = evaluateAlgorithm(3, "Wide", "Modern", event.detail.scramble);
    if (evaluated.TAG === "Error") {
      smartCubeStatus.textContent = `Could not load timer scramble: ${evaluated._0}`;
      return;
    }
    if (smartCubeSyncMode !== "VirtualController") {
      store.patch({size: 3, input: event.detail.scramble, moves: ""});
      return;
    }
    // Controller mode changes where turns are sourced, not the workspace
    // contract: a new scramble must remain visible, shareable, and editable
    // in Setup just as it is without a connected cube.
    store.patch({size: 3, input: event.detail.scramble, moves: ""});
    loadVirtualControllerState(evaluated._0.finalState, "Virtual controller · instant scramble");
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Instant scramble loaded. Start inspection when ready.`;
  }) as EventListener);
  window.addEventListener("cubelab:timer-replay", ((event: CustomEvent<{scramble: string; moves: string}>) => {
    // Imported csTimer reconstructions are ordinary 3×3 timelines; their
    // elapsed timestamps have been converted to bounded timed pauses.
    store.patch({size: 3, input: event.detail.scramble, moves: event.detail.moves});
  }) as EventListener);

  playerPageLink.addEventListener("click", (event) => {
    event.preventDefault();
    setPlayerMode(!playerMode);
  });
  viewportMaximize.addEventListener("click", () => {
    const request = document.documentElement.requestFullscreen;
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen().catch(() => {});
    } else if (typeof request === "function") {
      void request.call(document.documentElement).catch(() => {});
    }
  });
  document.addEventListener("fullscreenchange", () => {
    renderViewportMaximize();
    viewport?.refresh();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-academy-method]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({
        activeTab: "academy",
        academyMethod: button.dataset.academyMethod as AcademyMethod,
      });
    });
  });

  reduction4x4Academy.finish.addEventListener("click", () => {
    if (size !== 4 || activeRecognized === null) return;
    if (reduce4x4(activeRecognized.state).TAG !== "Ok") return;
    store.patch({activeTab: "converter"});
    window.requestAnimationFrame(() => reduction4x4Solve.click());
  });

  reduction4x4Academy.applyCentre.addEventListener("click", () => {
    if (size !== 4 || activeRecognized === null || academySetupSourceKey() !== academySetupKey) return;
    const guide = reductionGuideCache.peek(reductionGuideKey(activeRecognized.state, "centre"));
    if (guide?.TAG !== "Ok") return;
    store.patch({moves: [movesInput.value.trim(), guide._0.algorithm].filter(Boolean).join(" ")});
  });

  reduction5x5Academy.applyCentre.addEventListener("click", () => {
    if (size !== 5 || activeRecognized === null || academySetupSourceKey() !== academySetupKey) return;
    const key = FaceletCodec.render(activeRecognized.state);
    const guide = reduction5x5ImmediateGuide !== null && reduction5x5ImmediateGuideKey === key
      ? {TAG: "Ok", _0: reduction5x5ImmediateGuide}
      : reduction5x5BarGuide !== null && reduction5x5BarKey === key
      ? {TAG: "Ok", _0: reduction5x5BarGuide}
      : reduction5x5CycleGuide !== null && reduction5x5CycleKey === key
      ? {TAG: "Ok", _0: reduction5x5CycleGuide}
      : {TAG: "Error"};
    if (guide.TAG === "Ok") store.patch({moves: [movesInput.value.trim(), guide._0.algorithm].filter(Boolean).join(" ")});
  });

  reduction5x5Academy.findBar.addEventListener("click", async () => {
    if (size !== 5 || activeRecognized === null) return;
    if (reduction5x5BarBusy) {
      reduction5x5BarRequest += 1;
      reduction5x5BarClient.terminate();
      reduction5x5BarClient = newReduction5x5BarClient();
      reduction5x5BarBusy = false;
      reduction5x5Academy.findBar.textContent = "Find 1×3 bar commutator";
      reduction5x5Academy.guide.textContent = "Bar-commutator search stopped.";
      return;
    }
    const request = ++reduction5x5BarRequest;
    const state = activeRecognized.state;
    const key = FaceletCodec.render(state);
    reduction5x5BarBusy = true;
    reduction5x5Academy.findBar.hidden = false;
    reduction5x5Academy.findBar.textContent = "Stop bar-commutator search";
    reduction5x5Academy.guide.textContent = "Searching replay-verified 1×3 bar commutators…";
    try {
      const guide = await reduction5x5BarClient.solve(state);
      if (request !== reduction5x5BarRequest || FaceletCodec.render(activeRecognized?.state ?? state) !== key) return;
      reduction5x5BarGuide = guide;
      reduction5x5BarKey = key;
      reduction5x5Academy.guide.textContent = `Replay-verified 1×3 bar commutator: ${guide.algorithm} · core-aligned bars ${guide.barsBefore} → ${guide.barsAfter}.`;
      reduction5x5Academy.guide.classList.remove("error");
      reduction5x5Academy.applyCentre.hidden = false;
      reduction5x5Academy.applyCentre.disabled = false;
    } catch (error) {
      if (request === reduction5x5BarRequest) reduction5x5Academy.guide.textContent = error instanceof Error ? error.message : "Bar-commutator search stopped.";
    } finally {
      if (request === reduction5x5BarRequest) {
        reduction5x5BarBusy = false;
        reduction5x5Academy.findBar.textContent = "Find 1×3 bar commutator";
      }
    }
  });

  reduction5x5Academy.findCycle.addEventListener("click", async () => {
    if (size !== 5 || activeRecognized === null) return;
    if (reduction5x5CycleBusy) {
      reduction5x5CycleRequest += 1;
      reduction5x5CycleClient.terminate();
      reduction5x5CycleClient = newReduction5x5CycleClient();
      reduction5x5CycleBusy = false;
      reduction5x5Academy.findCycle.textContent = "Try bounded X-centre cycle";
      reduction5x5Academy.guide.textContent = "Centre-cycle search stopped.";
      return;
    }
    const request = ++reduction5x5CycleRequest;
    const state = activeRecognized.state;
    const key = FaceletCodec.render(state);
    reduction5x5CycleBusy = true;
    reduction5x5Academy.findCycle.hidden = false;
    reduction5x5Academy.findCycle.textContent = "Stop centre-cycle search";
    reduction5x5Academy.guide.textContent = "Searching bounded X-centre cycle…";
    try {
      const guide = await reduction5x5CycleClient.solve(state);
      if (request !== reduction5x5CycleRequest || FaceletCodec.render(activeRecognized?.state ?? state) !== key) return;
      reduction5x5CycleGuide = guide;
      reduction5x5CycleKey = key;
      reduction5x5Academy.guide.textContent = `Replay-verified ${guide.kind === "plusCycle" ? "+-centre" : "X-centre"} cycle: ${guide.algorithm}.`;
      reduction5x5Academy.guide.classList.remove("error");
      reduction5x5Academy.applyCentre.hidden = false;
      reduction5x5Academy.applyCentre.disabled = false;
    } catch (error) {
      if (request === reduction5x5CycleRequest) reduction5x5Academy.guide.textContent = error instanceof Error ? error.message : "Centre-cycle search stopped.";
    } finally {
      if (request === reduction5x5CycleRequest) {
        reduction5x5CycleBusy = false;
        reduction5x5Academy.findCycle.textContent = "Try bounded X-centre cycle";
      }
    }
  });

  reduction5x5Academy.applyWing.addEventListener("click", () => {
    if (size !== 5 || activeRecognized === null || academySetupSourceKey() !== academySetupKey) return;
    const key = FaceletCodec.render(activeRecognized.state);
    const guide = reduction5x5L2EGuide !== null && reduction5x5L2EKey === key
      ? {TAG: "Ok", _0: reduction5x5L2EGuide}
      : reductionGuideCache.peek(reductionGuideKey(activeRecognized.state, "wing"));
    if (guide?.TAG !== "Ok") return;
    store.patch({moves: [movesInput.value.trim(), guide._0.algorithm].filter(Boolean).join(" ")});
  });

  reduction5x5Academy.findL2E.addEventListener("click", async () => {
    if (size !== 5 || activeRecognized === null) return;
    if (reduction5x5L2EBusy) {
      reduction5x5L2ERequest += 1;
      reduction5x5L2EClient.terminate();
      reduction5x5L2EClient = newReduction5x5L2EClient();
      reduction5x5L2EBusy = false;
      reduction5x5Academy.findL2E.textContent = "Find last-two-edges relation";
      reduction5x5Academy.guide.textContent = "Last-two-edges search stopped.";
      return;
    }
    const request = ++reduction5x5L2ERequest;
    const state = activeRecognized.state;
    const key = FaceletCodec.render(state);
    reduction5x5L2EBusy = true;
    reduction5x5Academy.findL2E.hidden = false;
    reduction5x5Academy.findL2E.textContent = "Stop last-two-edges search";
    reduction5x5Academy.guide.textContent = "Searching replay-verified last-two-edges setups…";
    try {
      const guide = await reduction5x5L2EClient.solve(state);
      if (request !== reduction5x5L2ERequest || FaceletCodec.render(activeRecognized?.state ?? state) !== key) return;
      reduction5x5L2EGuide = guide;
      reduction5x5L2EKey = key;
      reduction5x5Academy.guide.textContent = `Replay-verified last-two-edges relation: ${guide.algorithm} · ${guide.before}/24 → ${guide.after}/24 matched wing pairs; all six centres remain complete.`;
      reduction5x5Academy.guide.classList.remove("error");
      reduction5x5Academy.applyWing.hidden = false;
      reduction5x5Academy.applyWing.disabled = false;
    } catch (error) {
      if (request === reduction5x5L2ERequest) reduction5x5Academy.guide.textContent = error instanceof Error ? error.message : "Last-two-edges search stopped.";
    } finally {
      if (request === reduction5x5L2ERequest) {
        reduction5x5L2EBusy = false;
        reduction5x5Academy.findL2E.textContent = "Find last-two-edges relation";
      }
    }
  });

  reduction5x5Academy.repairParity.addEventListener("click", () => {
    if (size !== 5 || activeRecognized === null) return;
    const reduced = reduce5x5(activeRecognized.state);
    const repair = reduced.TAG === "Error" && reduced._0.message.startsWith("5×5 PLL parity detected:")
      ? planPLLParityRepair5x5(activeRecognized.state)
      : planOLLParityRepair5x5(activeRecognized.state);
    if (repair.TAG !== "Ok") return;
    store.patch({moves: [movesInput.value.trim(), repair._0.algorithm].filter(Boolean).join(" ")});
  });

  petrus5x5Academy.step.addEventListener("click", () => {
    if (activeTab !== "academy" || academyMethod !== "petrus5x5" || size !== 5 || activeRecognized === null) return;
    const guide = petrus5x5Evaluation.evaluate(activeRecognized.state, true)?.guide;
    if (guide == null || guide.algorithm.length === 0) return;
    store.patch({moves: [movesInput.value.trim(), guide.algorithm].filter(Boolean).join(" ")});
  });

  reduction4x4Academy.applyGuide.addEventListener("click", () => {
    if (size !== 4 || activeRecognized === null || academySetupSourceKey() !== academySetupKey) return;
    const guide = reductionGuideCache.peek(reductionGuideKey(activeRecognized.state, "wing"));
    if (guide === null) return;
    if (guide.TAG !== "Ok") {
      reduction4x4Academy.guide.hidden = false;
      reduction4x4Academy.guide.textContent = guide._0.message;
      reduction4x4Academy.guide.classList.add("error");
      return;
    }
    store.patch({moves: [movesInput.value.trim(), guide._0.algorithm].filter(Boolean).join(" ")});
  });

  reduction4x4Academy.repairParity.addEventListener("click", () => {
    if (size !== 4 || activeRecognized === null) return;
    const reduced = reduce4x4(activeRecognized.state);
    const repair = reduced.TAG === "Error" && reduced._0.message.startsWith("4×4 PLL parity detected:")
      ? planPLLParityRepair4x4(activeRecognized.state)
      : planOLLParityRepair4x4(activeRecognized.state);
    if (repair.TAG !== "Ok") return;
    store.patch({moves: [movesInput.value.trim(), repair._0.algorithm].filter(Boolean).join(" ")});
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
    academySetupKey = null;
    academyRequestGuard.invalidate();
    academySolveBusy = false;
    resetTwoPhaseRefinement();
    store.patch({scheme: schemeSelect.value as SchemeName});
    scheduleUpdate();
  });
  customScheme.addEventListener("input", () => {
    customScheme.value = customScheme.value.toUpperCase();
    academySetupKey = null;
    academyRequestGuard.invalidate();
    academySolveBusy = false;
    resetTwoPhaseRefinement();
    store.patch({customScheme: customScheme.value});
    scheduleUpdate();
  });
  noteInput.addEventListener("input", () => {
    store.patch({note: noteInput.value});
  });
  input.addEventListener("input", () => {
    smartCubeCoachingFrameActive = false;
    syncSmartCubeTrackedOrientation();
    if (pendingDirectMove !== null) {
      window.clearTimeout(pendingDirectMove.timeout);
      pendingDirectMove = null;
    }
    academySetupKey = null;
    academyRequestGuard.invalidate();
    academySolveBusy = false;
    resetTwoPhaseRefinement();
    store.patch({input: input.value});
    scheduleUpdate();
  });
  setupCanonicalise.addEventListener("click", () => {
    const parsed = parseState(input.value);
    if (parsed.TAG === "Error") return;
    const canonical = canonicaliseSetupOrientation(parsed._0.state);
    if (canonical.TAG === "Error") return;
    const facelets = toSpacedFacelets(FaceletCodec.render(canonical._0), canonical._0.size);
    if (input.value === facelets) return;
    input.value = facelets;
    input.dispatchEvent(new Event("input", {bubbles: true}));
  });
  movesInput.addEventListener("input", () => {
    updateTransformAvailability(false);
    shortenSearch.disabled = true;
    shortenResult.hidden = true;
    pendingShortenedAlg = null;
    store.patch({moves: movesInput.value});
    updateSmartCubeRecordingUi();
    scheduleUpdate();
  });
  twoPhaseTarget.addEventListener("input", () => {
    resetTwoPhaseRefinement();
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
        dialectForPastedInput(movesInput.value),
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
        case "factor-structure":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.factorStructure(alg)));
          break;
        case "optimize-regrips":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.optimizeRegrips(size, alg)));
          break;
        case "expand-regrips":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.expandRegripsToFaces(size, alg)));
          break;
        case "filter-regrips":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.filterRegrips(alg)));
          break;
        case "normalize":
          commitTransformedMoves(MoveTransform.serialize(alg));
          break;
        case "unfold-slices":
          commitTransformedMoves(MoveTransform.serialize(MoveTransform.unfoldSlices(alg, size)));
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
      dialectForPastedInput(movesInput.value),
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
    if (size === 2) {
      const button = root.querySelector<HTMLButtonElement>("[data-practice-scramble]")!;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Sampling 2×2 state…";
      const difficulty = practice2x2DifficultySelect.value as "any" | "3" | "4" | "5+";
      void random2x2ScrambleClient.generate(difficulty).then((generated) => {
        const scramble = MoveTransform.serialize(generated.alg) as string;
        commitTransformedAlgorithm(scramble);
        if (smartCubeSyncMode === "VirtualController") {
          loadVirtualControllerState(generated.state, "Virtual controller · uniform random 2×2 state");
        }
        if (smartCubeConnected) {
          smartCubeStatus.textContent = `${smartCubeDeviceName} · Uniform random 2×2 state loaded (${generated.moveCount} HTM optimal).`;
        }
      }).catch((reason: unknown) => {
        smartCubeStatus.textContent = reason instanceof Error ? reason.message : "Could not generate a random 2×2 state.";
      }).finally(() => {
        button.disabled = false;
        button.textContent = originalLabel;
      });
      return;
    }
    const scramble = MoveTransform.practiceScramble(size) as Result<string, string>;
    if (scramble.TAG !== "Ok") return;
    if (smartCubeSyncMode !== "VirtualController") {
      commitTransformedAlgorithm(scramble._0);
      if (smartCubeConnected) {
        smartCubeStatus.textContent = `${smartCubeDeviceName} · Practice scramble loaded in Setup. Turn the physical cube to match, or enable Controller mode for instant virtual setup.`;
      }
      return;
    }
    const evaluated = evaluateAlgorithm(3, "Wide", "Modern", scramble._0);
    if (evaluated.TAG === "Error") {
      smartCubeStatus.textContent = `Could not load virtual practice scramble: ${evaluated._0}`;
      return;
    }
    // Keep controller-mode quick loads equivalent to the normal editor path:
    // the virtual state is immediate, while Setup records the scramble that
    // produced it for sharing, inspection, and later playback.
    commitTransformedAlgorithm(scramble._0);
    loadVirtualControllerState(evaluated._0.finalState, "Virtual controller · practice scramble");
    smartCubeStatus.textContent = `${smartCubeDeviceName} · Virtual practice scramble loaded.`;
  });

  optimal2x2Solve.addEventListener("click", async () => {
    if (size !== 2) return;
    if (optimal2x2SolveBusy) {
      optimal2x2Request += 1;
      optimal2x2SolverClient.terminate();
      optimal2x2SolverClient = newOptimal2x2SolverClient();
      optimal2x2SolveBusy = false;
      optimal2x2Solve.textContent = "Find optimal solution";
      optimal2x2Result.textContent = "Optimal 2×2 search stopped immediately.";
      optimal2x2Result.classList.remove("success", "failure");
      return;
    }
    const setup = parseState(input.value);
    if (setup.TAG === "Error") {
      optimal2x2Result.textContent = describeError(setup._0);
      optimal2x2Result.classList.add("failure");
      return;
    }
    const sourceKey = solverSetupSourceKeyForCurrent();
    const request = ++optimal2x2Request;
    optimal2x2SourceKey = sourceKey;
    optimal2x2Algorithm = "";
    optimal2x2Apply.disabled = true;
    optimal2x2SolveBusy = true;
    optimal2x2Solve.textContent = "Cancel search";
    optimal2x2Result.textContent = "Preparing optimal 2×2 solver…";
    optimal2x2Result.classList.remove("success", "failure");
    try {
      const solution = await optimal2x2SolverClient.solve(setup._0.state);
      if (request !== optimal2x2Request || sourceKey !== optimal2x2SourceKey) return;
      optimal2x2Algorithm = MoveTransform.serialize(solution.alg) as string;
      optimal2x2Apply.disabled = optimal2x2Algorithm === "";
      optimal2x2Result.textContent = `${solution.moveCount} HTM optimal · ${optimal2x2Algorithm || "Solved"}`;
      optimal2x2Result.classList.add("success");
    } catch (reason) {
      if (request !== optimal2x2Request) return;
      const message = reason instanceof Error ? reason.message : "The optimal 2×2 solver failed.";
      optimal2x2Result.textContent = message;
      optimal2x2Result.classList.add("failure");
    } finally {
      if (request !== optimal2x2Request) return;
      optimal2x2SolveBusy = false;
      optimal2x2Solve.textContent = "Find optimal solution";
      optimal2x2Solve.disabled = size !== 2;
    }
  });

  optimal2x2Apply.addEventListener("click", () => {
    if (optimal2x2Algorithm === "") return;
    const sourceKey = solverSetupSourceKeyForCurrent();
    if (sourceKey !== optimal2x2SourceKey) {
      optimal2x2Result.textContent = "Setup changed; generate a new optimal solution.";
      optimal2x2Result.classList.add("failure");
      optimal2x2Apply.disabled = true;
      return;
    }
    store.patch({moves: [movesInput.value.trim(), optimal2x2Algorithm].filter(Boolean).join(" ")});
  });

  reduction4x4Solve.addEventListener("click", async () => {
    if (size !== 4) return;
    if (reduction4x4SolveBusy) {
      reduction4x4Request += 1;
      reduction4x4SolverClient.terminate();
      reduction4x4SolverClient = newReduction4x4SolverClient();
      reduction4x4SolveBusy = false;
      reduction4x4Solve.textContent = "Finish reduced state";
      reduction4x4Result.textContent = "4×4 finishing search stopped immediately.";
      reduction4x4Result.classList.remove("success", "failure");
      return;
    }
    const setup = parseWorkspaceState();
    if (setup.TAG === "Error") {
      reduction4x4Result.textContent = describeError(setup._0);
      reduction4x4Result.classList.add("failure");
      return;
    }
    const reduction = reduce4x4(setup._0.state);
    if (reduction.TAG === "Error" && /^4×4 (?:OLL|PLL) parity detected:/.test(reduction._0.message)) {
      reduction4x4Result.textContent = `${reduction._0.message} Opening the Academy repair step.`;
      reduction4x4Result.classList.add("failure");
      store.patch({activeTab: "academy", academyMethod: "reduction4x4"});
      return;
    }
    const sourceKey = solverSetupSourceKeyForCurrent();
    const request = ++reduction4x4Request;
    reduction4x4SourceKey = sourceKey;
    reduction4x4Algorithm = "";
    reduction4x4Apply.disabled = true;
    reduction4x4SolveBusy = true;
    reduction4x4Solve.textContent = "Cancel search";
    reduction4x4Result.textContent = "Checking centre blocks and wing pairs…";
    reduction4x4Result.classList.remove("success", "failure");
    try {
      const solution = await reduction4x4SolverClient.solve(setup._0.state);
      if (request !== reduction4x4Request || sourceKey !== reduction4x4SourceKey) return;
      reduction4x4Algorithm = MoveTransform.serialize(solution.alg) as string;
      reduction4x4Apply.disabled = reduction4x4Algorithm === "";
      reduction4x4Result.textContent = `${solution.stm} STM · ${solution.obtm} OBTM reduced finish · ${reduction4x4Algorithm || "Solved"}`;
      reduction4x4Result.classList.add("success");
    } catch (reason) {
      if (request !== reduction4x4Request) return;
      reduction4x4Result.textContent = reason instanceof Error ? reason.message : "The 4×4 reduction solver failed.";
      reduction4x4Result.classList.add("failure");
    } finally {
      if (request !== reduction4x4Request) return;
      reduction4x4SolveBusy = false;
      reduction4x4Solve.textContent = "Finish reduced state";
      reduction4x4Solve.disabled = size !== 4;
    }
  });

  reduction4x4Apply.addEventListener("click", () => {
    if (reduction4x4Algorithm === "") return;
    if (solverSetupSourceKeyForCurrent() !== reduction4x4SourceKey) {
      reduction4x4Result.textContent = "Setup changed; generate a new 4×4 solution.";
      reduction4x4Result.classList.add("failure");
      reduction4x4Apply.disabled = true;
      return;
    }
    store.patch({moves: [movesInput.value.trim(), reduction4x4Algorithm].filter(Boolean).join(" ")});
  });

  twoPhaseSolve.addEventListener("click", async () => {
    if (size !== 3) return;
    if (twoPhaseSolveBusy) {
      // `solveAtDepth` is synchronous inside the worker, so a posted cancel
      // message cannot interrupt its current bound. Terminate this dedicated
      // worker and create a fresh one: stopping is immediate and the next
      // request remains independently cancellable.
      twoPhaseRequest += 1;
      twoPhaseSolverClient.terminate();
      twoPhaseSolverClient = newTwoPhaseSolverClient();
      twoPhaseSolveBusy = false;
      twoPhaseSolve.textContent = twoPhaseAlgorithm === ""
        ? "Find two-phase solution"
        : "Search for better result";
      twoPhaseSolve.disabled = false;
      twoPhaseResult.textContent = twoPhaseAlgorithm === ""
        ? "Search stopped immediately; no solution had been found yet."
        : `Search stopped immediately; keeping ${twoPhaseAlgorithm}.`;
      twoPhaseResult.classList.remove("success", "failure");
      return;
    }
    const setup = parseState(input.value);
    if (setup.TAG === "Error") {
      twoPhaseResult.textContent = describeError(setup._0);
      twoPhaseResult.classList.add("failure");
      return;
    }
    const target = twoPhaseTargetState();
    if (target.TAG === "Error") {
      twoPhaseResult.textContent = target._0;
      twoPhaseResult.classList.add("failure");
      return;
    }
    const relative = relativeAcademyState(setup._0.state, target._0);
    if (relative.TAG === "Error") {
      twoPhaseResult.textContent = relative._0;
      twoPhaseResult.classList.add("failure");
      return;
    }
    const request = ++twoPhaseRequest;
    const sourceKey = twoPhaseSourceKeyForCurrent();
    const refining = twoPhaseAlgorithm !== ""
      && twoPhaseBestMoveCount !== null
      && sourceKey === twoPhaseSourceKey;
    if (!refining) {
      twoPhaseAlgorithm = "";
      twoPhaseBestMoveCount = null;
      twoPhaseApply.disabled = true;
    }
    twoPhaseSourceKey = sourceKey;
    twoPhasePendingState = setup._0.state;
    twoPhasePendingTarget = target._0;
    twoPhaseSolveBusy = true;
    twoPhaseSolve.textContent = "Cancel search";
    twoPhaseResult.textContent = refining
      ? `Searching below ${twoPhaseBestMoveCount} HTM…`
      : "Starting two-phase search…";
    twoPhaseResult.classList.remove("failure", "success");
    try {
      const solution = await twoPhaseSolverClient.solve(
        relative._0,
        refining ? {refine: true, maximumDepth: twoPhaseBestMoveCount! - 1} : undefined,
      );
      if (request !== twoPhaseRequest) return;
      const replay = MoveExecutor.applyAlg(setup._0.state, solution.alg) as Result<CubeState, unknown>;
      if (replay.TAG !== "Ok") {
        throw new Error("The two-phase solution did not replay from Setup to the target.");
      }
      if (FaceletCodec.render(replay._0) !== FaceletCodec.render(target._0)) {
        throw new Error("The two-phase solution did not replay from Setup to the target.");
      }
      const algorithm = MoveTransform.serialize(solution.alg) as string;
      if (twoPhaseSourceKeyForCurrent() !== twoPhaseSourceKey) {
        twoPhaseResult.textContent = "Setup or Target changed; discarded the stale two-phase solution.";
        twoPhaseResult.classList.add("failure");
        twoPhaseApply.disabled = true;
        return;
      }
      twoPhaseAlgorithm = algorithm;
      twoPhaseApply.disabled = algorithm === "";
      twoPhaseResult.textContent = `${solution.moveCount} HTM · ${algorithm || "Solved"}`;
      twoPhaseResult.classList.add("success");
    } catch (reason) {
      if (request !== twoPhaseRequest) return;
      const message = reason instanceof Error ? reason.message : "The two-phase solver failed.";
      if (refining && message === "No shorter two-phase solution was found.") {
        twoPhaseResult.textContent = `No shorter result found; keeping ${twoPhaseBestMoveCount} HTM · ${twoPhaseAlgorithm}.`;
        twoPhaseResult.classList.remove("failure");
        twoPhaseResult.classList.add("success");
      } else {
        twoPhaseResult.textContent = message;
        twoPhaseResult.classList.add("failure");
      }
    } finally {
      if (request !== twoPhaseRequest) return;
      twoPhaseSolveBusy = false;
      twoPhaseSolve.textContent = twoPhaseAlgorithm === ""
        ? "Find two-phase solution"
        : "Search for better result";
      twoPhaseSolve.disabled = size !== 3;
    }
  });

  twoPhaseApply.addEventListener("click", () => {
    if (twoPhaseAlgorithm === "") return;
    if (twoPhaseSourceKeyForCurrent() !== twoPhaseSourceKey) {
      twoPhaseResult.textContent = "Setup or Target changed; generate a new two-phase solution.";
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

  const previewAcubeStates = () => {
    const parsed = parseAcubeConstraint(acubeGeneratorInput.value);
    if (parsed.TAG === "Error") {
      acubeGeneratorResult.textContent = parsed._0;
      acubeGeneratorResult.classList.add("failure");
      acubeGeneratorChoice.replaceChildren();
      acubeGeneratorChoice.disabled = true;
      acubeGeneratorRun.disabled = true;
      return;
    }
    const count = countAcubeCompletions(parsed._0);
    if (count === 0n) {
      acubeGeneratorResult.textContent = "This ACube definition has no legal completion.";
      acubeGeneratorResult.classList.add("failure");
      return;
    }
    const limit = Number(count < 6n ? count : 6n);
    const choices: Array<{seed: string; completion: string}> = [];
    const seen = new Set<string>();
    for (let index = 0; index < limit * 16 && choices.length < limit; index += 1) {
      const seed = `${acubeGeneratorSeed.value} · ${index + 1}`;
      const generated = materializeAcubeConstraint(parsed._0, seed);
      const completion = generated.TAG === "Ok" ? renderAcubeState(generated._0) : generated;
      if (completion.TAG === "Ok" && !seen.has(completion._0)) {
        seen.add(completion._0);
        choices.push({seed, completion: completion._0});
      }
    }
    acubeGeneratorChoice.replaceChildren(...choices.map((choice, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `Variant ${index + 1} · ${choice.completion}`;
      return option;
    }));
    acubeGeneratorChoice.disabled = choices.length === 0;
    acubeGeneratorRun.disabled = choices.length === 0;
    acubeGeneratorRun.dataset.acubeChoices = JSON.stringify(choices);
    if (choices.length === 0) {
      acubeGeneratorResult.textContent = "This ACube definition has no legal completion.";
      acubeGeneratorResult.classList.add("failure");
    } else {
      acubeGeneratorResult.textContent = `${count.toLocaleString()} legal completion${count === 1n ? "" : "s"}; showing ${choices.length} seeded choice${choices.length === 1 ? "" : "s"}.`;
      acubeGeneratorResult.classList.remove("failure");
    }
  };
  acubeGeneratorRun.addEventListener("click", () => {
    const choices = JSON.parse(acubeGeneratorRun.dataset.acubeChoices ?? "[]") as Array<{seed: string; completion: string}>;
    const choice = choices[Number(acubeGeneratorChoice.value)];
    if (!choice) return;
    store.patch({size: 3, input: choice.completion, moves: "", notationDialect: "Acube"});
    acubeGeneratorResult.textContent = `Loaded legal ACube completion for seed '${choice.seed}'.`;
  });
  acubeGeneratorNext.addEventListener("click", () => {
    const match = /^(.*?)(\d+)$/.exec(acubeGeneratorSeed.value);
    acubeGeneratorSeed.value = match ? `${match[1]}${Number(match[2]) + 1}` : `${acubeGeneratorSeed.value}-2`;
    previewAcubeStates();
  });
  acubeGeneratorInput.addEventListener("input", previewAcubeStates);
  acubeGeneratorSeed.addEventListener("input", previewAcubeStates);
  previewAcubeStates();

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
    if (method === null || activeRecognized === null) return;
    const initialState = activeRecognized.state;
    if (method === "twoByTwoBeginner" || method === "twoByTwoPetrus") {
      if (size !== 2) return;
      const academy = academyForMethod(method);
      const request = academyRequestGuard.begin();
      academySolveBusy = true;
      updateAcademySolveButton();
      academy.status.classList.remove("error");
      academy.status.textContent = method === "twoByTwoPetrus"
        ? "Selecting a frame and replay-verifying first square, back pair, and finish…"
        : "Planning and replay-verifying first layer, OLL, and PBL…";
      const solutionRequest = method === "twoByTwoPetrus"
        ? twoByTwoPetrusSolverClient.solve(initialState)
        : twoByTwoAcademySolverClient.solve(initialState);
      void solutionRequest.then((solution) => {
        if (!academyRequestGuard.isCurrent(request)) return;
        academySolveBusy = false;
        const replay = MoveExecutor.applyAlg(initialState, solution.alg) as Result<CubeState, unknown>;
        if (replay.TAG === "Error" || !isMonochromeSolved2x2(replay._0)) {
          academy.status.textContent = "The generated 2×2 route did not reach a monochrome solved cube.";
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
      return;
    }
    if (size !== 3) return;
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
      academyForMethod(selectedTutorialMethod() ?? "beginner").status.textContent = "Connect a 3×3 smart cube to start an instant drill.";
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
      academyForMethod(selectedTutorialMethod() ?? "beginner").status.textContent = "Connect a smart cube to load a curated virtual drill.";
      return;
    }
    const parsed = MoveParser.parseWithOptions(3, "Wide", "Modern", drill.algorithm) as Result<unknown[], {message: string}>;
    if (parsed.TAG === "Error") {
      academyForMethod(selectedTutorialMethod() ?? "beginner").status.textContent = parsed._0.message;
      return;
    }
    const solved = StateTypes.solved(3) as Result<CubeState, unknown>;
    if (solved.TAG !== "Ok") return;
    const rotated = MoveTransform.rotate(parsed._0, "Y", yRotation);
    const caseState = MoveExecutor.applyAlg(solved._0, MoveTransform.invert(rotated)) as Result<CubeState, unknown>;
    if (caseState.TAG === "Error") {
      academyForMethod(selectedTutorialMethod() ?? "beginner").status.textContent = "Could not construct the selected drill case.";
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
  twoByTwoLoadDrill.addEventListener("click", () => {
    const drill = twoByTwoDrillCases.find((entry) => entry.id === twoByTwoDrillCase.value);
    if (!drill) return;
    store.patch({
      size: 2,
      input: drill.scramble,
      moves: "",
      activeTab: "academy",
      academyMethod: "twoByTwoBeginner",
    });
  });
  twoByTwoPetrusLoadDrill.addEventListener("click", () => {
    const drill = twoByTwoPetrusDrillCases.find((entry) => entry.id === twoByTwoPetrusDrillCase.value);
    if (!drill) return;
    store.patch({
      size: 2,
      input: drill.scramble,
      moves: "",
      activeTab: "academy",
      academyMethod: "twoByTwoPetrus",
    });
  });
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
    if (smartCubeReplayRequested || smartCubeMockMode) {
      try {
        const manager = await loadSmartCubeManager();
        await manager.connect();
        renderSmartCubeReplay();
      } catch (reason) {
        showBluetoothUnavailable(reason instanceof Error ? reason.message : String(reason));
      }
      return;
    }
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
      // GAN i4 MAC recovery is a no-op for every other device and runs before
      // its GATT connection, so an i4 enters its encrypted path directly.
      await manager.connect();
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
  smartCubeChooseSession.addEventListener("click", () => {
    // The mock page hides the ordinary Connect control. On a fresh page there
    // is no manager to reconnect yet, so route this explicit QA action through
    // the same connect flow that creates it and opens the session picker.
    if (!smartCubeManager) {
      smartCubeConnect.click();
      return;
    }
    void smartCubeManager.reconnect().catch((reason) => {
      smartCubeStatus.textContent = reason instanceof Error ? reason.message : String(reason);
    });
  });
  smartCubeReplayPlay.addEventListener("click", () => {
    const replay = smartCubeReplayControlsApi;
    if (!replay) return;
    if (replay.getReplayState().status === "playing") replay.pause();
    else replay.play();
    renderSmartCubeReplay();
  });
  smartCubeReplayStep.addEventListener("click", () => {
    smartCubeReplayControlsApi?.step();
    renderSmartCubeReplay();
  });
  smartCubeReplaySeek.addEventListener("input", () => {
    smartCubeReplayControlsApi?.seek(Number(smartCubeReplaySeek.value));
    renderSmartCubeReplay();
  });
  smartCubeReplayRate.addEventListener("change", () => {
    smartCubeReplayControlsApi?.setRate(Number(smartCubeReplayRate.value));
    renderSmartCubeReplay();
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
    const facelets = toSpacedFacelets(FaceletCodec.render(smartCubeLiveState), 3);
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
      updateManualStateSmartCubeControl();
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
  smartCubeRecenter.addEventListener("click", () => {
    recenterSmartCubeGyroView("button");
  });
  smartCubeDiagnostics.addEventListener("click", () => {
    smartCubeDiagnosticsEnabled = !smartCubeDiagnosticsEnabled;
    window.localStorage.setItem("cubelab.smartCube.diagnostics", smartCubeDiagnosticsEnabled ? "1" : "0");
    if (!smartCubeDiagnosticsEnabled) smartCubeDiagnosticTrace.length = 0;
    updateSmartCubeRegripGauge(latestSmartCubeOrientation?.quaternion, latestSmartCubeOrientation?.coordinateFrame);
    updateSmartCubeDiagnosticsUi();
    smartCubeStatus.textContent = smartCubeDiagnosticsEnabled
      ? `${smartCubeDeviceName} · Diagnostics capture enabled locally; nothing is uploaded automatically.`
      : `${smartCubeDeviceName} · Diagnostics capture disabled and local trace cleared.`;
  });
  smartCubeCopyTrace.addEventListener("click", async () => {
    const device = smartCubeManager?.getState().device ?? {
      name: smartCubeDeviceName,
      macAddress: null,
      brand: "gocube" as const,
      brandName: "Unknown smart cube",
      protocolId: "diagnostic",
      protocolName: "Diagnostic capture",
      capabilities: {orientation: false, battery: false, facelets: false, hardware: false, reset: false, led: false},
    };
    // Gen4 only confirms gyro support when its first 0xEC packet arrives. A
    // diagnostic header is exported after that packet, so retain the observed
    // capability instead of reporting the pre-stream connection snapshot.
    const observedOrientation = smartCubeDiagnosticTrace.some(({event, detail}) =>
      event === "received event" && detail.type === "orientation",
    );
    const diagnosticDevice = observedOrientation && !device.capabilities.orientation
      ? {...device, capabilities: {...device.capabilities, orientation: true}}
      : device;
    const origin = Date.parse(smartCubeDiagnosticTrace[0]?.at ?? new Date().toISOString());
    const report = {
      schema: "cubelab-smart-cube-tape-v1",
      profile: "diagnostic",
      capturedAt: new Date(origin).toISOString(),
      header: {
        device: diagnosticDevice,
        syncMode: smartCubeSyncMode,
        orientationTracking: smartCubeOrientationTracking,
        recording: smartCubeRecording,
        route: activeTab === "academy" ? window.location.hash || null : null,
        inputHash: window.location.hash,
        settings: {autoOrbit, regripThresholdDegrees: 65},
      },
      timeline: smartCubeDiagnosticTrace.map(({at, event, detail}) => ({
        offsetMs: Math.max(0, Math.round(Date.parse(at) - origin)),
        kind: event === "received event" && detail.type !== "facelets" ? "input" as const : "derived" as const,
        ...(event === "received event" && detail.type !== "facelets"
          ? {event: detail}
          : {trigger: event === "received event" ? "redacted-facelets" : event, in: {}, out: detail.type === "facelets" ? {faceletCount: typeof detail.facelets === "string" ? detail.facelets.length : 0} : detail}),
      })),
    };
    const copied = await copyText(JSON.stringify(report, null, 2));
    if (copied) {
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Copied ${smartCubeDiagnosticTrace.length} diagnostic events. Send this text with your issue report.`;
    } else {
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Could not copy the trace. Check browser clipboard permission and try again.`;
    }
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
    setAutoOrbitEnabled(false, false);
    viewport?.resetCamera();
    syncSmartCubeTrackedOrientation();
  };
  root.querySelector<HTMLButtonElement>("[data-reset-camera]")!.addEventListener("click", resetCameraView);
  const snapshotButton = root.querySelector<HTMLButtonElement>("[data-snapshot-cube]");
  // Shared by the plain Snapshot and the composited Solve card: try the
  // clipboard first, fall back to a download, and flash the triggering
  // button's own label so each control reports its own outcome.
  const deliverPngBlob = async (blob: Blob, button: HTMLButtonElement | null, filenamePrefix: string) => {
    let copied = false;
    if (navigator.clipboard && typeof window.ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (button) {
      const originalText = button.textContent;
      button.textContent = copied ? "Copied!" : "Downloaded!";
      window.setTimeout(() => {
        button.textContent = originalText;
      }, 1500);
    }
    if (!copied) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${filenamePrefix}-${Date.now()}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  };
  const takeSnapshot = async () => {
    if (!viewport) return;
    const blob = await viewport.capturePng();
    if (!blob) return;
    await deliverPngBlob(blob, snapshotButton, `cubelab-${size}x${size}`);
  };
  snapshotButton?.addEventListener("click", () => {
    void takeSnapshot();
  });
  const solveCardButton = root.querySelector<HTMLButtonElement>("[data-solve-card]");
  const wrapCanvasText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] => {
    const words = text.split(/\s+/).filter((word) => word !== "");
    const lines: string[] = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (ctx.measureText(candidate).width > maxWidth && line !== "") {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line !== "") lines.push(line);
    return lines;
  };
  const takeSolveCard = async () => {
    if (!viewport) return;
    const blob = await viewport.capturePng();
    if (!blob) return;
    const bitmap = await createImageBitmap(blob);
    const padding = 24;
    const imageSize = Math.min(bitmap.width, 480);
    const scale = imageSize / bitmap.width;
    const imageHeight = bitmap.height * scale;
    const textWidth = 420;
    const lineHeight = 22;
    const rows: {label: string; value: string}[] = [];
    if (input.value.trim() !== "") rows.push({label: "Setup", value: input.value.trim()});
    if (movesInput.value.trim() !== "") rows.push({label: "Moves", value: movesInput.value.trim()});
    if (noteInput.value.trim() !== "") rows.push({label: "Note", value: noteInput.value.trim()});
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "16px monospace";
    const wrapped = rows.map((row) => ({label: row.label, lines: wrapCanvasText(ctx, row.value, textWidth)}));
    let textHeight = lineHeight;
    wrapped.forEach((row) => {
      textHeight += lineHeight + row.lines.length * lineHeight + 10;
    });
    const width = padding * 3 + imageSize + textWidth;
    const height = Math.max(imageHeight + padding * 2, textHeight + padding * 2);
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "#0b0f19";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, padding, padding, imageSize, imageHeight);
    const textX = padding * 2 + imageSize;
    let y = padding + 18;
    ctx.fillStyle = "#c7d2fe";
    ctx.font = "700 15px sans-serif";
    ctx.fillText(`CubeLab · ${size}×${size}×${size}`, textX, y);
    y += lineHeight + 8;
    wrapped.forEach((row) => {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "700 12px sans-serif";
      ctx.fillText(row.label.toUpperCase(), textX, y);
      y += lineHeight;
      ctx.fillStyle = "#f9fafb";
      ctx.font = "16px monospace";
      row.lines.forEach((line) => {
        ctx.fillText(line, textX, y);
        y += lineHeight;
      });
      y += 10;
    });
    const cardBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!cardBlob) return;
    await deliverPngBlob(cardBlob, solveCardButton, `cubelab-solve-card-${size}x${size}`);
  };
  solveCardButton?.addEventListener("click", () => {
    void takeSolveCard();
  });
  // Any modal <dialog> geometrically overlaps the same viewport bounds
  // IntersectionObserver tracks, so opening one otherwise leaves auto-orbit
  // and any active focus/turnGuide highlight rendering and compositing
  // every frame behind it, unseen. showModal() has no companion "open"
  // event, so each call site pairs with this explicitly; a dialog's native
  // "close" event fires for every way it closes (a button's own .close(),
  // Escape, or a form submission), so one listener per dialog catches them
  // all without hunting down every close trigger.
  const updateViewportDialogOcclusion = () => {
    viewport?.setDialogOpen(manualStateDialog.open || shortcutsDialog.open || settingsDialog.open);
  };
  [manualStateDialog, shortcutsDialog, settingsDialog].forEach((dialog) => {
    dialog.addEventListener("close", updateViewportDialogOcclusion);
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dialog.close();
      }
    });
  });
  shortcutsHelp.addEventListener("click", () => {
    shortcutsDialog.showModal();
    updateViewportDialogOcclusion();
  });
  shortcutsClose.addEventListener("click", () => shortcutsDialog.close());
  manualStateDialog.addEventListener("close", () => {
    resetManualState3dOrientation(true);
    setManualStateShiftPressed(false);
    manualStateSmartCubeSyncPending = false;
    updateManualStateSmartCubeControl();
  });
  window.addEventListener("keydown", (event) => {
    if (!manualStateDialog.open) return;
    if (event.key === "Shift") setManualStateShiftPressed(true);
  });
  window.addEventListener("keyup", (event) => {
    if (!manualStateDialog.open) return;
    if (event.key === "Shift" || !event.shiftKey) setManualStateShiftPressed(false);
  });
  window.addEventListener("blur", () => {
    if (manualStateShiftPressed) setManualStateShiftPressed(false);
  });
  manualStateDialog.addEventListener("pointermove", (event) => {
    if (!manualStateDialog.open) return;
    if (manualStateShiftPressed !== event.shiftKey) setManualStateShiftPressed(event.shiftKey);
  });
  manualStateDialog.addEventListener("pointerdown", (event) => {
    if (!manualStateDialog.open) return;
    if (manualStateShiftPressed !== event.shiftKey) setManualStateShiftPressed(event.shiftKey);
  });
  manualStateOpen.addEventListener("click", openManualStateEditor);
  manualStateCancel.addEventListener("click", () => manualStateDialog.close());
  manualStatePalette.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-manual-state-colour]");
    if (!button) return;
    const face = button.dataset.manualStateColour as ManualStateFace;
    if (event.shiftKey || manualStateShiftPressed) {
      resetManualStateColour(face);
      return;
    }
    manualStateColour = face;
    renderManualStateEditor();
  });
  manualStateEraser.addEventListener("click", () => {
    manualStateColour = null;
    renderManualStateEditor();
  });
  const manualStateRawStickerAtElement = (element: Element | null): number | null => {
    const sticker = element?.closest("[data-manual-state-index]");
    if (!sticker) return null;
    const index = Number(sticker.dataset.manualStateIndex);
    return Number.isInteger(index) ? index : null;
  };
  const manualStateRawStickerAt = (event: Event): number | null => {
    const fromTarget = manualStateRawStickerAtElement(event.target as Element | null);
    if (fromTarget !== null) return fromTarget;
    if ("clientX" in event && typeof (event as MouseEvent).clientX === "number") {
      const atPoint = document.elementFromPoint((event as MouseEvent).clientX, (event as MouseEvent).clientY);
      return manualStateRawStickerAtElement(atPoint);
    }
    return null;
  };
  const manualStateStickerAt = (event: Event): number | null => {
    const index = manualStateRawStickerAt(event);
    return index !== null && isManualStateStickerInteractive(index) ? index : null;
  };
  const manualStateStickerAtPoint = (x: number, y: number): number | null => {
    const index = manualStateRawStickerAtElement(document.elementFromPoint(x, y));
    return index !== null && isManualStateStickerInteractive(index) ? index : null;
  };
  const setManualStateCursor = (index: number, focus = false) => {
    if (!isManualStateStickerInteractive(index)) return;
    setManualStateCursorIndex(index);
    manualStateStickerElements.forEach((sticker, stickerIndex) => {
      sticker.dataset.cursor = String(stickerIndex === index);
    });
    if (focus) manualStateStickerElements[index]?.focus({preventScroll: true});
  };
  type ManualStateStroke = {
    pointerId: number;
    erase: boolean;
    visited: Set<number>;
    before: ManualStateSnapshot;
  };
  let manualStateStroke: ManualStateStroke | null = null;
  let suppressManualStateClick = false;
  const wireManualStatePainting = (paintRoot: HTMLElement) => {
    paintRoot.addEventListener("click", (event) => {
      if (suppressManualStateClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const index = manualStateStickerAt(event);
      if (index === null) return;
      setManualStateCursor(index, true);
      // An already-filled sticker ignores a plain click instead of silently
      // repainting over it — double-click loads that sticker's own colour
      // into the palette below, and a same-click repaint here would race it,
      // clobbering the original colour before the double-click could read
      // it. Shift-click still erases a filled sticker in one step either way.
      if (event.shiftKey) {
        eraseManualStateSticker(index);
        return;
      }
      if (fixManualStateAutoSticker(index)) return;
      // A blank sticker's dots are individually clickable: whichever one was
      // actually clicked wins over the currently selected palette colour or eraser, so
      // a dot works as a direct shortcut rather than requiring the palette
      // to already match it first.
      const dot = (event.target as Element).closest<HTMLElement>(".manual-state-dots i");
      if (dot?.dataset.face) {
        paintManualStateSticker(index, dot.dataset.face as ManualStateFace);
        return;
      }
      if (manualStateColour === null) {
        eraseManualStateSticker(index);
        return;
      }
      if (manualStateDraft[index] !== null) return;
      paintManualStateSticker(index, manualStateColour);
    });
    // Contextmenu is suppressed on stickers so accidental right-clicks do not
    // spawn a browser context menu over the net.
    paintRoot.addEventListener("contextmenu", (event) => {
      const index = manualStateStickerAt(event);
      if (index === null) return;
      event.preventDefault();
    });
    // Double-click a filled sticker to pick up its colour into the palette,
    // without altering the sticker itself.
    paintRoot.addEventListener("dblclick", (event) => {
      const index = manualStateRawStickerAt(event);
      if (index === null) return;
      const value = manualStateDraft[index];
      if (value === null) return;
      setManualStateCursor(index, true);
      manualStateColour = value;
      renderManualStateEditor();
    });
    // Pointer capture keeps a drag coherent while the 3D planes move under
    // it. elementFromPoint resolves the foremost visible face at each point;
    // a per-stroke set makes a tile paint at most once.
    const paintStrokeAt = (index: number, event: PointerEvent, stroke: ManualStateStroke) => {
      if (stroke.visited.has(index)) return;
      stroke.visited.add(index);
      setManualStateCursor(index, true);
      if (!event.shiftKey && fixManualStateAutoSticker(index, false)) {
        return;
      }
      if (stroke.erase) {
        eraseManualStateSticker(index, false);
      } else {
        const dot = (event.target as Element | null)?.closest<HTMLElement>(".manual-state-dots i")
          ?? (document.elementFromPoint(event.clientX, event.clientY) as Element | null)?.closest<HTMLElement>(".manual-state-dots i");
        if (dot?.dataset.face) {
          paintManualStateSticker(index, dot.dataset.face as ManualStateFace, false);
        } else if (manualStateColour !== null && manualStateDraft[index] === null) {
          paintManualStateSticker(index, manualStateColour, false);
        }
      }
    };
    paintRoot.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const index = manualStateStickerAt(event);
      if (index === null) return;
      const dot = (event.target as Element | null)?.closest<HTMLElement>(".manual-state-dots i")
        ?? (document.elementFromPoint(event.clientX, event.clientY) as Element | null)?.closest<HTMLElement>(".manual-state-dots i");
      const dotFace = !event.shiftKey && dot?.dataset.face ? (dot.dataset.face as ManualStateFace) : null;
      const stroke: ManualStateStroke = {
        pointerId: event.pointerId,
        erase: event.shiftKey || (manualStateColour === null && dotFace === null),
        visited: new Set<number>(),
        before: captureManualStateSnapshot(),
      };
      manualStateStroke = stroke;
      suppressManualStateClick = true;
      window.setTimeout(() => { suppressManualStateClick = false; }, 0);
      paintRoot.setPointerCapture(event.pointerId);
      paintStrokeAt(index, event, stroke);
    });
    paintRoot.addEventListener("pointermove", (event) => {
      const stroke = manualStateStroke;
      if (!stroke || stroke.pointerId !== event.pointerId) return;
      const index = manualStateStickerAtPoint(event.clientX, event.clientY);
      if (index !== null) paintStrokeAt(index, event, stroke);
    });
    const finishManualStateStroke = (event: PointerEvent) => {
      const stroke = manualStateStroke;
      if (stroke?.pointerId !== event.pointerId) return;
      manualStateStroke = null;
      if (paintRoot.hasPointerCapture(event.pointerId)) paintRoot.releasePointerCapture(event.pointerId);
      commitManualStateAction(stroke.before);
    };
    paintRoot.addEventListener("pointerup", finishManualStateStroke);
    paintRoot.addEventListener("pointercancel", finishManualStateStroke);
    paintRoot.addEventListener("lostpointercapture", () => {
      const stroke = manualStateStroke;
      manualStateStroke = null;
      if (stroke) commitManualStateAction(stroke.before);
    });
  };
  wireManualStatePainting(manualStateGrid);
  // Flat and folded nets preserve physical cube topology. The small 3×3
  // table below provides the orientation; interpolating its endpoints lets
  // the same topology work at every supported size.
  const manualStateArrowTarget = (
    manualSize: ManualStateSize,
    index: number,
    direction: "top" | "bottom" | "left" | "right",
  ): number | null => {
    const perFace = manualSize * manualSize;
    const face = faceletOrder[Math.floor(index / perFace)];
    const local = index % perFace;
    const row = Math.floor(local / manualSize);
    const col = local % manualSize;
    const atEdge = (direction === "left" && col === 0)
      || (direction === "right" && col === manualSize - 1)
      || (direction === "top" && row === 0)
      || (direction === "bottom" && row === manualSize - 1);
    if (atEdge) {
      const offset = direction === "left" || direction === "right" ? row : col;
      const samples = MANUAL_STATE_EDGE_WRAP[face][direction];
      const [wrapFace, first] = samples[0];
      const [, last] = samples[samples.length - 1];
      const firstRow = Math.floor(first / 3);
      const firstColumn = first % 3;
      const lastRow = Math.floor(last / 3);
      const lastColumn = last % 3;
      const ratio = offset / (manualSize - 1);
      const wrapRow = Math.round((firstRow + (lastRow - firstRow) * ratio) * (manualSize - 1) / 2);
      const wrapColumn = Math.round((firstColumn + (lastColumn - firstColumn) * ratio) * (manualSize - 1) / 2);
      return faceletOrder.indexOf(wrapFace) * perFace + wrapRow * manualSize + wrapColumn;
    }
    const step = {left: -1, right: 1, top: -manualSize, bottom: manualSize}[direction];
    return index + step;
  };
  const manualStateArrowKeys: Record<string, "left" | "right" | "top" | "bottom"> = {
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "top", ArrowDown: "bottom",
  };
  const manualStateOrientedArrowTarget = (
    manualSize: ManualStateSize,
    index: number,
    direction: "left" | "right" | "top" | "bottom",
  ): number | null => {
    const yQuarterTurns = (4 - manualStateOrientation) % 4;
    const displayedIndex = manualStateViewDestination(
      manualSize,
      index,
      yQuarterTurns,
      manualStateFlipped,
    );
    const displayedTarget = manualStateArrowTarget(manualSize, displayedIndex, direction);
    if (displayedTarget === null) return null;
    const source = manualStateStickerElements.findIndex((_, candidate) =>
      manualStateViewDestination(manualSize, candidate, yQuarterTurns, manualStateFlipped) === displayedTarget
    );
    return source >= 0 ? source : null;
  };
  const manualStateColourKeys: Readonly<Record<string, ManualStateFace>> = {
    U: "U", W: "U",
    R: "R",
    F: "F", G: "F",
    D: "D", Y: "D",
    L: "L", O: "L",
    B: "B",
  };
  const manualStateFocusableSticker = (index: number): HTMLElement | null => manualStateStickerElements[index] ?? null;
  const manualStateRenderedCentre = (element: HTMLElement): {x: number; y: number} => {
    // getBoundingClientRect() describes an axis-aligned envelope. At the
    // deliberately non-isometric -35° yaw that envelope's centre is no
    // longer the visual centre of a skewed sticker, especially at seams.
    // A DOMQuad follows the transformed sticker plane exactly.
    const getBoxQuads = (element as HTMLElement & {
      getBoxQuads?: () => Array<{p1: DOMPoint; p2: DOMPoint; p3: DOMPoint; p4: DOMPoint}>;
    }).getBoxQuads;
    const quad = getBoxQuads?.call(element)[0];
    if (quad) {
      return {
        x: (quad.p1.x + quad.p2.x + quad.p3.x + quad.p4.x) / 4,
        y: (quad.p1.y + quad.p2.y + quad.p3.y + quad.p4.y) / 4,
      };
    }
    const rect = element.getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  };
  const manualStateScreenArrowTarget = (
    index: number,
    direction: "top" | "bottom" | "left" | "right",
  ): number | null => {
    const source = manualStateFocusableSticker(index);
    if (!source) return null;
    const sourceCentre = manualStateRenderedCentre(source);
    const axis = direction === "left" || direction === "right" ? "x" : "y";
    const sign = direction === "left" || direction === "top" ? -1 : 1;
    let best: {index: number; score: number} | null = null;
    manualStateStickerElements.forEach((candidate, candidateIndex) => {
      if (candidateIndex === index || !isManualStateStickerInteractive(candidateIndex)) return;
      const centre = manualStateRenderedCentre(candidate);
      const dx = centre.x - sourceCentre.x;
      const dy = centre.y - sourceCentre.y;
      const primary = sign * (axis === "x" ? dx : dy);
      if (primary < 1) return;
      const lateral = Math.abs(axis === "x" ? dy : dx);
      // Prefer the closest sticker in the intended screen direction while
      // strongly discouraging diagonal jumps across an exploded gap.
      const score = primary + lateral * 2;
      if (best === null || score < best.score) best = {index: candidateIndex, score};
    });
    return best?.index ?? null;
  };
  const wireManualStateKeyboard = (keyboardRoot: EventTarget) => {
    const handleKeyDown = (rawEvent: Event) => {
      if (!manualStateDialog.open) return;
      const event = rawEvent as KeyboardEvent;
      // The dialog also listens on window so cursor navigation remains useful
      // after toolbar clicks. Never let that convenience consume notation
      // typing, selection, undo, or other native textarea shortcuts.
      const target = event.target;
      if (target instanceof Element && target.closest("[data-manual-state-notation]")) return;
      const historyModifier = event.ctrlKey || event.metaKey;
      const isZ = event.key === "z" || event.key === "Z" || event.code === "KeyZ";
      const isY = event.key === "y" || event.key === "Y" || event.code === "KeyY";
      if (historyModifier && ((isZ && event.shiftKey) || isY)) {
        event.preventDefault();
        event.stopPropagation();
        redoManualStateAction();
        return;
      }
      if (historyModifier && isZ) {
        event.preventDefault();
        event.stopPropagation();
        undoManualStateAction();
        return;
      }
      const focused = (document.activeElement as Element | null)?.closest("[data-manual-state-index]");
      const focusedIndex = focused ? Number(focused.dataset.manualStateIndex) : null;
      const index = focusedIndex !== null && Number.isInteger(focusedIndex) && isManualStateStickerInteractive(focusedIndex)
        ? focusedIndex
        : manualStateCursorIndex;
      if (index === null || !isManualStateStickerInteractive(index)) return;
      const manualSize = size as ManualStateSize;
      const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
      const colour = manualStateColourKeys[key];
      if (colour) {
        event.preventDefault();
        event.stopPropagation();
        paintManualStateSticker(index, colour);
        return;
      }
      if (key === "E") {
        event.preventDefault();
        event.stopPropagation();
        eraseManualStateSticker(index);
        return;
      }
      // C used to erase here. Keep it from reaching the page-level camera
      // reset shortcut while a sticker is focused, but do not give it a second
      // meaning now that E is the documented erase key.
      if (key === "C") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        (manualStateRepresentation === "dual-3d" || manualStateRepresentation === "isometric")
        && (event.key === "[" || event.key === "]")
      ) {
        event.preventDefault();
        event.stopPropagation();
        rotateManualStateView(event.key === "[" ? "ccw" : "cw");
        return;
      }
      if (manualStateRepresentation === "isometric" && (event.key === "x" || event.key === "X")) {
        event.preventDefault();
        event.stopPropagation();
        flipManualStateView();
        return;
      }
      const direction = manualStateArrowKeys[event.key];
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      let next = manualStateRepresentation === "isometric"
        ? manualStateScreenArrowTarget(index, direction)
        : manualStateOrientedArrowTarget(manualSize, index, direction);
      while (next !== null && !isManualStateStickerInteractive(next)) {
        next = manualStateRepresentation === "isometric"
          ? manualStateScreenArrowTarget(next, direction)
          : manualStateOrientedArrowTarget(manualSize, next, direction);
      }
      if (next !== null) setManualStateCursor(next, true);
    };
    keyboardRoot.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", handleKeyDown);
  };
  wireManualStateKeyboard(manualStateDialog);
  manualStateUndo.addEventListener("click", undoManualStateAction);
  manualStateRedo.addEventListener("click", redoManualStateAction);
  manualStateReset.addEventListener("click", () => {
    const actionStart = captureManualStateSnapshot();
    const manualSize = size as ManualStateSize;
    setManualStateDraft(resetManualState(manualSize));
    manualStateExplicitIndices.clear();
    manualStateDraft.forEach((colour, index) => {
      if (colour !== null) manualStateExplicitIndices.add(index);
    });
    manualStateAutoIndices.clear();
    manualStateUnverifiedDots.clear();
    manualStateDeadIndices.clear();
    manualStateDirtyDots = null;
    refreshManualStateAutoFill(manualSize, true);
    renderManualStateEditor();
    commitManualStateAction(actionStart);
  });
  manualStateSolved.addEventListener("click", () => {
    const actionStart = captureManualStateSnapshot();
    setManualStateDraft(solvedManualState(size as ManualStateSize));
    manualStateExplicitIndices.clear();
    manualStateDraft.forEach((_, index) => manualStateExplicitIndices.add(index));
    manualStateAutoIndices.clear();
    manualStateUnverifiedDots.clear();
    manualStateDeadIndices.clear();
    manualStateDirtyDots = null;
    renderManualStateEditor();
    commitManualStateAction(actionStart);
  });
  const replaceManualStateDraft = (state: CubeState, recordAction = true) => {
    const actionStart = recordAction ? captureManualStateSnapshot() : null;
    setManualStateDraft((FaceletCodec.render(state) as string).split("") as ManualStateDraft);
    manualStateExplicitIndices.clear();
    manualStateDraft.forEach((_, index) => manualStateExplicitIndices.add(index));
    manualStateAutoIndices.clear();
    manualStateUnverifiedDots.clear();
    manualStateDeadIndices.clear();
    manualStateDirtyDots = null;
    renderManualStateEditor();
    if (actionStart) commitManualStateAction(actionStart);
  };
  importManualStateSmartCube = (state: CubeState) => {
    if (!manualStateDialog.open || state.size !== size || size !== 3) return;
    replaceManualStateDraft(state);
  };
  manualStateSmartCubeSync.addEventListener("click", async () => {
    if (!manualStateDialog.open || size !== 3 || !smartCubeConnected) return;
    if (smartCubeSupportsFacelets && smartCubeManager) {
      manualStateSmartCubeSyncPending = true;
      // This refresh belongs to the editor and must not mutate Setup through
      // the viewport's separate Sync state workflow.
      smartCubeStateSyncPending = false;
      manualStateSmartCubeStatus.textContent = `${smartCubeDeviceName} · Reading physical state…`;
      updateManualStateSmartCubeControl();
      try {
        await smartCubeManager.refresh();
        if (manualStateSmartCubeSyncPending) {
          manualStateSmartCubeSyncPending = false;
          if (smartCubeLiveState) {
            importManualStateSmartCube(smartCubeLiveState);
            manualStateSmartCubeStatus.textContent = `${smartCubeDeviceName} live state imported.`;
          } else {
            manualStateSmartCubeStatus.textContent = "The connected cube did not provide a physical state.";
          }
        }
      } catch (reason) {
        manualStateSmartCubeSyncPending = false;
        manualStateSmartCubeStatus.textContent = reason instanceof Error ? reason.message : String(reason);
      } finally {
        updateManualStateSmartCubeControl();
      }
      return;
    }
    if (!smartCubeLiveState) return;
    importManualStateSmartCube(smartCubeLiveState);
    manualStateSmartCubeStatus.textContent = `${smartCubeDeviceName} live state imported.`;
    updateManualStateSmartCubeControl();
  });
  manualStateNotationApply.addEventListener("click", () => {
    const lines = manualStateNotation.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    if (lines.length === 0) {
      manualStateNotationStatus.textContent = "Enter a cube state, moves, or transformations first.";
      return;
    }
    let workingState: CubeState | null = null;
    if (manualStateCompleteDiagnostic() === null) {
      const current = FaceletCodec.parse(size, manualStateCompactFacelets()) as Result<CubeState>;
      if (current.TAG === "Ok") workingState = current._0;
    }
    let stateLines = 0;
    let notationLines = 0;
    let commentLines = 0;
    let singleStateLabel: string | null = null;
    for (const line of lines) {
      // Parse each line exactly as Setup would. Prose that Setup cannot
      // recognize is a comment, allowing annotated state-edit scripts.
      const parsed = parseState(line);
      if (parsed.TAG === "Error") {
        commentLines += 1;
        continue;
      }
      const recognized = parsed._0;
      if (!recognized.timeline) {
        workingState = recognized.state;
        stateLines += 1;
        singleStateLabel = recognized.label;
        continue;
      }
      if (workingState === null) {
        manualStateNotationStatus.textContent = "Put a valid state before moves, or complete the draft first.";
        return;
      }
      const applied = MoveExecutor.applyAlg(workingState, recognized.timeline.alg) as Result<CubeState, unknown>;
      if (applied.TAG === "Error") {
        manualStateNotationStatus.textContent = "Could not apply that notation to the current cube.";
        return;
      }
      workingState = applied._0;
      notationLines += 1;
    }
    if (stateLines + notationLines === 0 || workingState === null) {
      manualStateNotationStatus.textContent = "No cube state, moves, or transformations found.";
      return;
    }
    replaceManualStateDraft(workingState);
    if (lines.length === 1 && stateLines === 1) {
      manualStateNotationStatus.textContent = `${singleStateLabel} loaded.`;
    } else if (lines.length === 1 && notationLines === 1) {
      manualStateNotationStatus.textContent = "Moves applied.";
    } else {
      const stateSummary = `${stateLines} state${stateLines === 1 ? "" : "s"}`;
      const notationSummary = `${notationLines} notation line${notationLines === 1 ? "" : "s"}`;
      const commentSummary = commentLines === 0
        ? ""
        : `; ignored ${commentLines} comment${commentLines === 1 ? "" : "s"}`;
      manualStateNotationStatus.textContent = `Applied ${stateSummary} and ${notationSummary}${commentSummary}.`;
    }
  });
  manualStateLoad.addEventListener("click", () => {
    const diagnostic = manualStateCompleteDiagnostic();
    if (diagnostic !== null) return;
    const manualSize = size as ManualStateSize;
    store.patch({input: manualStateSpacedFacelets(manualSize)});
    manualStateDialog.close();
    input.focus();
  });
  const copyManualStateText = async (text: string, button: HTMLButtonElement) => {
    const originalText = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied!";
    } catch {
      button.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  };
  manualStateCopyToggle.addEventListener("click", () => {
    const open = manualStateCopyMenu.hidden;
    manualStateCopyMenu.hidden = !open;
    manualStateCopyToggle.setAttribute("aria-expanded", String(open));
  });
  manualStateCopyMenu.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-manual-state-copy-format]");
    if (!button) return;
    const manualSize = size as ManualStateSize;
    const text = button.dataset.manualStateCopyFormat === "spaced"
      ? manualStateSpacedFacelets(manualSize)
      : button.dataset.manualStateCopyFormat === "singmaster"
      ? manualStateSingmasterCycles(manualSize)
      : manualStateCompactFacelets();
    manualStateCopyMenu.hidden = true;
    manualStateCopyToggle.setAttribute("aria-expanded", "false");
    void copyManualStateText(text, manualStateCopyToggle);
  });
  document.addEventListener("click", (event) => {
    if (manualStateCopyMenu.hidden) return;
    const target = event.target as Element;
    if (manualStateCopyMenu.contains(target) || manualStateCopyToggle.contains(target)) return;
    manualStateCopyMenu.hidden = true;
    manualStateCopyToggle.setAttribute("aria-expanded", "false");
  });
  autoOrbitButton.addEventListener("click", () => {
    if (smartCubeOrientationTracking) return;
    setAutoOrbitEnabled(autoOrbitButton.getAttribute("aria-pressed") !== "true");
  });
  settingsAutoOrbit.addEventListener("click", () => {
    if (smartCubeOrientationTracking) return;
    setAutoOrbitEnabled(settingsAutoOrbit.getAttribute("aria-pressed") !== "true");
  });
  settingsOpen.addEventListener("click", () => {
    settingsSize.value = String(size);
    settingsScheme.value = schemeSelect.value;
    settingsDialect.value = notationDialect;
    settingsTnoodleUrl.value = preferences.tnoodleServerUrl;
    const tnoodleVerified = hasVerifiedTnoodle(preferences);
    settingsTnoodleEnabled.disabled = !tnoodleVerified;
    settingsTnoodleEnabled.setAttribute("aria-pressed", String(preferences.tnoodleEnabled && tnoodleVerified));
    settingsTnoodleEnabled.classList.toggle("active", preferences.tnoodleEnabled && tnoodleVerified);
    settingsTnoodleEnabled.textContent = preferences.tnoodleEnabled && tnoodleVerified ? "On" : "Off";
    settingsTnoodleEvent.value = preferences.tnoodleEvent;
    settingsTnoodleStatus.textContent = tnoodleVerified
      ? "TNoodle configuration verified."
      : "Test this configuration before enabling TNoodle.";
    delete settingsTnoodleStatus.dataset.status;
    settingsInspectionSeconds.value = String(preferences.inspectionSeconds);
    settingsDialog.showModal();
    updateViewportDialogOcclusion();
  });
  settingsClose.addEventListener("click", () => settingsDialog.close());
  settingsSize.addEventListener("change", () => store.patch({size: Number(settingsSize.value)}));
  settingsScheme.addEventListener("change", () => store.patch({scheme: settingsScheme.value as SchemeName}));
  settingsDialect.addEventListener("change", () => store.patch({notationDialect: settingsDialect.value as NotationDialect}));
  settingsTnoodleUrl.addEventListener("change", () => {
    persistPreferences({
      tnoodleServerUrl: settingsTnoodleUrl.value,
      tnoodleEnabled: false,
      tnoodleVerifiedUrl: null,
      tnoodleVerifiedEvent: null,
    });
    settingsTnoodleEnabled.disabled = true;
  });
  settingsTnoodleEnabled.addEventListener("click", () => {
    if (!hasVerifiedTnoodle(preferences)) return;
    const enabled = settingsTnoodleEnabled.getAttribute("aria-pressed") !== "true";
    settingsTnoodleEnabled.setAttribute("aria-pressed", String(enabled));
    settingsTnoodleEnabled.classList.toggle("active", enabled);
    settingsTnoodleEnabled.textContent = enabled ? "On" : "Off";
    persistPreferences({tnoodleEnabled: enabled});
  });
  settingsTnoodleEvent.addEventListener("change", () => {
    persistPreferences({
      tnoodleEvent: settingsTnoodleEvent.value as "333",
      tnoodleEnabled: false,
      tnoodleVerifiedUrl: null,
      tnoodleVerifiedEvent: null,
    });
    settingsTnoodleEnabled.disabled = true;
  });
  settingsTnoodleTest.addEventListener("click", async () => {
    settingsTnoodleTest.disabled = true;
    settingsTnoodleStatus.textContent = "Checking TNoodle…";
    delete settingsTnoodleStatus.dataset.status;
    const health = await new TnoodleClient().checkHealth({
      serverUrl: settingsTnoodleUrl.value,
      event: settingsTnoodleEvent.value as "333",
    });
    settingsTnoodleStatus.textContent = health.online
      ? `TNoodle ready (${health.latencyMs} ms).`
      : health.message;
    settingsTnoodleStatus.dataset.status = health.online ? "ready" : "error";
    if (health.online) {
      persistPreferences({
        tnoodleVerifiedUrl: settingsTnoodleUrl.value,
        tnoodleVerifiedEvent: settingsTnoodleEvent.value as "333",
      });
      settingsTnoodleEnabled.disabled = false;
    } else {
      persistPreferences({
        tnoodleEnabled: false,
        tnoodleVerifiedUrl: null,
        tnoodleVerifiedEvent: null,
      });
      settingsTnoodleEnabled.disabled = true;
    }
    settingsTnoodleTest.disabled = false;
  });
  settingsInspectionSeconds.addEventListener("change", () => {
    const seconds = Number(settingsInspectionSeconds.value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      settingsInspectionSeconds.value = String(preferences.inspectionSeconds);
      return;
    }
    persistPreferences({inspectionSeconds: seconds});
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
    smartCubeGuidedTape = false;
    smartCubeHalfTurnProgress = null;
    stopPlayback();
    clearTurnGuide("restore");
    updateSmartCubeRecordingUi();
  });
  playbackPlay.addEventListener("click", () => {
    if (playbackDirection === 1) return;
    if (smartCubeGuidedTape) {
      smartCubeGuidedTape = false;
      smartCubeHalfTurnProgress = null;
      stopPlayback();
      clearTurnGuide("restore");
      updateSmartCubeRecordingUi();
    }
    if (smartCubeCoachingWaiting) return;
    if (hamiltonStream !== null && activeTimeline === null) void playHamiltonStream();
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
      // Playback speed has two live controls (the contextual viewport row
      // and its mirror in Settings); match by value, not by element
      // identity, so both copies of the clicked speed end up active.
      playbackSpeed = Number(button.dataset.playbackSpeed);
      root.querySelectorAll<HTMLButtonElement>("[data-playback-speed]").forEach((candidate) => {
        const active = candidate.dataset.playbackSpeed === button.dataset.playbackSpeed;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      persistPreferences({playbackSpeed});
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

  playbackGuide.addEventListener("click", () => {
    if (playbackGuide.disabled) return;
    if (smartCubeGuidedTape) {
      smartCubeGuidedTape = false;
      smartCubeHalfTurnProgress = null;
      stopPlayback();
      clearTurnGuide("restore");
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Guided tape stopped`;
      updateSmartCubeRecordingUi();
      return;
    }
    flushPendingDirectMove();
    smartCubeGuidedTape = true;
    waitForSmartCubeMove();
    updateSmartCubeRecordingUi();
  });

  playbackRecord.addEventListener("click", () => {
    if (playbackRecord.disabled) return;
    flushPendingDirectMove();
    if (smartCubeRecording) {
      smartCubeRecording = false;
      // Let the scheduled workspace update render the final Setup + Moves
      // state. Do not immediately replace it with the physical mirror.
      smartCubeRecordingTapePresented = true;
      smartCubeRecordingFrame = [];
      cancelSmartCubeRecordingAnimation();
      smartCubeRecordingTapeDirty = false;
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Recording stopped; captured turns were appended to Moves.`;
      syncSmartCubeTrackedOrientation();
      scheduleUpdate();
    } else {
      if (smartCubeGuidedTape) {
        smartCubeGuidedTape = false;
        smartCubeHalfTurnProgress = null;
        clearTurnGuide("restore");
      }
      stopPlayback();
      const workspace = parseWorkspaceState();
      smartCubeRecordingState = workspace.TAG === "Ok"
        ? workspace._0.state
        : activeRecognized?.state
        ?? (StateTypes.solved(3) as Result<CubeState, unknown>)._0;
      smartCubeRecording = true;
      smartCubeRecordingTapeDirty = false;
      smartCubeRecordingTapePresented = false;
      smartCubeRecordingFrame = [];
      cancelSmartCubeRecordingAnimation();
      smartCubeStatus.textContent = `${smartCubeDeviceName} · Recording physical turns into Moves.`;
      syncSmartCubeTrackedOrientation();
      renderSmartCubeRecordingState();
    }
    updateSmartCubeRecordingUi();
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
    if (!editing && event.shiftKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      flushPendingDirectMove();
      void takeSnapshot();
      return;
    }
    if (editing || event.metaKey || event.ctrlKey) return;
    if (
      event.key === "?"
      || (event.code === "Slash" && event.shiftKey)
      || event.key.toLowerCase() === "h"
    ) {
      event.preventDefault();
      flushPendingDirectMove();
      if (shortcutsDialog.open) shortcutsDialog.close();
      else {
        shortcutsDialog.showModal();
        updateViewportDialogOcclusion();
      }
      return;
    }
    if (manualStateDialog.open || settingsDialog.open || shortcutsDialog.open) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (manualStateDialog.open) manualStateDialog.close();
        if (settingsDialog.open) settingsDialog.close();
        if (shortcutsDialog.open) shortcutsDialog.close();
      } else if (manualStateDialog.open) {
        if ((manualStateRepresentation === "dual-3d" || manualStateRepresentation === "isometric") && event.key === "[") {
          event.preventDefault();
          rotateManualStateView("ccw");
        } else if ((manualStateRepresentation === "dual-3d" || manualStateRepresentation === "isometric") && event.key === "]") {
          event.preventDefault();
          rotateManualStateView("cw");
        } else if (manualStateRepresentation === "isometric" && (event.key === "x" || event.key === "X")) {
          event.preventDefault();
          flipManualStateView();
        }
      }
      return;
    }
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
          smartCubeGuidedTape = false;
          smartCubeHalfTurnProgress = null;
          stopPlayback();
          clearTurnGuide("restore");
        }
        else void play(1);
        updateSmartCubeRecordingUi();
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
