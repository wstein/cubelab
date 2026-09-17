import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

const page = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
const playerPage = await readFile(new URL("../src/pages/player.astro", import.meta.url), "utf8");
const academyPage = await readFile(new URL("../src/pages/academy.astro", import.meta.url), "utf8");
const workbenchPage = await readFile(new URL("../src/pages/workbench.astro", import.meta.url), "utf8");
const patternsPage = await readFile(new URL("../src/pages/patterns.astro", import.meta.url), "utf8");
const timerPage = await readFile(new URL("../src/pages/timer.astro", import.meta.url), "utf8");
const mockPage = await readFile(new URL("../src/pages/dev/mock.astro", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const client = await readFile(new URL("../src/client/converter.ts", import.meta.url), "utf8");
const notationDialect = await readFile(new URL("../src/client/notation-dialect.ts", import.meta.url), "utf8");
const manualState = await readFile(new URL("../src/client/manual-state.ts", import.meta.url), "utf8");
const timerWorkspace = await readFile(new URL("../src/client/timer/workspace.ts", import.meta.url), "utf8");
const solverWorker = await readFile(new URL("../src/client/workers/solver.worker.ts", import.meta.url), "utf8");
const manualStateWorker = await readFile(new URL("../src/client/workers/manual-state.worker.ts", import.meta.url), "utf8");
const viewport = await readFile(new URL("../src/client/cube-gl.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../src/client/store.ts", import.meta.url), "utf8");
const viewportComponent = await readFile(
  new URL("../src/Components/CubeViewport.astro", import.meta.url),
  "utf8",
);
const manifest = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
const pwa = await readFile(new URL("../src/client/pwa.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/global.css", import.meta.url), "utf8");

test("every Academy puts its current guidance before the introduction and phase details", () => {
  const panels = [...page.matchAll(/data-academy-method-panel="([^"]+)"/g)];
  assert.equal(panels.length, 12);
  for (const [index, match] of panels.entries()) {
    const panel = page.slice(match.index, panels[index + 1]?.index ?? page.indexOf("</section>", match.index));
    const current = panel.search(/data-[\w-]+-current/);
    const intro = panel.indexOf('class="academy-intro"');
    const phases = panel.search(/data-[\w-]+-phases/);
    assert.ok(current >= 0 && current < intro && current < phases, `${match[1]}: current step precedes lesson details`);
    const guide = panel.search(/data-[\w-]+-guide hidden/);
    if (guide >= 0) {
      assert.ok(guide < intro, `${match[1]}: next guide precedes introduction`);
      const actions = panel.indexOf('class="academy-solution-actions"');
      assert.ok(actions > guide && actions < intro, `${match[1]}: guide actions immediately available before lesson details`);
    }
  }
});

test("the static shell declares the reversible state-interchange cards", () => {
  assert.match(page, /key: "pieces"[\s\S]*sizes: "2,3,4,5"/);
  assert.match(page, /key: "orbit64"[\s\S]*sizes: "2,3,4,5"/);
  assert.match(page, /data-output-card=\{key\}/);
  assert.match(page, /data-copy-orbit64/);
  assert.match(page, />Copy as Orbit64</);
  assert.match(page, /data-copy-facelets/);
  assert.match(page, />Copy as compact facelets</);
  assert.match(page, /key: "sse"[\s\S]*sizes: "2,3,4,5"/);
  assert.match(page, /key: "singmaster"[\s\S]*sizes: "2,3,4,5"/);
  assert.match(page, /key: "acube"[\s\S]*sizes: "3"/);
  assert.match(client, /renderSseState/);
  assert.match(client, /renderSingmasterCycleState/);
  assert.match(client, /renderAcubeState/);
});

test("the dedicated player route reuses the full interactive viewport", () => {
  assert.match(playerPage, /initialPlayer=\{true\}/);
  assert.match(viewportComponent, /data-player-page-link/);
  assert.match(viewportComponent, /data-viewport-maximize/);
  assert.match(client, /document\.body\.classList\.toggle\("player-page", playerMode\)/);
  assert.match(client, /const setPlayerMode = \(enabled: boolean, pushHistory = true\)/);
  assert.match(client, /window\.history\.pushState\(null, "",/);
  assert.match(client, /window\.addEventListener\("popstate"/);
  assert.match(client, /setPlayerMode\(false\)/);
  assert.match(client, /playerPageLink\.textContent = playerMode \? "Back to studio" : "Full-size player"/);
  assert.match(client, /document\.documentElement\.requestFullscreen/);
  assert.match(client, /fullscreenchange/);
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
  assert.match(page, /data-timer-export-cstimer/);
  assert.match(page, /data-timer-import-cstimer/);
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
  assert.match(client, /smartCubeSyncMode === "VirtualController"/);
  assert.match(client, /cubelab:timer-scramble/);
  assert.match(timerWorkspace, /dataset\.timerBreakdown/);
  assert.match(timerWorkspace, /reconstructionBreakdown/);
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
  assert.match(page, /<link rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(page, /registerPwa\(\)/);
});

test("the production shell is installable and caches only CubeLab's same-origin app shell", () => {
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"start_url": "\/"/);
  assert.match(manifest, /"src": "\/favicon\.png"/);
  assert.match(pwa, /import\.meta\.env\.PROD/);
  assert.match(pwa, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  assert.match(serviceWorker, /"\/academy\/"/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
});

test("the converter exposes full two-phase solutions through a dedicated worker contract", () => {
  assert.match(page, /data-two-phase-solve/);
  assert.match(page, /data-two-phase-apply/);
  assert.match(page, /data-two-phase-result/);
  assert.match(page, /data-two-phase-target/);
  assert.match(page, /Target \(optional\)/);
  assert.match(client, /createTwoPhaseSolverClient/);
  assert.match(client, /relativeAcademyState\(setup\._0\.state, target\._0\)/);
  assert.match(client, /twoPhaseSolverClient\.solve\(\s*relative\._0,/);
  assert.match(client, /The two-phase solution did not replay from Setup to the target/);
  assert.match(solverWorker, /type: "solveTwoPhase"/);
  assert.match(solverWorker, /twoPhaseProgress/);
  assert.match(solverWorker, /TwoPhaseSolver\.solveAtDepth\(request\.state, bound\)/);
  assert.match(solverWorker, /const preferredBound = 20/);
  assert.match(solverWorker, /const maximumBound = 24/);
  assert.match(solverWorker, /const refining = request\.refine === true/);
  assert.match(client, /Search for better result/);
  assert.match(client, /refine: true, maximumDepth: twoPhaseBestMoveCount! - 1/);
  assert.match(solverWorker, /TwoPhaseSolver\.describeError\(result\._0\)/);
  assert.match(solverWorker, /result\._0 === "SearchFailed"/);
  assert.match(solverWorker, /cancelledTwoPhaseRequests = new Set<number>/);
  assert.match(solverWorker, /twoPhaseCandidate/);
  assert.match(client, /twoPhaseSolverClient\.terminate\(\)/);
  assert.match(client, /twoPhaseSolverClient = newTwoPhaseSolverClient\(\)/);
  assert.match(client, /discarded the stale two-phase solution/);
  assert.match(client, /Best so far:/);
  assert.match(client, /twoPhaseApply\.addEventListener/);
  assert.match(client, /Setup or Target changed; generate a new two-phase solution/);
  assert.match(client, /const twoPhaseSourceKeyForCurrent = \(\): string =>\s*`\$\{input\.value\}\\u0000\$\{twoPhaseTarget\.value\}`/);
  assert.match(client, /movesInput\.addEventListener\("input", \(\) => \{[\s\S]{0,500}?store\.patch\(\{moves: movesInput\.value\}\);/);
  assert.match(client, /store\.patch\(\{moves:/);
});

test("the converter exposes a lazy HTM-optimal 2×2 solver through its worker contract", () => {
  assert.match(page, /data-optimal-2x2-row/);
  assert.match(page, /Find optimal solution/);
  assert.match(page, /HTM-optimal solution/);
  assert.match(client, /createOptimal2x2SolverClient/);
  assert.match(client, /optimal2x2Row\.hidden = size !== 2/);
  assert.match(client, /optimal2x2SolverClient\.solve\(setup\._0\.state\)/);
  assert.match(client, /const solverSetupSourceKeyForCurrent = \(\): string =>\s*`\$\{input\.value\}\\u0000\$\{schemeSelect\.value\}\\u0000\$\{customScheme\.value\}`/);
  assert.match(client, /const sourceKey = solverSetupSourceKeyForCurrent\(\);/);
  assert.match(client, /Setup changed; generate a new optimal solution/);
  assert.match(solverWorker, /type: "solveOptimal2x2"/);
  assert.match(solverWorker, /!Optimal2x2Solver\.hasPreparedTables\(\)/);
  assert.match(solverWorker, /Searching for an HTM-optimal solution…/);
  assert.match(solverWorker, /Optimal2x2Solver\.solve\(request\.state\)/);
});

test("the converter only finishes an already-reduced 4×4 through the worker", () => {
  assert.match(page, /data-reduction-4x4-row/);
  assert.match(page, /Finish reduced state/);
  assert.match(page, /Requires completed centres and paired wings/);
  assert.match(client, /createReduction4x4SolverClient/);
  assert.match(client, /reduction4x4Row\.hidden = size !== 4/);
  assert.match(client, /reduction4x4SolverClient\.solve\(setup\._0\.state\)/);
  assert.match(client, /STM.*OBTM reduced finish/);
  assert.match(client, /Setup changed; generate a new 4×4 solution/);
  assert.match(solverWorker, /type: "solveReduced4x4"/);
  assert.match(solverWorker, /reduce4x4\(request\.state\)/);
  assert.match(solverWorker, /isMonochromeSolved4x4\(replay\._0\)/);
});

test("half-turn arrows carry a matching 2× overlay badge", () => {
  assert.match(viewport, /drawRepeatIndicator\(overlay, "2×"/);
  assert.match(viewport, /\(\(turnGuide\.step\.turns % 4\) \+ 4\) % 4 === 2/);
});

test("Academy exposes an optional target pattern field", () => {
  assert.match(page, /data-academy-target/);
  assert.match(page, /Target pattern/);
  assert.match(client, /relativeAcademyState\(initialState, target\._0\)/);
  assert.match(client, /generated solution did not replay from setup to the target pattern/);
});

test("Academy exposes the milestone-first 5×5 reduction inspector", () => {
  assert.match(page, /data-academy-method="reduction5x5"/);
  assert.match(page, /data-reduction-5x5-academy-status/);
  assert.match(client, /inspectReduction5x5/);
  assert.match(solverWorker, /planNextCentre5x5/);
  assert.match(solverWorker, /planNextWingPair5x5/);
  assert.match(client, /createReductionGuideClient/);
  assert.doesNotMatch(client, /planNextCentre5x5|planNextWingPair5x5/);
  assert.match(page, /data-reduction-5x5-academy-find-cycle/);
  assert.match(page, /data-reduction-5x5-academy-find-bar/);
  assert.match(page, /data-reduction-5x5-academy-find-l2e/);
  assert.match(page, /data-reduction-5x5-academy-repair-parity/);
  assert.match(client, /createReduction5x5CycleSolverClient/);
  assert.match(client, /createReduction5x5BarSolverClient/);
  assert.match(client, /createReduction5x5L2ESolverClient/);
  assert.match(client, /Stop centre-cycle search/);
  assert.doesNotMatch(client, /Use the 1×3 bar guide/);
  assert.match(page, /Find 1×3 bar commutator/);
  assert.match(client, /2R U 2R' U'/);
  assert.match(client, /2L' U L U' 2L/);
  assert.match(client, /OLL parity: 2R U2 2L F2/);
  assert.match(client, /planOLLParityRepair5x5/);
  assert.match(client, /reduction5x5ImmediateGuideKey/);
  assert.match(solverWorker, /solve5x5CentreCycle/);
  assert.match(solverWorker, /solve5x5CentreBar/);
  assert.match(solverWorker, /solve5x5L2E/);
  assert.match(solverWorker, /reduction5x5CycleProgress/);
  const reduction4x4Renderer = client.match(/const renderReduction4x4Academy = \([\s\S]*?if \(size !== 4\)/)?.[0] ?? "";
  assert.doesNotMatch(reduction4x4Renderer, /applyWing/);
  assert.doesNotMatch(reduction4x4Renderer, /findCycle/);
});

test("the editor separates a synchronized setup from optional replay moves", () => {
  assert.match(page, /Setup \(state\)/);
  assert.match(page, /data-moves-input/);
  assert.match(page, /data-note-input/);
  assert.match(page, /optional, shared in the link/);
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
  assert.match(page, /data-setup-orientation/);
  assert.match(page, /data-setup-canonicalise/);
  assert.match(client, /const canonicaliseSetupOrientation/);
  assert.match(client, /Rotated centre frame/);
  assert.match(client, /Canonical U\/R\/F frame/);
  assert.match(client, /input\.dispatchEvent\(new Event\("input"/);
});

test("the 2x2 through 5x5 manual state editor keeps a constrained draft separate from Setup", () => {
  assert.match(page, /data-manual-state-open/);
  assert.match(page, /data-manual-state-grid/);
  assert.match(page, /data-manual-state-representation="standard"/);
  assert.match(page, /data-manual-state-representation="attached"/);
  assert.match(page, /data-manual-state-representation="dual-3d"[^>]*>Dual 3D</);
  assert.match(page, /data-manual-state-representation="isometric"/);
  assert.match(page, /data-manual-state-load/);
  assert.match(client, /store\.patch\(\{input: manualStateSpacedFacelets\(manualSize\)\}\)/);
  assert.match(client, /allowedManualStateColours\(manualSize, manualStateDraft, index\)/);
  assert.match(client, /fillForcedManualStateColours\(manualSize, source\)/);
  assert.match(client, /fillLocallyForcedManualStateColours\(manualSize, source\)/);
  assert.match(client, /dot\.dataset\.available = String\(choices\.includes\(choice\)\)/);
  assert.match(client, /manualStateAutoIndices\.add\(index\)/);
  assert.match(client, /const manualStateExplicitIndices = new Set<number>\(\)/);
  assert.match(client, /const manualStateUnverifiedDots = new Set<number>\(\)/);
  assert.match(client, /refreshManualStateAutoFill\(manualSize, true\)/);
  assert.match(client, /if \(manualStateDirtyDots === null \|\| manualStateDirtyDots\.size > 0\) \{[\s\S]{0,300}manualStateDotGeneration \+= 1;/);
  assert.match(client, /if \(!needsDots\) \{\s*if \(manualStateUnverifiedDots\.has\(index\)\) pendingDots\.push\(\{index, element: dots\}\);/);
  assert.match(client, /if \(manualSize === 2\) \{[\s\S]{0,300}allowedManualStateColours[\s\S]{0,300}else \{[\s\S]{0,300}locallyAllowedManualStateColours[\s\S]{0,300}pendingDots\.push/);
  assert.match(client, /verifyManualStateDots\(manualSize, pendingDots\)/);
  // A dotless tile means the draft has no completion; it must never be silent.
  assert.match(client, /dotTrace\.deadTile\(manualSize, snapshot, next\.index, "verify"\)/);
  assert.match(client, /const manualStateDeadIndices = new Set<number>\(\)/);
  assert.match(client, /manual-state-dead-row/);
  assert.match(client, /undoManualStateAction/);
  assert.match(client, /redoManualStateAction/);
  assert.match(client, /const manualStateUndoStack: ManualStateAction\[\] = \[\]/);
  assert.match(client, /const manualStateRedoStack: ManualStateAction\[\] = \[\]/);
  assert.match(client, /commitManualStateAction\(stroke\.before\)/);
  assert.match(styles, /\.manual-state-dead-row/);
  assert.match(styles, /\.manual-state-undo-btn/);
  assert.match(styles, /\.manual-state-history/);
  assert.match(styles, /\.manual-state-sticker\[data-dead="true"\]/);
  assert.match(page, /data-manual-state-undo[^>]*disabled/);
  assert.match(page, /data-manual-state-redo[^>]*disabled/);
  assert.match(page, /data-manual-state-smart-cube-sync[^>]*disabled/);
  assert.match(client, /manualStateSmartCubeSync\.addEventListener\("click", async \(\) =>/);
  assert.match(client, /smartCubeStateSyncPending = false;[\s\S]{0,240}smartCubeManager\.refresh\(\)/);
  assert.match(client, /importManualStateSmartCube = \(state: CubeState\)[\s\S]{0,180}replaceManualStateDraft\(state\)/);
  assert.match(client, /historyModifier && isZ[\s\S]{0,160}undoManualStateAction\(\)/);
  assert.match(client, /historyModifier && \(\(isZ && event\.shiftKey\) \|\| isY\)[\s\S]{0,160}redoManualStateAction\(\)/);
  assert.match(manualState, /export const explainManualStateColours/);
  assert.match(manualState, /export const manualStateColourBudget/);
  assert.match(client, /createManualStateVerifierClient/);
  assert.match(client, /choices\.length === 1[\s\S]{0,2000}updateManualStateMetrics\(manualSize\)/);
  assert.match(client, /manualStateVerifier\.verifyBatch/);
  assert.match(manualStateWorker, /verifyManualStateBatch/);
  assert.match(manualStateWorker, /allowedManualStateColours\(request\.size, request\.draft, request\.index\)/);
  assert.match(client, /manualStateDialog\.showModal\(\);[\s\S]{0,800}renderManualStateEditor\(\);/);
  assert.match(manualState, /const highOrderPieceKindsBySize/);
  assert.match(manualState, /const candidateCache = new WeakMap<CubieKind, Candidate\[\]\[\]>\(\)/);
  assert.doesNotMatch(manualState, /candidatesFor\(kind\)\.at\(0\)!/);
  assert.match(manualState, /const kinds = size >= 4 \? highOrderPieceKindsBySize\[size\] : kindsForSize\(size\)/);
  assert.match(manualState, /size >= 4 && unplaced > 0 && unplaced <= 2/);
  assert.match(client, /manualStateOpen\.disabled = size < 2 \|\| size > 5/);
  assert.match(client, /singmaster"\]'\)!\.hidden = manualSize >= 4/);
  assert.match(page, /class="manual-state-main"[\s\S]*data-manual-state-net/);
  assert.doesNotMatch(page, /data-manual-state-status/);
  assert.doesNotMatch(page, /data-manual-state-close/);
  assert.match(styles, /\.manual-state-shortcuts \{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\);[\s\S]*margin-top: 0\.6rem;/);
  assert.match(page, /class="manual-state-key manual-state-face-key"[\s\S]*data-face="U">U[\s\S]*data-face="B">B[\s\S]*class="manual-state-shortcut-actions"[\s\S]*manual-state-key-emphasis">E<\/span>erase[\s\S]*manual-state-key-emphasis">← ↑ ↓ →<\/span>/);
  assert.doesNotMatch(page, /set colour|move cursor/);
  assert.doesNotMatch(page, /class="manual-state-key">(?:click|drag|right-click|double-click)</);
  assert.match(page, /data-manual-state-copy-toggle[\s\S]*manual-state-footer/);
  assert.match(page, /manual-state-shortcuts[\s\S]*data-manual-state-copy-toggle/);
  assert.match(page, /class="manual-state-tools"[\s\S]*manual-state-shortcuts[\s\S]*manual-state-notation[\s\S]*data-manual-state-copy-toggle/);
  assert.match(styles, /\.manual-state-dialog \{[\s\S]*width:\s*min\(74rem, calc\(100vw - 2rem\)\);[\s\S]*height:\s*fit-content;[\s\S]*max-height:\s*calc\(100dvh - 2rem\)/);
  assert.match(styles, /\.manual-state-shortcuts-grid \{[\s\S]*display: contents;/);
  assert.match(styles, /\.manual-state-shortcuts-grid \.manual-state-shortcut-actions \{[\s\S]*grid-row: 1 \/ span 2;[\s\S]*display: grid;/);
  assert.match(styles, /\.manual-state-face-key \{[\s\S]*grid-template-columns: repeat\(6, 0\.62rem\);/);
  assert.match(styles, /\.manual-state-key-emphasis \{[\s\S]*font-weight: 800;/);
  assert.match(styles, /\.manual-state-tools \{[\s\S]*flex: 0 1 18rem;/);
  assert.match(styles, /\.manual-state-net\[data-representation="attached"\] \{[\s\S]*transform: translate\(4\.1667%, -5\.5556%\);/);
  assert.match(styles, /\.manual-state-net\[data-representation="dual-3d"\] \.manual-state-face \{[\s\S]*transition: transform 380ms/);
  assert.match(client, /manualStateRepresentation === "dual-3d"[\s\S]*--manual-state-dual-yaw/);
  assert.match(styles, /\.manual-state-tool\[data-manual-state-eraser\]\[aria-pressed="true"\]/);
  assert.match(styles, /\.manual-state-tool\[data-manual-state-eraser\]\.shift-active/);
  assert.match(styles, /\.manual-state-colour\[data-clear-colour="true"\][\s\S]*content: "⌫ "/);
  assert.match(client, /button\.dataset\.clearColour = String\(manualStateShiftPressed\)/);
  assert.match(client, /left\.textContent = `\$\{remaining\} left`/);
  assert.doesNotMatch(client, /manualStateShiftPressed \? "Reset"/);
  assert.match(client, /resetManualStateColour/);
  assert.doesNotMatch(client, /manualStateSummaryRow\("Known"/);
  assert.match(client, /largeManualStateProgress\(manualSize, manualStateDraft\)/);
  assert.match(manualState, /export const largeManualStateProgress/);
  assert.match(manualState, /\["xCentres", "plusCentres", "coreCentres"\]/);
  assert.match(client, /isManualStateCoreCentre\(manualSize, index\)/);
  assert.match(manualState, /const validCentreFrames:[\s\S]*faceletOrder\.flatMap/);
  assert.match(manualState, /if \(!canCompleteCentreFrame\(size, draft\)\) return false/);
  assert.match(styles, /data-manual-state-size="4"[\s\S]*\.manual-state-main/);
  assert.match(styles, /data-manual-state-size="5"[\s\S]*\.manual-state-main/);
  assert.match(client, /const remaining = total - entered;[\s\S]*remainingLabel\.textContent = "Remaining"/);
  assert.doesNotMatch(client, /if \(remaining === 0\) return;/);
  assert.match(client, /if \(key === "E"\) \{[\s\S]*eraseManualStateSticker\(index\)/);
  assert.match(client, /const manualStateColourKeys:[\s\S]*W: "U"[\s\S]*G: "F"[\s\S]*Y: "D"[\s\S]*O: "L"/);
  assert.match(client, /const colour = manualStateColourKeys\[key\];[\s\S]*paintManualStateSticker\(index, colour\)/);
  assert.match(client, /if \(manualStateAutoIndices\.has\(index\)\) return;/);
  assert.match(client, /const fixManualStateAutoSticker = \(index: number, recordAction = true\): boolean => \{[\s\S]*paintManualStateSticker\(index, colour, recordAction\)/);
  assert.match(client, /if \(fixManualStateAutoSticker\(index\)\) return;/);
  assert.match(client, /sticker\.dataset\.centre = String\(centre\)/);
  assert.match(client, /const manualStateVisibleFaces = \(\): readonly ManualStateFace\[\]/);
  assert.match(client, /manualStateRepresentation === "isometric"\s*\? manualStateScreenArrowTarget/);
  assert.match(client, /const manualStateRenderedCentre = \(element: HTMLElement\)/);
  assert.match(client, /getBoxQuads\?\.call\(element\)\[0\]/);
  assert.match(client, /wireManualStateKeyboard\(manualStateDialog\)/);
  assert.match(client, /paintRoot\.addEventListener\("pointerdown"/);
  assert.match(client, /paintRoot\.setPointerCapture\(event\.pointerId\)/);
  assert.match(client, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.doesNotMatch(page, /data-manual-state-previews/);
  assert.doesNotMatch(styles, /\.manual-state-preview/);
  assert.doesNotMatch(page, /data-manual-state-attached-net/);
  assert.doesNotMatch(client, /buildManualStateAttachedNet/);
  assert.match(client, /manualStateNet\.dataset\.representation = manualStateRepresentation/);
  assert.match(client, /startViewTransition/);
  assert.match(client, /manual-state-face-\$\{face\.toLowerCase\(\)\}/);
  assert.match(styles, /\.manual-state-net\[data-representation="attached"\] \{/);
  assert.match(styles, /\.manual-state-net\[data-representation="attached"\] \.manual-state-face/);
  assert.match(styles, /\.manual-state-net\[data-representation="dual-3d"\] \{/);
  assert.match(styles, /data-representation="dual-3d"\][^}]*\.manual-state-net-faces\s*\{[^}]*pointer-events:\s*none/);
  assert.match(styles, /data-representation="dual-3d"\][^}]*\.manual-state-face\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(styles, /data-dual-rig="upper"[\s\S]*--manual-state-dual-camera-yaw: -35deg/);
  assert.match(styles, /data-dual-rig="lower"[\s\S]*--manual-state-dual-camera-yaw: 145deg/);
  assert.match(styles, /data-face="B"[\s\S]*rotateY\(180deg\)[\s\S]*data-face="L"[\s\S]*rotateY\(-90deg\)/);
  assert.match(client, /syncManualStateDualRig[\s\S]*cloneNode\(true\)[\s\S]*MutationObserver/);
  assert.match(styles, /data-face="U"[\s\S]*rotateX\(90deg\)[\s\S]*data-face="D"[\s\S]*rotateX\(-90deg\)/);
  assert.match(styles, /--manual-state-dual-pitch: -35\.264deg;[\s\S]*--manual-state-dual-pitch: 35\.264deg;/);
  assert.match(styles, /\.manual-state-net\[data-representation="isometric"\] \{/);
  assert.match(styles, /\.manual-state-net\[data-representation="isometric"\] \.manual-state-face/);
  assert.match(styles, /\.manual-state-face\[data-interactive="false"\]\s*\{[\s\S]*pointer-events:\s*none/);
  assert.match(styles, /\.manual-state-sticker\[data-piece-hover="self"\]\s*\{[\s\S]*inset 0 0 0 2px #0f172a,[\s\S]*0 0 0 2px #67e8f9;[\s\S]*z-index:\s*2/);
  assert.match(styles, /\.manual-state-sticker\[data-piece-hover="mate"\]\s*\{[\s\S]*inset 0 0 0 2px #0f172a,[\s\S]*0 0 0 2px #ffc94a;[\s\S]*z-index:\s*2/);
  assert.match(styles, /data-representation="dual-3d"[\s\S]*data-piece-hover="self"[\s\S]*inset 0 0 0 2px #67e8f9,[\s\S]*inset 0 0 0 4px #0f172a;\s*\}/);
  assert.match(styles, /data-representation="dual-3d"[\s\S]*data-piece-hover="mate"[\s\S]*inset 0 0 0 2px #ffc94a,[\s\S]*inset 0 0 0 4px #0f172a;\s*\}/);
  assert.match(styles, /\.manual-state-sticker\[data-cursor="true"\]\s*\{[\s\S]*inset 0 0 0 2px #f8fafc,[\s\S]*inset 0 0 0 4px #0f172a,[\s\S]*0 0 0 2px #67e8f9;[\s\S]*z-index:\s*3/);
  assert.match(styles, /\.manual-state-sticker\[data-face="unknown"\]\s*\{[\s\S]*background:\s*#1e293b/);
  assert.doesNotMatch(styles, /data-representation="isometric"[^}]*\.manual-state-sticker\[data-face="unknown"\]/);
  assert.match(styles, /--manual-state-face-gap: 0\.3rem;[\s\S]*gap: var\(--manual-state-face-gap\);/);
  assert.match(styles, /data-representation="open-cube"[\s\S]*padding: calc\(var\(--manual-state-face-gap\) \* 0\.5\);/);
  assert.match(styles, /--attached-face-gap: var\(--manual-state-face-gap\);/);
  assert.match(styles, /--attached-fold-gap: 0\.2rem;/);
  assert.match(styles, /--attached-depth-ratio: 0\.6667;/);
  assert.match(styles, /skewX\(-45deg\) scaleY\(var\(--attached-depth-ratio\)\)/);
  assert.match(styles, /skewY\(-45deg\) scaleX\(var\(--attached-depth-ratio\)\)/);
  assert.match(styles, /translate\(-33\.33%, calc\(-66\.67% - var\(--manual-state-face-gap\)\)\)/);
  assert.match(styles, /::view-transition-group\(manual-state-face-u\)/);
  assert.doesNotMatch(styles, /\.manual-state-sticker\[data-centre="true"\][^{]*\{/);
  assert.match(client, /centre \? ", core centre" : ""/);
  assert.match(client, /paintRoot\.addEventListener\("dblclick",[\s\S]*manualStateRawStickerAt/);
  assert.match(styles, /\.manual-state-sticker\[data-auto="true"\]\s*\{[\s\S]*transform:\s*scale\(/);
  assert.match(styles, /data-face="L"[^}]*data-auto="true"[\s\S]*data-face="B"[^}]*data-auto="true"[\s\S]*scaleX\(-1\) scale\(0\.85\)/);
  assert.match(styles, /data-face="D"[^}]*data-auto="true"[\s\S]*scaleY\(-1\) scale\(0\.85\)/);
  assert.doesNotMatch(styles, /\.manual-state-sticker\[data-auto="true"\]::after/);
  assert.match(client, /if \(key === "C"\) \{[\s\S]*event\.stopPropagation\(\);[\s\S]*return;/);
  assert.match(page, /data-manual-state-rotation-group/);
  assert.match(page, /data-manual-state-rotate="ccw"/);
  assert.match(page, /data-manual-state-rotate="cw"/);
  assert.match(page, /data-manual-state-rotate="flip"/);
  assert.match(client, /rotateManualStateView/);
  assert.match(client, /flipManualStateView/);
  assert.match(client, /const canRotateView = manualStateRepresentation === "dual-3d" \|\| manualStateRepresentation === "isometric"/);
  assert.match(client, /manualStateRotationGroup\.hidden = !canRotateView/);
  assert.match(client, /manualStateFlipButton\.hidden = manualStateRepresentation !== "isometric"/);
  assert.match(page, /data-manual-state-shortcut-rotate[\s\S]*data-manual-state-shortcut-flip/);
  assert.match(client, /manualStateViewDestination\(manualSize, source, yQuarterTurns, manualStateFlipped\)/);
  assert.match(client, /manualStateOrientedArrowTarget\(manualSize, index, direction\)/);
  assert.match(client, /manualStateNet\.dataset\.animState = "unexploded"/);
  assert.match(styles, /\.manual-state-net\[data-representation="isometric"\]\[data-orientation="1"\]/);
  assert.match(styles, /\.manual-state-net\[data-representation="isometric"\]\[data-orientation="2"\]/);
  assert.match(styles, /\.manual-state-net\[data-representation="isometric"\]\[data-orientation="3"\]/);
  assert.match(styles, /\.manual-state-net\[data-representation="isometric"\]\[data-flipped="true"\]/);
  assert.match(styles, /\.manual-state-net\[data-representation="isometric"\]\[data-anim-state="unexploded"\]/);
  assert.match(client, /manualStateRepresentation === "dual-3d" \|\| manualStateRepresentation === "isometric"[\s\S]*event\.key === "\[" \|\| event\.key === "\]"/);
  assert.match(client, /dialog\.addEventListener\("keydown",\s*\(event\)\s*=>\s*\{[\s\S]*event\.key === "Escape"[\s\S]*dialog\.close\(\)/);
});

test("the Vanilla DOM client wires reachability-aware outputs", () => {
  assert.match(client, /PieceReducer\.reduce\(state\)/);
  assert.match(client, /PieceReducer\.parseState\(size, compact\)/);
  assert.match(client, /PieceReducer\.render\(pieces\._0\)/);
  assert.match(client, /Orbit64Codec\.encodeState\(state\)/);
  assert.match(client, /Orbit64Codec\.decodeState\(compact\)/);
  assert.match(client, /const net = inputValue\.trimEnd\(\)/);
  assert.match(client, /card\.hidden =/);
  assert.match(client, /querySelectorAll<HTMLButtonElement>\(`\[data-copy=/);
  assert.match(client, /orbitQuickCopy\.hidden = !\(size in Orbit64Codec\.widths\)/);
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
  assert.match(page, /Twizzle \/ cubing\.js \(experimental NISS\)/);
  assert.match(page, /SSE 2×2–5×5 \(Superset ENG\)/);
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
  assert.match(page, /data-compatibility-profile="sse"/);
  assert.match(page, /data-compatibility-profile="acube"/);
  assert.match(page, /option value="Acube"/);
  assert.match(client, /MoveCompatibility\.evaluate/);
  assert.match(client, /const source = movesInput\.value\.trim\(\) === "" \? input\.value : movesInput\.value/);
  assert.match(client, /does not determine event-specific competition legality/);
});

test("the web UI exposes pure algorithm transforms and a clearly labeled practice scramble", () => {
  assert.match(page, /data-alg-transform="invert"/);
  assert.match(page, /data-alg-transform="simplify"/);
  assert.match(page, /data-alg-transform="factor-structure"/);
  assert.match(page, /data-alg-transform="optimize-regrips"/);
  assert.match(page, /data-alg-transform="expand-regrips"/);
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
  assert.match(client, /MoveTransform\.factorStructure/);
  assert.match(client, /MoveTransform\.optimizeRegrips/);
  assert.match(client, /MoveTransform\.expandRegripsToFaces/);
  assert.match(client, /MoveTransform\.mirror/);
  assert.match(client, /MoveTransform\.rotate/);
  assert.match(client, /MoveTransform\.practiceScramble/);
  assert.match(client, /smartCubeSyncMode !== "VirtualController"/);
  assert.match(client, /Virtual controller · practice scramble/);
  assert.match(client, /commitTransformedAlgorithm\(scramble\._0\);[\s\S]*Virtual controller · practice scramble/);
  assert.match(client, /Practice scramble loaded in Setup\. Turn the physical cube to match/);
  assert.match(client, /if \(smartCubeSyncMode === "VirtualController"\) return/);
});

test("Setup keeps optional tools behind an explicit expand control", () => {
  assert.match(page, /<details class="setup-options" data-setup-options>/);
  assert.match(page, /<summary>Expand Setup options<\/summary>/);
  const optionsStart = page.indexOf('data-setup-options');
  assert.ok(optionsStart > page.indexOf('id="cube-moves"'));
  assert.ok(page.indexOf('data-two-phase-solve', optionsStart) > optionsStart);
  assert.ok(page.indexOf('data-practice-scramble', optionsStart) > optionsStart);
});

test("the interactive preview exposes an editable, copyable move history", () => {
  assert.match(viewportComponent, /data-preview-history/);
  assert.match(viewportComponent, /data-preview-history-copy/);
  assert.match(viewportComponent, /data-preview-history-clear/);
  assert.match(client, /appendPreviewHistoryToken/);
  assert.match(client, /data-preview-history-copy/);
  assert.match(client, /case "regrip": \{/);
  assert.match(client, /appendPreviewHistoryToken\(event\.notationToken\)/);
  assert.match(client, /removeTrailingPreviewHistoryTokens\(\[event\.move1, event\.move2\]\)/);
});

test("the Setup parser recognizes explicit SSE cubie-state cycles apart from algorithms", () => {
  assert.match(client, /looksLikeSseState/);
  assert.match(client, /parseSseState/);
  assert.match(client, /looksLikeAcubeState/);
  assert.match(client, /parseAcubeState/);
  assert.match(client, /marked-centre orientation omitted/);
  assert.match(page, /SSE cubie cycles/);
});

test("the Workbench materializes ACube constraint families as concrete Setup states", () => {
  assert.match(page, /data-acube-generator-panel/);
  assert.match(page, /data-acube-generator-input/);
  assert.match(page, /data-acube-generator-seed/);
  assert.match(page, /data-acube-generator-choice/);
  assert.match(page, /data-acube-generator-run/);
  assert.match(page, /data-acube-generator-next/);
  assert.match(client, /parseAcubeConstraint/);
  assert.match(client, /materializeAcubeConstraint/);
  assert.match(client, /renderAcubeState/);
  assert.match(client, /countAcubeCompletions/);
  assert.match(client, /legal completion/);
  assert.match(client, /Loaded legal ACube completion/);
});

test("the Setup parser auto-detects the unambiguous SSE middle-dot delimiter", () => {
  assert.match(client, /dialectForPastedInput/);
  assert.match(notationDialect, /source\.includes\("·"\)/);
  assert.match(client, /Algorithm · SSE/);
});

test("the Workbench auto-detects native SSE prefixed moves", () => {
  assert.match(notationDialect, /ssePrefixedMove/);
  assert.match(client, /dialectForPastedInput\(movesInput\.value\)/);
});

test("controller-mode turns advance an active coached tape in the viewport frame", () => {
  assert.match(client, /const projectedMove = controllerMoveInViewportFrame/);
  assert.match(client, /await applyWaitingTimelineMove\(projectedMove, false\)/);
  assert.match(client, /Controller mode is intentionally different: its virtual state owns the/);
  assert.match(client, /smartCubeSyncMode === "VirtualController"/);
  assert.match(client, /detail: \{move: projectedMove, atMs: performance\.now\(\)\}/);
});

test("controller mode reads the current Setup rather than a stale recognized state", () => {
  assert.match(client, /const workspace = parseWorkspaceState\(\);/);
  assert.match(client, /workspace\.TAG === "Ok"\s*\? workspace\._0\.state\s*:\s*activeRecognized\?\.state/);
  assert.match(client, /immediately after Quick load cannot resurrect the previous solved/);
});

test("smart cube hardware face turn indices remain fixed on spatial cube rotation", () => {
  assert.match(client, /Smart cube hardware face encoders are physically fixed to their turn indices/);
  assert.doesNotMatch(client, /smartCubeControllerOrientation\.push\(regrip\)/);
  assert.doesNotMatch(client, /smartCubeControllerOrientationBaseline/);
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
  assert.match(page, /data-academy-method="twoByTwoBeginner"/);
  assert.match(page, /data-academy-method="advancedLbl"/);
  assert.match(page, /data-academy-method="beginnerCfop"/);
  assert.match(page, /data-academy-method="fullCfop"/);
  assert.match(page, /data-academy-method="advancedCfop"/);
  assert.match(page, /data-academy-method="petrus"/);
  assert.match(page, /data-academy-method="enhancedPetrus"/);
  assert.match(page, /data-academy-method="reduction4x4"/);
  assert.match(page, /57 OLL \+ 21 PLL/);
  assert.match(page, /data-academy-method-panel="beginner"/);
  assert.match(page, /data-academy-method-panel="twoByTwoBeginner"/);
  assert.match(page, /data-two-by-two-drill-case/);
  assert.match(client, /twoByTwoLoadDrill\.addEventListener\("click"/);
  assert.match(page, /data-academy-method-panel="advancedLbl"/);
  assert.match(page, /data-academy-method-panel="beginnerCfop"/);
  assert.match(page, /data-academy-method-panel="fullCfop"/);
  assert.match(page, /data-academy-method-panel="advancedCfop"/);
  assert.match(page, /data-academy-method-panel="petrus"/);
  assert.match(page, /data-academy-method-panel="enhancedPetrus"/);
  assert.match(page, /data-academy-method-panel="reduction4x4"/);
  assert.match(page, /data-reduction-4x4-academy-status/);
  assert.match(page, /data-reduction-4x4-academy-guide/);
  assert.match(page, /data-reduction-4x4-academy-apply-guide/);
  assert.match(page, /data-reduction-4x4-academy-finish/);
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
  assert.match(client, /twoByTwoAcademySolverClient\.solve\(initialState\)/);
  assert.match(client, /tutorialPhaseMoveCount/);
  assert.match(client, /inspectReduction4x4/);
  assert.match(client, /renderReduction4x4Academy/);
  assert.match(solverWorker, /planNextCentreBlock4x4/);
  assert.match(solverWorker, /planNextWingPair4x4/);
  assert.doesNotMatch(client, /planNextCentreBlock4x4|planNextWingPair4x4/);
  assert.match(client, /Resolve the last two wing pairs/);
  assert.match(client, /OLL parity/);
  assert.match(client, /phase\.sequences/);
  assert.match(client, /benchmarkTarget/);
});

test("practice scramble is a Quick load action rather than a transform", () => {
  assert.match(page, /class="preset-chip practice"[\s\S]*data-practice-scramble/);
  assert.match(page, /data-practice-2x2-difficulty-select[\s\S]*Exactly 3 HTM[\s\S]*Exactly 4 HTM[\s\S]*5\+ HTM/);
  assert.match(client, /random2x2ScrambleClient\.generate\(difficulty\)/);
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
  assert.match(client, /"Spaced facelets"/);
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
  assert.match(viewportComponent, /data-smart-cube-recenter/);
  assert.match(viewportComponent, /data-smart-cube-diagnostics/);
  assert.match(viewportComponent, /data-smart-cube-copy-trace/);
  assert.match(client, /cubelab\.smartCube\.diagnostics/);
  assert.match(client, /cubelab-smart-cube-tape-v1/);
  assert.match(client, /profile: "diagnostic"/);
  assert.doesNotMatch(client, /cubelab-smart-cube-diagnostic-v1/);
  assert.match(client, /traceSmartCubeStabilization\("gyro orientation"/);
  assert.match(client, /traceSmartCubeStabilization\("virtual regrip"/);
  assert.match(client, /source: "regrip-core"/);
  assert.match(client, /traceSmartCubeStabilization\("received event"/);
  assert.match(client, /manager\.subscribeCommands\(\(command\) =>/);
  assert.match(client, /traceSmartCubeStabilization\("sent command"/);
  assert.match(client, /if \(!smartCubeDiagnosticsEnabled\) return;/);
  assert.doesNotMatch(client, /cubelab\.smartCube\.gyroTrace/);
  assert.match(client, /const copied = await copyText\(JSON\.stringify\(report, null, 2\)\);/);
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
  assert.match(client, /recenterDeviceOrientation/);
  assert.match(client, /reconcileDeviceOrientation/);
  assert.match(viewport, /Regrip core owns calibration, magnetic detents, and drift compensation/);
  assert.match(client, /regrip detected/);
  assert.match(client, /appendRecordedMove/);
  assert.match(client, /mirrorSmartCubeFaceletsToInput\(event\.facelets\)/);
  assert.match(client, /const facelets = toSpacedFacelets\(rawFacelets, 3\)/);
  assert.match(client, /store\.patch\(\{size: 3, input: facelets\}\)/);
  assert.match(client, /if \(smartCubeStateSyncPending\)/);
  assert.match(client, /await smartCubeManager\.refresh\(\)/);
  assert.match(client, /await smartCubeManager\.resetCubeState\(\)/);
  assert.match(client, /local baseline updated without reading facelets/);
  assert.match(client, /await manager\.connect\(\);/);
  assert.match(client, /createRegripCoreManager/);
  assert.match(client, /device: diagnosticDevice/);
  assert.match(client, /assessSmartCubeMove/);
  assert.match(client, /assessSmartCubeRecovery/);
  assert.match(client, /smartCubeRecoveryPrompt/);
  assert.match(client, /signalSmartCubeFeedback/);
  assert.match(client, /smartCubeAudio\.play\("turn"\)/);
  assert.match(viewport, /turnGuide\.tone === "recovery"/);
  assert.match(viewport, /turnGuideTone/);
  assert.match(client, /viewport\?\.setDeviceOrientation/);
  assert.match(client, /const waitForSmartCubeMove/);
  assert.match(client, /source: "regrip-core"/);
  assert.match(client, /demonstrateSmartCubeRotation\(action, generation\)/);
  assert.match(client, /smartCubeCoachingFrameActive && activeTimeline\?\.states/);
  assert.match(client, /smartCubeHalfTurnProgress\?\.receivedMoves/);
  assert.match(client, /dataset\.halfTurnProgress = "true"/);
  assert.match(client, /Next physical move:/);
  assert.match(client, /playbackGuide\.addEventListener\("click"[\s\S]*waitForSmartCubeMove\(\)/);
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
    /smartCubeOrientation\.disabled = !supportsOrientation;[\s\S]{0,700}setSmartCubeOrientationTracking\(supportsOrientation\)/,
  );
  assert.match(viewport, /setDeviceOrientation\(orientation/);
});

test("smart-cube replay is dev-gated and exposes deterministic transport controls", () => {
  assert.match(viewportComponent, /data-smart-cube-replay-controls/);
  assert.match(viewportComponent, /data-smart-cube-replay-play/);
  assert.match(viewportComponent, /data-smart-cube-replay-step/);
  assert.match(viewportComponent, /data-smart-cube-replay-seek/);
  assert.match(viewportComponent, /data-smart-cube-replay-rate/);
  assert.match(client, /new URLSearchParams\(window\.location\.search\)\.has\("dev"\)/);
  assert.match(client, /replayTapeNameFromSearch\(window\.location\.search\)/);
  assert.match(client, /createReplaySmartCubeManager\(await loadReplayTape\(replayName\)\)/);
  assert.match(client, /smartCubeReplayControlsApi\?\.seek/);
  assert.match(client, /smartCubeReplayControlsApi\?\.setRate/);
});

test("smart-cube tape capture stays dev-only and records both manager streams", () => {
  assert.match(viewportComponent, /data-smart-cube-capture/);
  assert.match(client, /createSmartCubeTapeRecorder/);
  assert.match(client, /smartCubeTapeRecorder\?\.recordEvent\(event\)/);
  assert.match(client, /smartCubeTapeRecorder\?\.recordCommand\(command\)/);
  assert.match(client, /tape\.timeline\.filter\(\(entry\) => entry\.kind === "input"\)/);
  assert.match(client, /Capture contained no input packets/);
  assert.match(client, /replayTapeStorageKey\(name\)/);
  assert.match(client, /anchor\.download = `\$\{name\}\.json`/);
  assert.match(client, /smartCubeCapture\.hidden = !smartCubeDevEnabled/);
});

test("the mock-device route reuses index mode and stays outside the app shell", () => {
  assert.match(mockPage, /<Index[\s\S]*initialMock=\{true\}[\s\S]*initialPlayer=\{true\}/);
  assert.match(page, /initialMock\?: boolean/);
  assert.match(page, /name="robots" content="noindex"/);
  assert.match(page, /data-mock=/);
  assert.match(viewportComponent, /data-smart-cube-qa-panel/);
  assert.match(viewportComponent, /data-smart-cube-tape-picker/);
  assert.match(viewportComponent, /data-smart-cube-import-session/);
  assert.match(client, /data-smart-cube-import-session-file/);
  assert.match(client, /JSON\.parse\(await file\.text\(\)\)/);
  assert.match(client, /smartCubeChooseSession\.addEventListener\("click"[\s\S]*if \(!smartCubeManager\)[\s\S]*smartCubeConnect\.click\(\)/);
  assert.match(styles, /\[data-mock="true"\] \.viewport-panel[\s\S]*grid-template-columns: clamp\(20rem, 27vw, 27rem\) minmax\(0, 1fr\)/);
  assert.match(styles, /\[data-mock="true"\] \.viewport-stage[\s\S]*grid-column: 2/);
  assert.match(styles, /\[data-mock="true"\] \.smart-cube-qa-panel[\s\S]*grid-column: 1/);
  assert.match(styles, /\[data-mock="true"\] \.smart-cube-dock[\s\S]*grid-column: 1/);
  assert.match(styles, /\[data-mock="true"\] \.viewport-header,[\s\S]*\.playback,[\s\S]*display: none/);
  assert.match(client, /createMockDeviceManager/);
  assert.match(client, /smartCubeMockMode/);
  assert.doesNotMatch(serviceWorker, /\/dev\/mock/);
  assert.match(client, /let selected = false;[\s\S]*const cancel = \(\) => \{[\s\S]*if \(!selected\)[\s\S]*Mock tape selection cancelled/);
});

test("the viewport compacts within a narrow studio column", () => {
  assert.match(styles, /\.viewport-panel[\s\S]*container-type: inline-size/);
  assert.match(styles, /\.smart-cube-dock[\s\S]*flex-wrap: wrap/);
  assert.match(styles, /@container \(max-width: 36rem\)[\s\S]*\.smart-cube-dock[\s\S]*flex-wrap: wrap/);
  assert.match(styles, /@container \(max-width: 36rem\)[\s\S]*\.playback-controls[\s\S]*flex-direction: column/);
  assert.match(styles, /\.playback-options \.segmented-control[\s\S]*flex-wrap: wrap/);
});

test("the viewport exposes a persistent opt-out for single-move turn guides", () => {
  assert.match(viewportComponent, /data-turn-guides/);
  assert.match(client, /store\.patch\(\{turnGuides: !turnGuides\}\)/);
  assert.match(store, /params\.get\("guides"\) !== "off"/);
  assert.match(store, /params\.set\("guides", "off"\)/);
  assert.match(client, /turnGuides && activeTurnGuide \? activeTurnGuide : null/);
  assert.doesNotMatch(client, /turnGuidesChanged && !turnGuides\) clearTurnGuide/);
});

test("an enabled turn-guide toggle retains the next playable tape move at rest", () => {
  assert.match(client, /const restoreIdleTurnGuide = \(\) =>/);
  assert.match(client, /for \(let index = activeIndex; index < activeTimeline\.steps\.length; index\+\+\)/);
  assert.match(client, /restoreIdleTurnGuide\(\);/);
  assert.match(client, /if \(turnGuides && !activeTurnGuide\) restoreIdleTurnGuide\(\)/);
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
  assert.match(viewport, /drawMotionOverlay\(\s*width,\s*height,\s*matrices,\s*glyphMatrices,/);
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
  assert.equal(viewportComponent.match(/class="transport-btn/g)?.length, 9);
  assert.doesNotMatch(viewportComponent, /data-playback-(?:toggle|sequence-back|sequence-forward)/);
  assert.match(viewportComponent, /data-playback-scrubber/);
  assert.match(viewportComponent, /data-playback-speed/);
  assert.match(viewportComponent, /\[0\.2, 0\.5, 1, 2, 5, 10\]/);
  assert.match(client, /const duration = 720/);
  assert.match(viewportComponent, /data-playback-loop/);
  assert.match(viewportComponent, /data-playback-record/);
  assert.match(viewportComponent, /data-playback-guide/);
  assert.match(viewportComponent, /Guide turns with smart cube/);
  assert.match(viewportComponent, /Start smart-cube recording/);
  assert.match(viewportComponent, /data-smart-cube-record-capability/);
  assert.match(client, /MAX_PLAYBACK_STEPS/);
  assert.match(client, /transitionTo/);
  assert.match(client, /case "ArrowLeft"/);
  assert.match(client, /case "ArrowRight"/);
  assert.match(client, /event\.key\.toLowerCase\(\) === "c"/);
  assert.match(viewportComponent, /data-shortcuts-dialog/);
  assert.match(viewportComponent, /data-shortcuts-help/);
  assert.match(client, /queueDirectMove/);
  assert.match(client, /pendingDirectMove/);
  assert.match(client, /let smartCubeRecording = false/);
  assert.match(client, /let smartCubeGuidedTape = false/);
  assert.match(client, /const canGuideSmartCube = \(\) =>/);
  assert.match(client, /activeTimeline !== null\s*&&\s*activeTimeline\.states !== null/);
  assert.match(client, /size === 2 \|\| size === 3/);
  assert.match(client, /const updateSmartCubeGuideUi = \(\) =>/);
  assert.match(client, /let smartCubeRecordingTapeDirty = false/);
  assert.match(client, /let smartCubeRecordingState: CubeState \| null = null/);
  assert.match(client, /let smartCubeRecordingTapePresented = false/);
  assert.match(
    client,
    /smartCubeOrientationTracking\s*&& !smartCubeRecording\s*&& !smartCubeRecordingTapePresented/,
  );
  assert.match(client, /record\.source === "regrip-core"/);
  assert.match(client, /appendSmartCubeRecordingToken\(tapeMove\)/);
  assert.match(client, /const advanceSmartCubeRecordingState = \(token: string\)/);
  assert.match(client, /const animateSmartCubeRecordingToken = \(token: string\): Promise<void>/);
  assert.match(client, /await animateSmartCubeRecordingToken\(tapeMove\)/);
  assert.match(client, /MoveExecutor\.applyStep\(smartCubeRecordingState, step\)/);
  assert.match(client, /Virtual regrip \$\{event\.notationToken\}/);
  assert.match(client, /event\.source !== "regrip-core"/);
  assert.match(client, /Record · verified \+ gyro/);
  const recordingBranch = client.indexOf("if (smartCubeRecording) {", client.indexOf("const applySmartCubeMove"));
  const recordingStopPlayback = client.indexOf("stopPlayback();", recordingBranch);
  assert.ok(recordingBranch >= 0 && client.indexOf("return;", recordingBranch) < recordingStopPlayback);
  assert.ok(
    client.indexOf("advanceSmartCubeRecordingState(move);", recordingBranch) < recordingStopPlayback,
    "recording advances the tape-owned virtual state before leaving the physical-move path",
  );
  const playHandler = client.indexOf("playbackPlay.addEventListener");
  const playHandlerEnd = client.indexOf("root.querySelector<HTMLButtonElement>(\"[data-playback-forward]\")", playHandler);
  const playForward = client.indexOf("else void play(1);", playHandler);
  assert.ok(playHandler >= 0 && playHandlerEnd > playHandler && playForward < playHandlerEnd);
  assert.equal(
    client.slice(playHandler, playHandlerEnd).indexOf("waitForSmartCubeMove();"),
    -1,
    "ordinary Play never becomes smart-cube guidance merely because a cube is connected",
  );
  assert.match(client, /playbackGuide\.addEventListener\("click"/);
  assert.match(client, /smartCubeGuidedTape = true;\s*waitForSmartCubeMove\(\)/);
  assert.match(viewportComponent, /data-coaching-mode="coached"/);
  assert.match(viewportComponent, /data-coaching-mode="continuous"/);
  assert.match(page, /data-alg-transform="filter-regrips"/);
  assert.match(client, /MoveTransform\.filterRegrips\(alg\)/);
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
