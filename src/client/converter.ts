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
import {
  createCubeViewport,
  turnTransform,
  type CubePalette,
  type CubeStyle,
  type MoveStep,
} from "./cube-gl";
import {
  evaluateAlgorithm,
  buildTimeline,
  isSingleStepExtension,
  MAX_PLAYBACK_STEPS,
  type AlgorithmTimeline,
} from "./playback";
import {
  createStore,
  readHash,
  synchronizeHash,
  type AppState,
  type ActiveTab,
  type LowercaseMode,
  type NotationDialect,
  type SchemeName,
} from "./store";

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
type BeginnerPhase = {number: number; title: string; instruction: string; alg: unknown[]};
type BeginnerSolution = {phases: BeginnerPhase[]; alg: unknown[]; moveCount: number};
type TutorialPhaseRange = BeginnerPhase & {start: number; end: number};
type ExpandedTutorialEntry = {comment?: string};

const root = document.querySelector<HTMLElement>("[data-converter]");

if (root) {
  const input = root.querySelector<HTMLTextAreaElement>("[data-input]")!;
  const schemeSelect = root.querySelector<HTMLSelectElement>("[data-scheme]")!;
  const customScheme = root.querySelector<HTMLInputElement>("[data-custom-scheme]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const error = root.querySelector<HTMLElement>("[data-error]")!;
  const lowercaseControls = root.querySelector<HTMLElement>("[data-lowercase-controls]")!;
  const lowercaseBanner = root.querySelector<HTMLElement>("[data-lowercase-banner]")!;
  const lowercaseMessage = root.querySelector<HTMLElement>("[data-lowercase-message]")!;
  const switchLowercase = root.querySelector<HTMLButtonElement>("[data-switch-lowercase]")!;
  const canvas = root.querySelector<HTMLCanvasElement>("[data-cube-canvas]")!;
  const viewportFallback = root.querySelector<HTMLElement>("[data-viewport-fallback]")!;
  const playback = root.querySelector<HTMLElement>("[data-playback]")!;
  const moveRibbon = root.querySelector<HTMLElement>("[data-move-ribbon]")!;
  const playbackPosition = root.querySelector<HTMLElement>("[data-playback-position]")!;
  const scrubber = root.querySelector<HTMLInputElement>("[data-playback-scrubber]")!;
  const playbackToggle = root.querySelector<HTMLButtonElement>("[data-playback-toggle]")!;
  const playbackLimit = root.querySelector<HTMLElement>("[data-playback-limit]")!;
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
  const beginnerSolve = root.querySelector<HTMLButtonElement>("[data-beginner-solve]")!;
  const beginnerStatus = root.querySelector<HTMLElement>("[data-beginner-status]")!;
  const beginnerCurrent = root.querySelector<HTMLElement>("[data-beginner-current]")!;
  const beginnerPhases = root.querySelector<HTMLElement>("[data-beginner-phases]")!;
  const beginnerCopy = root.querySelector<HTMLButtonElement>("[data-beginner-copy]")!;
  const beginnerSolution = root.querySelector<HTMLElement>("[data-beginner-solution]")!;
  const autoOrbitButton = root.querySelector<HTMLButtonElement>("[data-auto-orbit]")!;
  const initialState = readHash(window.location.hash);
  const store = createStore(initialState);
  let size = initialState.size;
  let lowercaseMode: LowercaseMode = initialState.lowercaseMode;
  let notationDialect: NotationDialect = initialState.notationDialect;
  let cubeStyle: CubeStyle = initialState.cubeStyle;
  let activeTab: ActiveTab = initialState.activeTab;
  let inverseScramble = "";
  let verifiedNissSolution = "";
  let activeRecognized: RecognizedInput | null = null;
  let tutorialPhases: TutorialPhaseRange[] = [];
  let commentedBeginnerSolution = "";
  const viewport = createCubeViewport(canvas, (message) => {
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

  const notationSignals = (value: string) => {
    const algorithm = value.replace(/\/\/[^\n]*/g, "");
    const prefix = String.raw`(?:^|[\s([{:])(?:\d+(?:-\d+)?)?`;
    const suffix = String.raw`(?:\d+)?(?:['’‘′‵\x60´])?(?=$|[\s)\]},:])`;
    return {
      lowercase: new RegExp(`${prefix}[rludfb]${suffix}`, "m").test(algorithm),
      explicitWide: new RegExp(`${prefix}[ULFRBD]w${suffix}`, "m").test(algorithm),
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

    const signals = notationSignals(input.value);
    lowercaseBanner.hidden = !supportsLegacy || !signals.lowercase;
    if (lowercaseBanner.hidden) return;

    const mixed = signals.explicitWide && lowercaseMode === "Wide";
    lowercaseBanner.classList.toggle("warning", mixed);
    if (lowercaseMode === "InnerSlice") {
      lowercaseMessage.textContent =
        "Legacy mode is active: lowercase r means the inner slice 2R; explicit Rw remains wide.";
      switchLowercase.textContent = "Use modern SiGN (r = Rw)";
    } else {
      lowercaseMessage.textContent = mixed
        ? "Mixed Rw and r notation detected. Modern SiGN treats both as the same wide move; legacy algorithms may use r for 2R."
        : "Interpreting lowercase moves as modern SiGN wide turns (r = Rw). Is this a legacy algorithm?";
      switchLowercase.textContent = "Use inner slices (r = 2R)";
    }
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
  let looping = false;
  let playing = false;
  let playbackGeneration = 0;
  let lastLabel = "";

  const resetAcademy = () => {
    tutorialPhases = [];
    commentedBeginnerSolution = "";
    beginnerPhases.replaceChildren();
    beginnerCurrent.hidden = true;
    beginnerCopy.disabled = true;
    beginnerSolution.hidden = true;
    beginnerSolution.textContent = "";
  };

  const updateAcademySource = (recognized: RecognizedInput | null) => {
    activeRecognized = recognized;
    resetAcademy();
    beginnerSolve.disabled = recognized === null || size !== 3;
    beginnerStatus.classList.remove("error");
    beginnerStatus.textContent = size !== 3
      ? "Beginner Academy is available for 3×3 states."
      : recognized === null
        ? "Enter a valid 3×3 state to begin."
        : `Ready to teach the recognized ${recognized.label.toLowerCase()} state.`;
  };

  const updateTutorialUi = () => {
    if (tutorialPhases.length === 0) return;
    const current = tutorialPhases.find((phase) =>
      phase.end > phase.start && activeIndex >= phase.start && activeIndex < phase.end
    ) ?? (activeIndex === 0 ? tutorialPhases[0] : tutorialPhases.at(-1))!;
    beginnerCurrent.hidden = false;
    beginnerCurrent.textContent = `Step ${current.number}: ${current.title} — ${current.instruction}`;
    beginnerPhases.querySelectorAll<HTMLElement>("[data-beginner-phase]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.beginnerPhase) === current.number);
    });
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
      moveRibbon.replaceChildren();
      let currentGroupId: number | undefined;
      let groupContainer: HTMLSpanElement | null = null;
      activeTimeline.labels.forEach((label, index) => {
        const entry = activeTimeline!.steps[index];
        if (entry.groupId !== currentGroupId) {
          currentGroupId = entry.groupId;
          groupContainer = null;
          if (currentGroupId !== undefined) {
            groupContainer = document.createElement("span");
            groupContainer.className = "move-group";
            groupContainer.setAttribute("aria-label", "Parenthesized algorithm group");
            moveRibbon.append(groupContainer);
          }
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "move-token";
        button.textContent = label;
        const isPause = entry.step === undefined;
        button.classList.toggle("pause", isPause);
        button.dataset.moveIndex = String(index + 1);
        const description = isPause
          ? entry.durationMs === undefined
            ? "Pause"
            : `Pause for ${entry.durationMs / 1000} seconds`
          : label;
        button.setAttribute("aria-label", `Go to step ${index + 1}: ${description}`);
        if (isPause) button.title = description;
        (groupContainer ?? moveRibbon).append(button);
      });
    }
    playbackLimit.hidden = activeTimeline.states !== null;
    playbackLimit.textContent = activeTimeline.states === null
      ? `Final conversion is available; playback is limited to ${MAX_PLAYBACK_STEPS} expanded moves.`
      : "";
    playbackPosition.textContent = `Step ${activeIndex} of ${activeTimeline.steps.length}`;
    scrubber.max = String(activeTimeline.steps.length);
    scrubber.value = String(activeIndex);
    scrubber.disabled = !playable;
    root.querySelector<HTMLButtonElement>("[data-playback-start]")!.disabled = !playable || activeIndex === 0;
    root.querySelector<HTMLButtonElement>("[data-playback-back]")!.disabled = !playable || activeIndex === 0;
    playbackToggle.disabled = !playable;
    root.querySelector<HTMLButtonElement>("[data-playback-forward]")!.disabled =
      !playable || activeIndex === activeTimeline.steps.length;
    root.querySelector<HTMLButtonElement>("[data-playback-end]")!.disabled =
      !playable || activeIndex === activeTimeline.steps.length;
    playbackToggle.textContent = playing ? "Ⅱ" : "▶";
    playbackToggle.setAttribute("aria-label", playing ? "Pause algorithm" : "Play algorithm");
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
    playing = false;
    viewport?.cancelTurn();
    updatePlaybackUi();
  };

  const renderTimelineIndex = (index: number) => {
    if (!activeTimeline?.states) return;
    activeIndex = Math.max(0, Math.min(index, activeTimeline.steps.length));
    renderState(activeTimeline.states[activeIndex], status.textContent ?? "Algorithm");
    updatePlaybackUi();
  };

  const transitionTo = async (target: number, generation: number): Promise<boolean> => {
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
      const pauseDuration = activeTimeline.steps[stepIndex].durationMs ?? 280;
      await new Promise((resolve) => window.setTimeout(resolve, pauseDuration / playbackSpeed));
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
    const duration = 180 * (Math.abs(transform.angle) > Math.PI / 2 + 0.01 ? 1.35 : 1) / playbackSpeed;
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

  const play = async () => {
    if (!activeTimeline?.states || activeTimeline.steps.length === 0) return;
    stopPlayback();
    playing = true;
    const generation = playbackGeneration;
    if (activeIndex === activeTimeline.steps.length) renderTimelineIndex(0);
    updatePlaybackUi();
    while (playing && generation === playbackGeneration && activeTimeline) {
      if (activeIndex === activeTimeline.steps.length) {
        if (!looping) break;
        renderTimelineIndex(0);
      }
      if (!(await transitionTo(activeIndex + 1, generation))) return;
    }
    if (generation === playbackGeneration) {
      playing = false;
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
    activeTab = state.activeTab;
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
    root.querySelectorAll<HTMLButtonElement>("[data-workspace-tab]").forEach((button) => {
      const active = button.dataset.workspaceTab === activeTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    root.querySelectorAll<HTMLElement>("[data-workspace-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.workspacePanel !== activeTab;
    });
    appStateApplied = true;
    if (conversionChanged) scheduleUpdate();
  };

  root.querySelectorAll<HTMLButtonElement>("[data-workspace-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({activeTab: button.dataset.workspaceTab as ActiveTab});
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

  switchLowercase.addEventListener("click", () => {
    store.patch({lowercaseMode: lowercaseMode === "Wide" ? "InnerSlice" : "Wide"});
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

  const presentBeginnerSolution = (initialState: CubeState, solution: BeginnerSolution) => {
    let cursor = 0;
    tutorialPhases = solution.phases.map((phase) => {
      const expanded = MoveExecutor.expandTimeline(phase.alg) as Result<ExpandedTutorialEntry[], unknown>;
      const count = expanded.TAG === "Ok"
        ? expanded._0.filter((entry) => entry.comment === undefined).length
        : 0;
      const range = {...phase, start: cursor, end: cursor + count};
      cursor += count;
      return range;
    });
    beginnerPhases.replaceChildren();
    tutorialPhases.forEach((phase) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "academy-phase";
      button.dataset.beginnerPhase = String(phase.number);
      button.dataset.beginnerPhaseStart = String(phase.start);
      const title = document.createElement("strong");
      title.textContent = `Step ${phase.number}: ${phase.title}`;
      const instruction = document.createElement("span");
      instruction.textContent = phase.instruction;
      button.append(title, instruction);
      beginnerPhases.append(button);
    });
    commentedBeginnerSolution = solution.phases.map((phase) => {
      const moves = MoveTransform.serialize(phase.alg);
      return `// STEP ${phase.number}: ${phase.title}\n// ${phase.instruction}\n${moves || "// Already complete"}`;
    }).join("\n\n");
    beginnerSolution.textContent = commentedBeginnerSolution;
    beginnerSolution.hidden = false;
    beginnerCopy.disabled = false;
    beginnerStatus.classList.remove("error");
    beginnerStatus.textContent = `Verified beginner solution · ${solution.moveCount} moves · 7 phases`;

    const timeline = buildTimeline(initialState, solution.alg);
    if (timeline.TAG === "Error") {
      beginnerStatus.textContent = timeline._0;
      beginnerStatus.classList.add("error");
      return;
    }
    stopPlayback();
    activeTimeline = timeline._0;
    activeTimelineKey = null;
    activeIndex = 0;
    lastLabel = "Beginner tutorial";
    renderState(initialState, lastLabel);
    updatePlaybackUi(true);
  };

  beginnerSolve.addEventListener("click", () => {
    if (size !== 3 || activeRecognized === null) return;
    const initialState = activeRecognized.state;
    beginnerSolve.disabled = true;
    beginnerStatus.classList.remove("error");
    beginnerStatus.textContent = "Building and replay-verifying the seven beginner phases…";
    window.setTimeout(() => {
      const result = BeginnerSolver.solve(initialState) as Result<BeginnerSolution, unknown>;
      beginnerSolve.disabled = false;
      if (result.TAG === "Error") {
        beginnerStatus.textContent = BeginnerSolver.describeError(result._0);
        beginnerStatus.classList.add("error");
        return;
      }
      presentBeginnerSolution(initialState, result._0);
    }, 0);
  });

  beginnerPhases.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-beginner-phase-start]");
    if (button) void seek(Number(button.dataset.beginnerPhaseStart), false);
  });

  beginnerCopy.addEventListener("click", async () => {
    if (commentedBeginnerSolution === "") return;
    await navigator.clipboard.writeText(commentedBeginnerSolution);
    beginnerCopy.textContent = "Copied";
    window.setTimeout(() => {
      beginnerCopy.textContent = "Copy commented solution";
    }, 1500);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-cube-style]").forEach((button) => {
    button.addEventListener("click", () => {
      store.patch({cubeStyle: button.dataset.cubeStyle as CubeStyle});
    });
  });
  root.querySelector<HTMLButtonElement>("[data-reset-camera]")!.addEventListener("click", () => {
    viewport?.resetCamera();
  });
  autoOrbitButton.addEventListener("click", () => {
    const enabled = autoOrbitButton.getAttribute("aria-pressed") !== "true";
    autoOrbitButton.setAttribute("aria-pressed", String(enabled));
    autoOrbitButton.classList.toggle("active", enabled);
    viewport?.setAutoOrbit(enabled);
  });
  root.querySelector<HTMLButtonElement>("[data-playback-start]")!.addEventListener("click", () => {
    void seek(0, false);
  });
  root.querySelector<HTMLButtonElement>("[data-playback-back]")!.addEventListener("click", () => {
    void seek(activeIndex - 1, true);
  });
  playbackToggle.addEventListener("click", () => {
    if (playing) stopPlayback();
    else void play();
  });
  root.querySelector<HTMLButtonElement>("[data-playback-forward]")!.addEventListener("click", () => {
    void seek(activeIndex + 1, true);
  });
  root.querySelector<HTMLButtonElement>("[data-playback-end]")!.addEventListener("click", () => {
    if (activeTimeline) void seek(activeTimeline.steps.length, false);
  });
  scrubber.addEventListener("input", () => {
    void seek(Number(scrubber.value), false);
  });
  moveRibbon.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-move-index]");
    if (button) void seek(Number(button.dataset.moveIndex), false);
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
  root.querySelector<HTMLButtonElement>("[data-playback-loop]")!.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    looping = !looping;
    button.classList.toggle("active", looping);
    button.setAttribute("aria-pressed", String(looping));
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
