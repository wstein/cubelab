import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

const page = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
const playerPage = await readFile(new URL("../src/pages/player.astro", import.meta.url), "utf8");
const academyPage = await readFile(new URL("../src/pages/academy.astro", import.meta.url), "utf8");
const workbenchPage = await readFile(new URL("../src/pages/workbench.astro", import.meta.url), "utf8");
const patternsPage = await readFile(new URL("../src/pages/patterns.astro", import.meta.url), "utf8");
const timerPage = await readFile(new URL("../src/pages/timer.astro", import.meta.url), "utf8");
const client = await readFile(new URL("../src/client/converter.ts", import.meta.url), "utf8");
const solverWorker = await readFile(new URL("../src/client/workers/solver.worker.ts", import.meta.url), "utf8");
const viewport = await readFile(new URL("../src/client/cube-gl.ts", import.meta.url), "utf8");
const orientationVerifier = await readFile(
  new URL("../src/client/smart-cube/orientation-verifier.ts", import.meta.url),
  "utf8",
);
const store = await readFile(new URL("../src/client/store.ts", import.meta.url), "utf8");
const viewportComponent = await readFile(
  new URL("../src/Components/CubeViewport.astro", import.meta.url),
  "utf8",
);

test("the static shell declares size-scoped cubie and Orbit64 cards", () => {
  assert.match(page, /key: "pieces"[\s\S]*sizes: "2,3"/);
  assert.match(page, /key: "orbit64"[\s\S]*sizes: "3"/);
  assert.match(page, /data-output-card=\{key\}/);
  assert.match(page, /data-copy-orbit64/);
  assert.match(page, />Copy as Orbit64</);
});

test("the dedicated player route reuses the full interactive viewport", () => {
  assert.match(playerPage, /initialPlayer=\{true\}/);
  assert.match(viewportComponent, /data-player-page-link/);
  assert.match(client, /document\.body\.classList\.toggle\("player-page", playerMode\)/);
  assert.match(client, /const setPlayerMode = \(enabled: boolean, pushHistory = true\)/);
  assert.match(client, /window\.history\.pushState\(null, "",/);
  assert.match(client, /window\.addEventListener\("popstate"/);
  assert.match(client, /setPlayerMode\(false\)/);
  assert.match(client, /playerPageLink\.textContent = playerMode \? "Back to studio" : "Full-size player"/);
  assert.doesNotMatch(client, /cubelab-player-handoff/);
  assert.match(viewport, /refresh: requestRender/);
  assert.match(viewport, /capturePng: \(\) => Promise<Blob \| null>/);
  assert.match(viewport, /preserveDrawingBuffer remains false/);
  assert.match(viewportComponent, /data-snapshot-cube/);
  assert.match(client, /event\.shiftKey && \(event\.metaKey \|\| event\.ctrlKey\) && event\.key\.toLowerCase\(\) === "s"/);
  assert.match(viewport, /safeCameraDistance/);
});

test("clean static routes select their workspace before the client mounts", () => {
  assert.match(academyPage, /initialTab="academy"/);
  assert.match(workbenchPage, /initialTab="workbench"/);
  assert.match(patternsPage, /initialTab="patterns"/);
  assert.match(timerPage, /initialTab="timer"/);
  assert.match(store, /export const pathForTab/);
  assert.match(store, /target\.history\.pushState/);
  assert.match(store, /target\.history\.replaceState/);
});

test("the workspace exposes a manual speedcubing timer", () => {
  assert.match(page, /data-workspace-tab="timer"/);
  assert.match(page, /data-workspace-panel="timer"/);
  assert.match(page, /data-timer-display/);
  assert.match(page, /data-timer-scramble/);
  assert.match(page, /data-timer-cubelab-scramble/);
  assert.match(page, /data-timer-tnoodle-scramble/);
  assert.match(page, /data-timer-arena/);
  assert.match(viewportComponent, /data-timer-cover/);
  assert.match(viewportComponent, /data-timer-hud/);
  assert.match(client, /mountTimerWorkspace\(root\)/);
  assert.match(page, /data-academy-instant-drill/);
  assert.match(page, /data-academy-drill-case/);
  assert.match(page, /data-academy-drill-family/);
  assert.match(page, /data-academy-load-drill/);
  assert.match(page, /data-academy-random-drill/);
  assert.match(page, /data-academy-wca-drill/);
  assert.match(viewportComponent, /data-smart-cube-controller/);
  assert.match(viewportComponent, /data-smart-cube-mac-recovery/);
  assert.match(client, /smartCubeSyncMode === "VirtualController"/);
  assert.match(client, /cubelab:timer-scramble/);
  assert.match(client, /academyRequestGuard\.isCurrent\(request\)/);
  assert.match(client, /academyTargetDiagnostic/);
  assert.match(client, /nextRandomDrillRotation/);
});

test("settings separate shareable workspace state from local preferences", () => {
  assert.match(page, /data-settings-open/);
  assert.match(page, /data-settings-size/);
  assert.match(page, /data-settings-scheme/);
  assert.match(page, /data-settings-dialect/);
  assert.match(page, /data-settings-tnoodle-url/);
  assert.match(page, /data-settings-tnoodle-enabled/);
  assert.match(page, /data-settings-tnoodle-event/);
  assert.match(page, /data-settings-tnoodle-test/);
  assert.match(client, /store\.patch\(\{autoOrbit: enabled\}\)/);
  assert.match(client, /persistPreferences\(\{\s*tnoodleServerUrl:/);
  assert.match(client, /new TnoodleClient\(\)\.checkHealth/);
  assert.match(client, /hasVerifiedTnoodle\(preferences\)/);
});

test("the HTML head declares the SVG favicon and fallback touch icons", () => {
  assert.match(page, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
  assert.match(page, /<link rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32x32\.png"/);
  assert.match(page, /<link rel="icon" type="image\/png" sizes="16x16" href="\/favicon-16x16\.png"/);
  assert.match(page, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/);
});

test("the converter exposes full two-phase solutions through a dedicated worker contract", () => {
  assert.match(page, /data-two-phase-solve/);
  assert.match(page, /data-two-phase-apply/);
  assert.match(page, /data-two-phase-result/);
  assert.match(client, /createTwoPhaseSolverClient/);
  assert.match(client, /twoPhaseSolverClient\.solve\(workspace\._0\.state\)/);
  assert.match(client, /The two-phase solution did not replay to solved/);
  assert.match(solverWorker, /type: "solveTwoPhase"/);
  assert.match(solverWorker, /twoPhaseProgress/);
  assert.match(solverWorker, /TwoPhaseSolver\.solveAtDepth\(request\.state, bound\)/);
  assert.match(solverWorker, /TwoPhaseSolver\.describeError\(result\._0\)/);
  assert.match(solverWorker, /result\._0 === "SearchFailed"/);
  assert.match(solverWorker, /cancelledTwoPhaseRequests = new Set<number>/);
  assert.match(solverWorker, /twoPhaseCandidate/);
  assert.match(client, /twoPhaseSolverClient\.cancel\(\)/);
  assert.match(client, /Best so far:/);
  assert.match(client, /twoPhaseApply\.addEventListener/);
  assert.match(client, /Setup or Moves changed; generate a new two-phase solution/);
  assert.match(client, /store\.patch\(\{moves:/);
});

test("Academy exposes an optional target pattern field", () => {
  assert.match(page, /data-academy-target/);
  assert.match(page, /Target pattern/);
  assert.match(client, /relativeAcademyState\(initialState, target\._0\)/);
  assert.match(client, /generated solution did not replay from setup to the target pattern/);
});

test("the editor separates a synchronized setup from optional replay moves", () => {
  assert.match(page, /Setup \(state\)/);
  assert.match(page, /data-moves-input/);
  assert.match(page, /class="cube-textarea setup-textarea"[\s\S]*rows="1"[\s\S]*wrap="off"/);
  assert.match(page, /Smart-cube Sync loads this field/);
  assert.match(client, /const parseWorkspaceState/);
  assert.match(client, /Setup is the state at tape position zero/);
  assert.match(client, /MoveExecutor\.applyAlg\(baseState, moves\._0\)/);
  assert.match(client, /buildTimeline\(baseState, moves\._0\)/);
  assert.match(client, /const parseMovesEditor/);
  assert.match(client, /HamiltonMacro\.unfold\(program, MAX_PLAYBACK_STEPS\)/);
  assert.match(client, /Use the streaming player for longer programs/);
  assert.match(page, /Macro definitions in Moves/);
});

test("the Vanilla DOM client wires reachability-aware outputs", () => {
  assert.match(client, /PieceReducer\.reduce\(state\)/);
  assert.match(client, /PieceReducer\.parseState\(size, compact\)/);
  assert.match(client, /PieceReducer\.render\(pieces\._0\)/);
  assert.match(client, /Orbit64Codec\.encode\(pieces\._0\)/);
  assert.match(client, /Orbit64Codec\.decodeState\(compact\)/);
  assert.match(client, /const net = inputValue\.trimEnd\(\)/);
  assert.match(client, /card\.hidden =/);
  assert.match(client, /querySelectorAll<HTMLButtonElement>\(`\[data-copy=/);
  assert.match(client, /orbitQuickCopy\.hidden = size !== 3/);
});

test("the web UI exposes an explicit lowercase mode without heuristic switching", () => {
  assert.match(page, /data-lowercase-mode="Wide"/);
  assert.match(page, /data-lowercase-mode="InnerSlice"/);
  assert.doesNotMatch(page, /data-lowercase-banner/);
  assert.match(page, /modern SiGN wide turns by default/);
  assert.match(client, /evaluateAlgorithm/);
  assert.doesNotMatch(client, /Mixed Rw and r notation detected/);
  assert.doesNotMatch(client, /lowercaseMode\s*=.*signals/);
});

test("the web UI exposes Ruwix suffix layers only through an explicit dialect setting", () => {
  assert.match(page, /data-notation-dialect="Modern"/);
  assert.match(page, /data-notation-dialect="Ruwix"/);
  assert.match(page, /ambiguous plaintext/);
  assert.match(client, /notationDialect/);
  assert.doesNotMatch(client, /notationDialect\s*=.*input/);
});

test("the web UI explains source portability without claiming competition legality", () => {
  assert.match(page, /data-compatibility-profile="wca"/);
  assert.match(page, /data-compatibility-profile="signLgn"/);
  assert.match(page, /data-compatibility-profile="cubingJs"/);
  assert.match(page, /data-compatibility-profile="speedsolving"/);
  assert.match(page, /data-compatibility-profile="ruwix"/);
  assert.match(client, /MoveCompatibility\.evaluate/);
  assert.match(client, /does not determine event-specific competition legality/);
});

test("the web UI exposes pure algorithm transforms and a clearly labeled practice scramble", () => {
  assert.match(page, /data-alg-transform="invert"/);
  assert.match(page, /data-alg-transform="simplify"/);
  assert.match(page, /data-alg-transform="mirror-lr"/);
  assert.match(page, /data-alg-transform="mirror-fb"/);
  assert.match(page, /data-alg-transform="mirror-ud"/);
  assert.match(page, /data-alg-transform="rotate-x"/);
  assert.match(page, /data-alg-transform="rotate-y"/);
  assert.match(page, /data-alg-transform="rotate-z"/);
  assert.match(page, /data-practice-scramble/);
  assert.match(page, /not official WCA/);
  assert.match(client, /MoveTransform\.invert/);
  assert.match(client, /MoveTransform\.simplify/);
  assert.match(client, /MoveTransform\.mirror/);
  assert.match(client, /MoveTransform\.rotate/);
  assert.match(client, /MoveTransform\.practiceScramble/);
  assert.match(client, /smartCubeSyncMode !== "VirtualController"/);
  assert.match(client, /Virtual controller · practice scramble/);
  assert.match(client, /commitTransformedAlgorithm\(scramble\._0\);[\s\S]*Virtual controller · practice scramble/);
  assert.match(client, /Practice scramble loaded in Setup\. Turn the physical cube to match/);
  assert.match(client, /if \(smartCubeSyncMode === "VirtualController"\) return/);
});

test("controller-mode turns advance an active coached tape in the viewport frame", () => {
  assert.match(client, /const projectedMove = controllerMoveInViewportFrame/);
  assert.match(client, /await applyWaitingTimelineMove\(projectedMove, false\)/);
  assert.match(client, /Controller mode is intentionally different: its virtual state owns the/);
  assert.match(client, /smartCubeSyncMode === "VirtualController"/);
});

test("the web UI exposes a state-verified 3x3 NISS helper", () => {
  assert.match(page, /data-niss-panel/);
  assert.match(page, /data-niss-normal/);
  assert.match(page, /data-niss-inverse-moves/);
  assert.match(page, /data-niss-verify/);
  assert.match(page, /Preview recombined solution/);
  assert.match(page, /N · I⁻¹/);
  assert.match(client, /MoveNiss\.invertScramble/);
  assert.match(client, /MoveNiss\.verify/);
  assert.match(client, /MoveNiss\.describeError/);
  assert.match(page, /data-niss-side="normal"/);
  assert.match(page, /data-niss-side="inverse"/);
  assert.match(page, /data-niss-virtual-badge/);
  assert.match(client, /const setNissSide/);
  assert.match(client, /nissInverseState/);
  assert.match(client, /renderState\(verifiedNissStart, "NISS recombined solution"\)/);
  assert.match(client, /activeTimeline = timeline\._0/);
});

test("the Workbench inspects and previews bounded Hamilton macro nodes", () => {
  assert.match(page, /data-hamilton-panel/);
  assert.match(page, /data-hamilton-input/);
  assert.match(page, /data-hamilton-import/);
  assert.match(page, /data-hamilton-node/);
  assert.match(page, /data-hamilton-window-start/);
  assert.match(page, /data-hamilton-window-length/);
  assert.match(page, /data-hamilton-stream/);
  assert.match(page, /data-hamilton-preview/);
  assert.match(client, /HamiltonMacro\.measure/);
  assert.match(client, /source nodes/);
  assert.match(client, /HTM.*QTM/);
  assert.match(client, /HamiltonMacro\.importAlg/);
  assert.match(client, /HamiltonMacro\.window\(hamiltonProgram, start, length/);
  assert.match(client, /HamiltonMacro\.createStreamPlayer/);
  assert.match(page, /data-alg-transform="unfold"/);
  assert.match(client, /HamiltonMacro\.unfold\(program, MAX_PLAYBACK_STEPS\)/);
  assert.match(client, /tape scrubbing unavailable/);
  assert.match(client, /event\.kind === "pause"/);
  assert.match(client, /moves must be between 1 and 500/);
  assert.match(client, /Hamilton macro preview/);
});

test("the SPA workspace keeps one viewport beside four URL-addressable destinations", () => {
  assert.match(page, /data-workspace-tab="converter"/);
  assert.match(page, /data-workspace-tab="academy"/);
  assert.match(page, /data-workspace-tab="workbench"/);
  assert.match(page, /data-workspace-tab="patterns"/);
  assert.doesNotMatch(page, /data-workspace-tab="(?:beginner|cfop)"/);
  assert.match(page, /data-academy-method="beginner"/);
  assert.match(page, /data-academy-method="advancedLbl"/);
  assert.match(page, /data-academy-method="beginnerCfop"/);
  assert.match(page, /data-academy-method="fullCfop"/);
  assert.match(page, /data-academy-method="advancedCfop"/);
  assert.match(page, /data-academy-method="petrus"/);
  assert.match(page, /data-academy-method="enhancedPetrus"/);
  assert.match(page, /57 OLL \+ 21 PLL/);
  assert.match(page, /data-academy-method-panel="beginner"/);
  assert.match(page, /data-academy-method-panel="advancedLbl"/);
  assert.match(page, /data-academy-method-panel="beginnerCfop"/);
  assert.match(page, /data-academy-method-panel="fullCfop"/);
  assert.match(page, /data-academy-method-panel="advancedCfop"/);
  assert.match(page, /data-academy-method-panel="petrus"/);
  assert.match(page, /data-academy-method-panel="enhancedPetrus"/);
  assert.doesNotMatch(page, /solver not enabled yet/);
  assert.match(page, /data-academy-comparison/);
  assert.equal((page.match(/<CubeViewport \/>/g) ?? []).length, 1);
  assert.match(page, /data-academy-solve/);
  assert.equal((page.match(/data-academy-solve/g) ?? []).length, 1);
  assert.doesNotMatch(page, /data-(?:beginner|cfop)-solve/);
  assert.match(page, /data-beginner-phases/);
  assert.match(page, /data-beginner-copy/);
  assert.match(client, /createSolverClient/);
  assert.match(solverWorker, /BeginnerSolver\.solve/);
  assert.match(solverWorker, /CfopSolver\.solveBeginner/);
  assert.match(solverWorker, /CfopSolver\.solveAdvancedLbl/);
  assert.match(solverWorker, /CfopSolver\.solveFull/);
  assert.match(solverWorker, /PetrusSolver\.solveClassical/);
  assert.match(solverWorker, /PetrusSolver\.solveEnhanced/);
  assert.match(solverWorker, /CfopSolver\.solveAdvanced/);
  assert.match(client, /buildTimeline\(initialState, solution\.alg\)/);
  assert.match(client, /store\.patch\(\{activeTab:/);
  assert.match(client, /academyMethod:/);
  assert.match(client, /tutorialPhaseMoveCount/);
  assert.match(client, /phase\.sequences/);
  assert.match(client, /benchmarkTarget/);
});

test("practice scramble is a Quick load action rather than a transform", () => {
  assert.match(page, /class="preset-chip practice"[\s\S]*data-practice-scramble/);
  assert.doesNotMatch(page, /class="transform-btn practice"/);
});

test("the patterns workspace exposes the complete attributed pattern catalog and recognition actions", () => {
  assert.match(page, /data-workspace-panel="patterns"/);
  assert.match(page, /data-pattern-library/);
  assert.match(page, /230 designs · 2×2–5×5/);
  assert.match(page, /data-pattern-search/);
  assert.match(page, /data-pattern-select/);
  assert.match(page, /data-pattern-preview/);
  assert.match(client, /const renderPatternPreview/);
  assert.match(page, /data-pattern-extremal-filter/);
  assert.match(page, /data-pattern-extremal-badge/);
  assert.match(page, /data-pattern-detected/);
  assert.match(page, /data-pattern-detected-extremal-badge/);
  assert.match(page, /data-pattern-preview-solution/);
  assert.match(page, /data-pattern-copy-solution/);
  assert.match(client, /patternsForSize/);
  assert.match(client, /recognizePattern/);
  assert.match(client, /extremalStateFor/);
  assert.match(client, /buildTimeline\(detectedPatternState, parsed\._0\)/);
  assert.match(client, /updatePatternDetection\(\{state, label:/);
});

test("the studio connects recognized input and one canonical state to WebGL", () => {
  assert.match(page, /<CubeViewport \/>/);
  assert.match(page, /data-preset="M2 E2 S2"/);
  assert.match(viewportComponent, /data-cube-canvas/);
  assert.match(client, /label: "Orbit64"/);
  assert.match(client, /label: "Cubie coordinates"/);
  assert.match(client, /"Compact facelets"/);
  assert.match(client, /"Compact colours"/);
  assert.match(client, /viewport\?\.setScene\(state/);
});

test("the viewport renders on demand and pauses while off screen", () => {
  assert.match(viewport, /requestAnimationFrame\(render\)/);
  assert.match(viewport, /new IntersectionObserver/);
  assert.match(viewport, /bufferSubData/);
  assert.doesNotMatch(viewport, /requestAnimationFrame\(render\)[\s\S]{0,100}requestAnimationFrame/);
});

test("the viewport exposes a visibility-aware auto-orbit toggle", () => {
  assert.match(viewportComponent, /data-auto-orbit/);
  assert.match(client, /viewport\?\.setAutoOrbit\(enabled\)/);
  assert.match(viewport, /setAutoOrbit\(enabled\)/);
  assert.match(viewport, /document\.hidden/);
  assert.match(viewport, /stopAutoOrbitFrame\(\)/);
  assert.match(client, /autoOrbitButton\.setAttribute\("aria-pressed", String\(enabled\)\)/);
  assert.match(client, /setAutoOrbitEnabled\(false, false\)/);
});

test("the viewport exposes a lazy multi-vendor smart-cube dock", () => {
  assert.match(viewportComponent, /data-smart-cube-connect/);
  assert.match(viewportComponent, /data-smart-cube-status/);
  assert.match(viewportComponent, /data-smart-cube-battery/);
  assert.match(viewportComponent, /data-smart-cube-sync/);
  assert.match(viewportComponent, /data-smart-cube-reset-state/);
  assert.match(viewportComponent, /data-smart-cube-orientation/);
  assert.match(viewportComponent, /data-smart-cube-disconnect/);
  assert.match(viewportComponent, /data-smart-cube-sound/);
  assert.match(viewportComponent, /data-smart-cube-mistakes/);
  assert.match(viewportComponent, /data-smart-cube-reroute/);
  assert.doesNotMatch(viewportComponent, /data-smart-cube-confirm-rotation/);
  assert.match(client, /import\("\.\/smart-cube\/index"\)/);
  assert.ok(
    client.indexOf('smartCubeConnect.addEventListener("click"')
    < client.indexOf("const bluetooth = navigator.bluetooth"),
    "Bluetooth must only be probed inside the explicit Connect gesture",
  );
  assert.match(client, /manager\.subscribeEvents\(handleSmartCubeEvent\)/);
  assert.match(client, /appendRecordedMove/);
  assert.match(client, /mirrorSmartCubeFaceletsToInput\(event\.facelets\)/);
  assert.match(client, /store\.patch\(\{size: 3, input: facelets\}\)/);
  assert.match(client, /if \(smartCubeStateSyncPending\)/);
  assert.match(client, /await smartCubeManager\.refresh\(\)/);
  assert.match(client, /await smartCubeManager\.resetCubeState\(\)/);
  assert.match(client, /local baseline updated without reading facelets/);
  assert.match(viewportComponent, /data-smart-cube-mac-recovery/);
  assert.match(client, /enableAddressSearch: false/);
  assert.match(client, /data-smart-cube-mac-recovery/);
  assert.match(client, /macAddressProvider: promptForEncryptedCubeMac/);
  assert.match(client, /promptForEncryptedCubeMac = async/);
  assert.match(client, /if \(!isFallbackCall\) return null/);
  assert.match(client, /enable-experimental-web-platform-features/);
  assert.match(client, /assessSmartCubeMove/);
  assert.match(client, /assessSmartCubeRecovery/);
  assert.match(client, /smartCubeRecoveryPrompt/);
  assert.match(client, /signalSmartCubeFeedback/);
  assert.match(viewport, /turnGuide\.tone === "recovery"/);
  assert.match(viewport, /turnGuideTone/);
  assert.match(client, /viewport\?\.setDeviceOrientation/);
  assert.match(client, /const waitForSmartCubeMove/);
  assert.match(client, /assessGyroRotation/);
  assert.match(client, /demonstrateSmartCubeRotation\(action, generation\)/);
  assert.match(client, /smartCubeCoachingFrameActive && activeTimeline\?\.states/);
  assert.match(client, /smartCubeHalfTurnProgress\?\.receivedMoves/);
  assert.match(client, /dataset\.halfTurnProgress = "true"/);
  assert.match(orientationVerifier, /halfTurn[\s\S]*Math\.abs\(signedDegrees\) >= 135/);
  assert.match(client, /Next physical move:/);
  assert.match(client, /if \(smartCubeConnected\) waitForSmartCubeMove\(\)/);
  assert.match(client, /applyWaitingTimelineMove/);
  assert.match(client, /applyPartialHalfTurn/);
  assert.match(client, /completedHalfTurn/);
  assert.match(client, /Repeat .* to complete/);
  assert.match(client, /if \(continueCoaching \|\| smartCubeRecovery \|\| handledByRecovery\) waitForSmartCubeMove\(\);/);
  assert.doesNotMatch(
    client,
    /\.finally\(\(\) => \{\s*smartCubeMovesInFlight -= 1;\s*if \(smartCubeMovesInFlight === 0\) renderSmartCubeLiveState\(\);/,
  );
  assert.match(
    client,
    /smartCubeOrientation\.disabled = !supportsOrientation;[\s\S]{0,300}setSmartCubeOrientationTracking\(supportsOrientation\)/,
  );
  assert.match(viewport, /setDeviceOrientation\(orientation/);
});

test("the viewport exposes a persistent opt-out for single-move turn guides", () => {
  assert.match(viewportComponent, /data-turn-guides/);
  assert.match(client, /store\.patch\(\{turnGuides: !turnGuides\}\)/);
  assert.match(store, /params\.get\("guides"\) !== "off"/);
  assert.match(store, /params\.set\("guides", "off"\)/);
  assert.match(client, /turnGuides && activeTurnGuide \? activeTurnGuide : null/);
  assert.doesNotMatch(client, /turnGuidesChanged && !turnGuides\) clearTurnGuide/);
});

test("move hover previews the exact pre-move state with four degrees of displacement", () => {
  assert.match(client, /activeTimeline\?\.states\?\.\[moveIndex\]/);
  assert.match(client, /planHoverPreview\(activeTimeline\.steps, cursor, target\)/);
  assert.match(client, /Math\.min\(10, transition\.speedMultiplier\)/);
  assert.match(client, /animateHoverPreviewTo\(moveIndex, generation\)/);
  assert.match(client, /animateHoverPreviewTo\(activeIndex, generation\)/);
  assert.match(client, /viewport\?\.setTurnPreview\(turnTransform\(before\.size, step\)\)/);
  assert.match(viewport, /turnPreviewTransform/);
  assert.match(viewport, /transformTurnPoint/);
  assert.doesNotMatch(viewport, /turnPreviewCamera/);
  assert.doesNotMatch(viewport, /previewCameraYaw/);
  assert.match(viewport, /cameraYaw = yaw\.toFixed\(6\)/);
  assert.match(viewport, /degrees = 4/);
  assert.match(client, /previewFacelets = FaceletCodec\.render\(before\)/);
});

test("the viewport animates complete cubies with shader layer transforms", () => {
  assert.match(viewport, /attribute vec3 aCubie/);
  assert.match(viewport, /rotateAround/);
  assert.match(viewport, /export const turnTransform/);
  assert.match(viewport, /animateTurn/);
  assert.match(viewport, /1 - \(1 - progress\) \*\* 3/);
});

test("the viewport exposes state-driven source and destination focus", () => {
  assert.match(viewport, /setFocus\(nextFocus\)/);
  assert.match(viewport, /sin\(uFocusTime \* 4\.0\)/);
  assert.match(viewport, /cubieFaceOutline/);
  assert.match(viewport, /focusHighlight = "edges"/);
  assert.doesNotMatch(viewport, /targetGhost/);
  assert.doesNotMatch(viewport, /ghostAlpha/);
  assert.doesNotMatch(viewport, /sourceEdge/);
  assert.doesNotMatch(viewport, /uFocusSource/);
});

test("the viewport layers a projected motion HUD over the persistent WebGL canvas", () => {
  assert.match(viewportComponent, /data-motion-overlay/);
  assert.match(client, /querySelector<HTMLCanvasElement>\("\[data-motion-overlay\]"\)/);
  assert.match(viewport, /drawMotionOverlay/);
  assert.match(viewport, /quadraticCurveTo/);
  assert.match(viewport, /turnSurfaceArrowPaths/);
  assert.match(viewport, /sourceVisible && targetVisible/);
  assert.match(viewport, /Rotating to show/);
  assert.match(viewport, /setTurnGuide\(nextGuide\)/);
  assert.doesNotMatch(viewportComponent, /data-turn-guide-style/);
  assert.doesNotMatch(viewport, /turnArcPoints/);
  assert.match(viewport, /varying float vGuideLayer/);
  assert.match(viewport, /vec3 muted = mix\(colour, vec3\(luminance\), 0\.18\) \* 0\.86/);
  assert.match(viewport, /setMilestone\(nextMilestone\)/);
  assert.match(viewport, /smoothOrbitTo/);
  assert.match(viewport, /uMilestoneCubies\[20\]/);
});

test("the viewport exposes bounded tape controls for exact algorithm states", () => {
  assert.match(viewportComponent, /data-playback-begin/);
  assert.match(viewportComponent, /data-playback-back/);
  assert.match(viewportComponent, /data-playback-reverse/);
  assert.match(viewportComponent, /data-playback-pause/);
  assert.match(viewportComponent, /data-playback-play/);
  assert.match(viewportComponent, /data-playback-forward/);
  assert.match(viewportComponent, /data-playback-end/);
  assert.equal(viewportComponent.match(/class="transport-btn/g)?.length, 7);
  assert.doesNotMatch(viewportComponent, /data-playback-(?:toggle|sequence-back|sequence-forward)/);
  assert.match(viewportComponent, /data-playback-scrubber/);
  assert.match(viewportComponent, /data-playback-speed/);
  assert.match(viewportComponent, /\[0\.2, 0\.5, 1, 2, 5, 10\]/);
  assert.match(client, /const duration = 720/);
  assert.match(viewportComponent, /data-playback-loop/);
  assert.match(client, /MAX_PLAYBACK_STEPS/);
  assert.match(client, /transitionTo/);
  assert.match(client, /case "ArrowLeft"/);
  assert.match(client, /case "ArrowRight"/);
  assert.match(client, /event\.key\.toLowerCase\(\) === "c"/);
  assert.match(viewportComponent, /data-shortcuts-dialog/);
  assert.match(viewportComponent, /data-shortcuts-help/);
  assert.match(client, /queueDirectMove/);
  assert.match(client, /pendingDirectMove/);
  assert.match(viewportComponent, /data-coaching-mode="coached"/);
  assert.match(viewportComponent, /data-coaching-mode="continuous"/);
  assert.match(client, /phaseMilestonePositions/);
  assert.match(client, /Step \$\{completedPhase\.number\} complete/);
  assert.match(client, /Next: \$\{nextPhase\.title\}/);
  assert.match(client, /planTimelineClick\(activeTimeline\.steps, activeIndex, target\)/);
  assert.match(client, /"time-travel"/);
  assert.match(client, /playbackSpeed \* plan\.speedMultiplier/);
  assert.match(client, /planSequenceStep\(activeTimeline\.steps, activeIndex, direction\)/);
  assert.match(client, /showNextSequencePurpose/);
  assert.match(client, /focusCameraTarget/);
  assert.match(client, /sequenceCameraYaw = camera\.yaw\.toFixed\(6\)/);
});

test("the tape groups sequences, focuses cubies, and spaces only Academy phases", () => {
  assert.match(client, /className = "move-group"/);
  assert.match(client, /"timeline-gap step-gap"/);
  assert.match(client, /"timeline-gap pause-gap"/);
  assert.match(client, /button\.textContent = label/);
  assert.match(client, /entry\.groupId/);
  assert.match(client, /describeTimelineGroup\(groupEntries, phase\)/);
  assert.match(client, /Algorithm sequence purpose: \$\{description\}/);
  assert.match(client, /selectTutorialPiece\(before, after, phaseFocusNumber\(phase\)\)/);
  assert.match(client, /focusForPiece\(displayed, focusedPiece\)/);
  assert.match(client, /activateTurnGuide\(button, entry\.step!, label, index\)/);
  assert.match(client, /firstFocusPieceInPhase\(phase\)/);
  assert.doesNotMatch(client, /\.title = description/);
});
