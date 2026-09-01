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
import * as BeginnerSolver from "../Solver/BeginnerSolver.res.mjs";
import * as CfopSolver from "../Solver/CfopSolver.res.mjs";
import {
  createCubeViewport,
  focusCameraTarget,
  turnTransform,
  type CubieFocus,
  type CubePalette,
  type CubeStyle,
  type MoveStep,
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

type Result<T, E = StateError | string> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};
type StateError = {_0?: string; TAG: string; actual?: number; character?: string; expected?: number; index?: number};
type CubeState = {size: number; facelets: string[][]};
type PieceState = {size: number; cp: number[]; co: number[]; ep: number[]; eo: number[]};
type Scheme = "Western" | "Japanese" | {TAG: "Custom"; _0: string};
type CompatibilityAssessment = {compatible: boolean; reasons: string[]};
type CompatibilityResult = Record<"wca" | "signLgn" | "cubingJs" | "speedsolving" | "ruwix", CompatibilityAssessment>;
type RecognizedInput = {
  state: CubeState;
  label: string;
  timeline?: AlgorithmTimeline;
  timelineKey?: string;
};
type TutorialMethod = "beginner" | "cfop";
type TutorialPhase = {
  number: number;
  title: string;
  instruction: string;
  alg: unknown[];
  sequences?: string[];
};
type TutorialSolution = {phases: TutorialPhase[]; alg: unknown[]; moveCount: number};
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
  const input = root.querySelector<HTMLTextAreaElement>("[data-input]")!;
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
  const transformButtons = root.querySelectorAll<HTMLButtonElement>("[data-alg-transform]");
  const nissPanel = root.querySelector<HTMLDetailsElement>("[data-niss-panel]")!;
  const nissInverseOutput = root.querySelector<HTMLElement>("[data-niss-inverse]")!;
  const nissNormal = root.querySelector<HTMLTextAreaElement>("[data-niss-normal]")!;
  const nissInverseMoves = root.querySelector<HTMLTextAreaElement>("[data-niss-inverse-moves]")!;
  const nissUseInverse = root.querySelector<HTMLButtonElement>("[data-niss-use-inverse]")!;
  const nissVerify = root.querySelector<HTMLButtonElement>("[data-niss-verify]")!;
  const nissLoad = root.querySelector<HTMLButtonElement>("[data-niss-load]")!;
  const nissResult = root.querySelector<HTMLOutputElement>("[data-niss-result]")!;
  const academySolve = root.querySelector<HTMLButtonElement>("[data-academy-solve]")!;
  const beginnerStatus = root.querySelector<HTMLElement>("[data-beginner-status]")!;
  const beginnerCurrent = root.querySelector<HTMLElement>("[data-beginner-current]")!;
  const beginnerPhases = root.querySelector<HTMLElement>("[data-beginner-phases]")!;
  const beginnerCopy = root.querySelector<HTMLButtonElement>("[data-beginner-copy]")!;
  const beginnerSolution = root.querySelector<HTMLElement>("[data-beginner-solution]")!;
  const cfopStatus = root.querySelector<HTMLElement>("[data-cfop-status]")!;
  const cfopCurrent = root.querySelector<HTMLElement>("[data-cfop-current]")!;
  const cfopPhases = root.querySelector<HTMLElement>("[data-cfop-phases]")!;
  const cfopCopy = root.querySelector<HTMLButtonElement>("[data-cfop-copy]")!;
  const cfopSolution = root.querySelector<HTMLElement>("[data-cfop-solution]")!;
  const academyComparison = root.querySelector<HTMLElement>("[data-academy-comparison]")!;
  const autoOrbitButton = root.querySelector<HTMLButtonElement>("[data-auto-orbit]")!;
  const turnGuidesButton = root.querySelector<HTMLButtonElement>("[data-turn-guides]")!;
  const coachingControls = root.querySelector<HTMLElement>("[data-coaching-controls]")!;
  const coachStatus = root.querySelector<HTMLElement>("[data-coach-status]")!;
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
  let activeRecognized: RecognizedInput | null = null;
  let tutorialPhases: TutorialPhaseRange[] = [];
  let activeAcademy: AcademyElements | null = null;
  let commentedTutorialSolution = "";
  let academySolveBusy = false;
  const savedTutorialSolutions = new Map<TutorialMethod, SavedTutorialSolution>();
  const beginnerAcademy: AcademyElements = {
    method: "beginner",
    label: "Beginner",
    phaseCount: 7,
    status: beginnerStatus,
    current: beginnerCurrent,
    phases: beginnerPhases,
    copy: beginnerCopy,
    solution: beginnerSolution,
  };
  const cfopAcademy: AcademyElements = {
    method: "cfop",
    label: "Advanced CFOP",
    phaseCount: 4,
    status: cfopStatus,
    current: cfopCurrent,
    phases: cfopPhases,
    copy: cfopCopy,
    solution: cfopSolution,
  };
  const academies = [beginnerAcademy, cfopAcademy];
  const viewport = createCubeViewport(canvas, motionOverlay, (message) => {
    viewportFallback.textContent = `${message} Text conversions remain fully functional.`;
    viewportFallback.hidden = false;
  });
  if (!viewport) autoOrbitButton.disabled = true;

  const scheme = (): Scheme =>
    schemeSelect.value === "Custom"
      ? {TAG: "Custom", _0: customScheme.value.toUpperCase()}
      : (schemeSelect.value as "Western" | "Japanese");

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

  const recognize = (result: Result<CubeState>, label: string): Result<RecognizedInput> =>
    result.TAG === "Ok" ? {TAG: "Ok", _0: {state: result._0, label}} : result;

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
    const copy = root.querySelector<HTMLButtonElement>(`[data-copy="${key}"]`);
    if (copy) copy.disabled = !copyable;
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
    nissPanel.hidden = size !== 3 || activeTab !== "workbench";
  };

  const resetNissResult = () => {
    verifiedNissSolution = "";
    nissLoad.disabled = true;
    nissResult.classList.remove("success", "failure");
    nissResult.textContent = "Enter both sides to verify a candidate solution.";
  };

  const updateNissSource = (recognized: RecognizedInput | null) => {
    inverseScramble = recognized?.timeline
      ? MoveTransform.serialize(MoveNiss.invertScramble(recognized.timeline.alg))
      : "";
    nissInverseOutput.textContent = inverseScramble || "—";
    nissUseInverse.disabled = inverseScramble === "" || size !== 3;
    nissVerify.disabled = !recognized?.timeline || size !== 3;
    resetNissResult();
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
  let activeTurnGuide: {step: MoveStep; label: string} | null = null;
  let previewedMoveIndex: number | null = null;
  let hoverPreviewCursor: number | null = null;
  let hoverPreviewGeneration = 0;
  let tutorialCameraRestore: {yaw: number; pitch: number} | null = null;
  let tutorialCameraGeneration = 0;

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
      const displayed = activeTimeline?.states?.[activeIndex];
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
    activeTurnGuide = {step, label};
    token.classList.add("turn-guided");
    const before = activeTimeline?.states?.[moveIndex];
    if (before) {
      previewedMoveIndex = moveIndex;
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

  const phaseFocusNumber = (phase: TutorialPhaseRange): number =>
    phase.method === "cfop" ? [1, 3, 5, 7][phase.number - 1] ?? phase.number : phase.number;

  const updateAcademyComparison = () => {
    const beginner = savedTutorialSolutions.get("beginner")?.solution.moveCount;
    const cfop = savedTutorialSolutions.get("cfop")?.solution.moveCount;
    academyComparison.hidden = beginner === undefined || cfop === undefined;
    if (beginner === undefined || cfop === undefined) {
      academyComparison.textContent = "";
      return;
    }
    const difference = beginner - cfop;
    const comparison = difference > 0
      ? `CFOP saves ${difference} physical move${difference === 1 ? "" : "s"} on this state.`
      : difference < 0
        ? `Beginner is ${-difference} physical move${difference === -1 ? "" : "s"} shorter on this state.`
        : "Both verified solutions use the same physical move count on this state.";
    academyComparison.textContent = `Same-state comparison · Beginner LBL ${beginner} · Advanced CFOP ${cfop}. ${comparison}`;
  };

  const selectedTutorialMethod = (): TutorialMethod | null =>
    academyMethod === "beginner" ? "beginner" : academyMethod === "advanced" ? "cfop" : null;

  const updateAcademySolveButton = () => {
    const method = selectedTutorialMethod();
    academySolve.disabled = academySolveBusy || method === null || activeRecognized === null || size !== 3;
    academySolve.textContent = method === null
      ? "Solver unavailable"
      : savedTutorialSolutions.has(method)
        ? "Regenerate solution"
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
    activeRecognized = recognized;
    resetAcademy();
    academies.forEach((academy) => {
      academy.status.classList.remove("error");
      academy.status.textContent = size !== 3
        ? `${academy.label} Academy is available for 3×3 states.`
        : recognized === null
          ? "Enter a valid 3×3 state to begin."
          : `Ready to teach the recognized ${recognized.label.toLowerCase()} state.`;
    });
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
      button.disabled = !available;
    });
  };

  const updatePlaybackUi = (rebuild = false) => {
    playback.hidden = activeTimeline === null;
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
        const showFocus = () => {
          if (timelineHoverEnabled(playbackDirection)) activateTutorialFocus(container, piece);
        };
        container.addEventListener("mouseenter", showFocus);
        container.addEventListener("mouseleave", (event) => {
          if (focusedGroup === container && !container.contains(document.activeElement)) {
            const destination = event.relatedTarget as Node | null;
            clearTutorialFocus(destination && moveRibbon.contains(destination) ? "hold" : "restore");
          }
        });
        container.addEventListener("focusin", showFocus);
        container.addEventListener("focusout", (event) => {
          const destination = event.relatedTarget as Node | null;
          if (focusedGroup === container && (!destination || !container.contains(destination))) {
            clearTutorialFocus();
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
    }
    playbackLimit.hidden = activeTimeline.states !== null;
    playbackLimit.textContent = activeTimeline.states === null
      ? `Final conversion is available; playback is limited to ${MAX_PLAYBACK_STEPS} expanded moves.`
      : "";
    const moveProgress = physicalMoveProgress(activeTimeline.steps, activeIndex);
    playbackPosition.textContent = `Move ${moveProgress.current} of ${moveProgress.total}`;
    scrubber.max = String(activeTimeline.steps.length);
    scrubber.value = String(activeIndex);
    scrubber.disabled = !playable;
    playbackBegin.disabled = !playable || activeIndex === 0;
    root.querySelector<HTMLButtonElement>("[data-playback-back]")!.disabled = !playable || activeIndex === 0;
    playbackReverse.disabled = !playable || activeIndex === 0;
    playbackPause.disabled = !playable || playbackDirection === 0;
    playbackPlay.disabled = !playable || activeIndex === activeTimeline.steps.length;
    root.querySelector<HTMLButtonElement>("[data-playback-forward]")!.disabled =
      !playable || activeIndex === activeTimeline.steps.length;
    playbackEnd.disabled = !playable || activeIndex === activeTimeline.steps.length;
    playbackReverse.classList.toggle("is-playing", playbackDirection === -1);
    playbackReverse.setAttribute("aria-pressed", String(playbackDirection === -1));
    playbackPlay.classList.toggle("is-playing", playbackDirection === 1);
    playbackPlay.setAttribute("aria-pressed", String(playbackDirection === 1));
    moveRibbon.dataset.hoverPreview = timelineHoverEnabled(playbackDirection)
      ? "enabled"
      : "disabled";
    moveRibbon.querySelectorAll<HTMLButtonElement>("[data-move-index]").forEach((button) => {
      const moveIndex = Number(button.dataset.moveIndex);
      button.classList.toggle("completed", moveIndex <= activeIndex);
      button.classList.toggle("active", moveIndex === activeIndex);
      button.disabled = !playable;
    });
    moveRibbon.querySelector<HTMLElement>(".move-token.active")?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    updateTutorialUi();
  };

  const stopPlayback = () => {
    playbackGeneration += 1;
    playbackDirection = 0;
    viewport?.cancelTurn();
    viewport?.setMilestone(null);
    viewport?.setFocus(null);
    coachStatus.textContent = "";
    updatePlaybackUi();
  };

  const renderTimelineIndex = (index: number) => {
    if (!activeTimeline?.states) return;
    activeIndex = Math.max(0, Math.min(index, activeTimeline.steps.length));
    renderState(activeTimeline.states[activeIndex], status.textContent ?? "Algorithm");
    refreshTutorialFocus();
    updatePlaybackUi();
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
          ? `Cube solved — all ${tutorialPhases.length} ${completedPhase.method === "cfop" ? "CFOP stages" : "steps"} verified`
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
    await viewport.animateTurn(transform, duration);
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

  const synchronizePlayback = (recognized: RecognizedInput) => {
    updateAcademySource(recognized);
    updateNissSource(recognized);
    updateCompatibility(recognized);
    updateTransformAvailability(recognized.timeline !== undefined);
    if (!recognized.timeline || !recognized.timelineKey) {
      stopPlayback();
      activeTimeline = null;
      activeTimelineKey = null;
      playback.hidden = true;
      renderState(recognized.state, recognized.label);
      lastLabel = recognized.label;
      return;
    }

    const previous = activeTimeline;
    const sameTimeline = activeTimelineKey === recognized.timelineKey;
    const previousAtEnd = previous?.states !== null && activeIndex === previous?.steps.length;
    const animateExtension = recognized.timeline.states !== null && (
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
    const parsed = parseState(input.value);
    if (parsed.TAG === "Error") {
      updateAcademySource(null);
      updateNissSource(null);
      updateCompatibility(null);
      updateTransformAvailability(false);
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
    const conversionChanged = !appStateApplied
      || size !== state.size
      || lowercaseMode !== state.lowercaseMode
      || notationDialect !== state.notationDialect
      || cubeStyle !== state.cubeStyle
      || input.value !== state.input
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
    if (schemeSelect.value !== state.scheme) schemeSelect.value = state.scheme;
    if (customScheme.value !== state.customScheme) customScheme.value = state.customScheme;
    customScheme.hidden = state.scheme !== "Custom";

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
      const method = selectedTutorialMethod();
      const saved = method ? savedTutorialSolutions.get(method) : undefined;
      const academy = method === "cfop" ? cfopAcademy : beginnerAcademy;
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
    if (pendingDirectMove !== null) {
      window.clearTimeout(pendingDirectMove.timeout);
      pendingDirectMove = null;
    }
    updateTransformAvailability(false);
    updateAcademySource(null);
    store.patch({input: input.value});
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

  transformButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const parsed = MoveParser.parseWithOptions(
        size,
        lowercaseMode,
        notationDialect,
        input.value,
      ) as Result<unknown[], {message: string}>;
      if (parsed.TAG === "Error") return;
      const alg = parsed._0;
      switch (button.dataset.algTransform) {
        case "invert":
          commitTransformedAlgorithm(MoveTransform.serialize(MoveTransform.invert(alg)));
          break;
        case "simplify": {
          const simplified = MoveTransform.simplify(alg) as Result<unknown[], string>;
          if (simplified.TAG === "Ok") {
            commitTransformedAlgorithm(MoveTransform.serialize(simplified._0));
          } else {
            error.textContent = "The algorithm exceeds the safe transformation limit.";
            error.hidden = false;
          }
          break;
        }
        case "mirror-lr":
          commitTransformedAlgorithm(MoveTransform.serialize(MoveTransform.mirror(alg, "LR")));
          break;
        case "mirror-fb":
          commitTransformedAlgorithm(MoveTransform.serialize(MoveTransform.mirror(alg, "FB")));
          break;
        case "mirror-ud":
          commitTransformedAlgorithm(MoveTransform.serialize(MoveTransform.mirror(alg, "UD")));
          break;
        case "rotate-x":
          commitTransformedAlgorithm(MoveTransform.serialize(MoveTransform.rotate(alg, "X", 1)));
          break;
        case "rotate-y":
          commitTransformedAlgorithm(MoveTransform.serialize(MoveTransform.rotate(alg, "Y", 1)));
          break;
        case "rotate-z":
          commitTransformedAlgorithm(MoveTransform.serialize(MoveTransform.rotate(alg, "Z", 1)));
          break;
      }
    });
  });

  root.querySelector<HTMLButtonElement>("[data-practice-scramble]")!.addEventListener("click", () => {
    const scramble = MoveTransform.practiceScramble(size) as Result<string, string>;
    if (scramble.TAG === "Ok") commitTransformedAlgorithm(scramble._0);
  });

  nissUseInverse.addEventListener("click", () => {
    if (inverseScramble !== "") commitTransformedAlgorithm(inverseScramble);
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
    nissResult.textContent = `Verified · ${verification._0.moveCount} moves · ${verifiedNissSolution || "Solved"}`;
    nissResult.classList.add("success");
    nissResult.classList.remove("failure");
    nissLoad.disabled = false;
  });

  nissLoad.addEventListener("click", () => {
    if (verifiedNissSolution !== "") commitTransformedAlgorithm(verifiedNissSolution);
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
      if (academy.method === "beginner") {
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
      const metrics = document.createElement("span");
      metrics.className = "academy-phase-metrics";
      metrics.textContent = `${moveCount} physical move${moveCount === 1 ? "" : "s"}`;
      button.dataset.phaseMoveCount = String(moveCount);
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
      return `// ${academy.method === "cfop" ? "CFOP" : "STEP"} ${phase.number}: ${phase.title}\n// ${phase.instruction}\n${moves || "// Already complete"}`;
    }).join("\n\n");
    academy.solution.textContent = commentedTutorialSolution;
    academy.solution.hidden = false;
    academy.copy.disabled = false;
    academy.status.classList.remove("error");
    const benchmark = academy.method === "cfop"
      ? solution.moveCount <= 60
        ? " · ≤60 advanced benchmark met"
        : ` · ${solution.moveCount - 60} over the ≤60 advanced benchmark`
      : "";
    academy.status.textContent = `Verified ${academy.method === "beginner" ? "beginner" : "Advanced CFOP"} solution · ${solution.moveCount} moves · ${academy.phaseCount} phases${benchmark}`;
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
    if (method === null || size !== 3 || activeRecognized === null) return;
    const initialState = activeRecognized.state;
    const academy = method === "cfop" ? cfopAcademy : beginnerAcademy;
    academySolveBusy = true;
    updateAcademySolveButton();
    academy.status.classList.remove("error");
    academy.status.textContent = method === "cfop"
      ? "Building and replay-verifying the four Advanced CFOP phases…"
      : "Building and replay-verifying the seven beginner phases…";
    window.setTimeout(() => {
      const result = (method === "cfop"
        ? CfopSolver.solve(initialState)
        : BeginnerSolver.solve(initialState)) as Result<TutorialSolution, unknown>;
      academySolveBusy = false;
      if (result.TAG === "Error") {
        academy.status.textContent = method === "cfop"
          ? CfopSolver.describeError(result._0)
          : BeginnerSolver.describeError(result._0);
        academy.status.classList.add("error");
        updateAcademySolveButton();
        return;
      }
      savedTutorialSolutions.set(method, {initialState, solution: result._0});
      updateAcademyComparison();
      updateAcademySolveButton();
      presentTutorialSolution(initialState, result._0, academy);
    }, 0);
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
        academy.copy.textContent = academy.method === "cfop"
          ? "Copy commented CFOP solution"
          : "Copy commented solution";
      }, 1500);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-cube-style]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({cubeStyle: button.dataset.cubeStyle as CubeStyle});
    });
  });
  const resetCameraView = () => {
    tutorialCameraGeneration += 1;
    tutorialCameraRestore = null;
    delete canvas.dataset.sequenceCameraRestoreYaw;
    delete canvas.dataset.sequenceCameraRestorePitch;
    autoOrbitButton.setAttribute("aria-pressed", "false");
    autoOrbitButton.classList.remove("active");
    viewport?.setAutoOrbit(false);
    viewport?.resetCamera();
  };
  root.querySelector<HTMLButtonElement>("[data-reset-camera]")!.addEventListener("click", resetCameraView);
  shortcutsHelp.addEventListener("click", () => shortcutsDialog.showModal());
  shortcutsClose.addEventListener("click", () => shortcutsDialog.close());
  autoOrbitButton.addEventListener("click", () => {
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
    stopPlayback();
  });
  playbackPlay.addEventListener("click", () => {
    if (playbackDirection === 1) return;
    void play(1);
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
        if (playbackDirection !== 0) stopPlayback();
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

  root.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.copy;
      const output = key ? root.querySelector<HTMLElement>(`[data-output="${key}"]`) : null;
      if (button.disabled || !output || output.textContent === "—") return;
      await navigator.clipboard.writeText(output.textContent ?? "");
      button.textContent = "Copied";
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = "Copy";
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
      viewport?.dispose();
    },
    {once: true},
  );
}
