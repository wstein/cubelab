import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
const client = await readFile(new URL("../src/client/converter.ts", import.meta.url), "utf8");
const viewport = await readFile(new URL("../src/client/cube-gl.ts", import.meta.url), "utf8");
const viewportComponent = await readFile(
  new URL("../src/Components/CubeViewport.astro", import.meta.url),
  "utf8",
);

test("the static shell declares size-scoped cubie and Orbit64 cards", () => {
  assert.match(page, /key: "pieces"[\s\S]*sizes: "2,3"/);
  assert.match(page, /key: "orbit64"[\s\S]*sizes: "3"/);
  assert.match(page, /data-output-card=\{key\}/);
});

test("the Vanilla DOM client wires reachability-aware outputs", () => {
  assert.match(client, /PieceReducer\.reduce\(state\)/);
  assert.match(client, /PieceReducer\.parseState\(size, compact\)/);
  assert.match(client, /PieceReducer\.render\(pieces\._0\)/);
  assert.match(client, /Orbit64Codec\.encode\(pieces\._0\)/);
  assert.match(client, /Orbit64Codec\.decodeState\(compact\)/);
  assert.match(client, /const net = inputValue\.trimEnd\(\)/);
  assert.match(client, /card\.hidden =/);
  assert.match(client, /copy\.disabled = !copyable/);
});

test("the web UI exposes an explicit lowercase mode without heuristic switching", () => {
  assert.match(page, /data-lowercase-mode="Wide"/);
  assert.match(page, /data-lowercase-mode="InnerSlice"/);
  assert.match(page, /data-lowercase-banner/);
  assert.match(page, /modern SiGN wide turns by default/);
  assert.match(client, /evaluateAlgorithm/);
  assert.match(client, /Mixed Rw and r notation detected/);
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
});

test("the web UI exposes a state-verified 3x3 NISS helper", () => {
  assert.match(page, /data-niss-panel/);
  assert.match(page, /data-niss-normal/);
  assert.match(page, /data-niss-inverse-moves/);
  assert.match(page, /data-niss-verify/);
  assert.match(page, /N · I⁻¹/);
  assert.match(client, /MoveNiss\.invertScramble/);
  assert.match(client, /MoveNiss\.verify/);
  assert.match(client, /MoveNiss\.describeError/);
});

test("the SPA workspace keeps one viewport beside three URL-addressable views", () => {
  assert.match(page, /data-workspace-tab="converter"/);
  assert.match(page, /data-workspace-tab="beginner"/);
  assert.match(page, /data-workspace-tab="workbench"/);
  assert.equal((page.match(/<CubeViewport \/>/g) ?? []).length, 1);
  assert.match(page, /data-beginner-solve/);
  assert.match(page, /data-beginner-phases/);
  assert.match(page, /data-beginner-copy/);
  assert.match(client, /BeginnerSolver\.solve/);
  assert.match(client, /buildTimeline\(initialState, solution\.alg\)/);
  assert.match(client, /store\.patch\(\{activeTab:/);
});

test("practice scramble is a Quick load action rather than a transform", () => {
  assert.match(page, /class="preset-chip practice"[\s\S]*data-practice-scramble/);
  assert.doesNotMatch(page, /class="transform-btn practice"/);
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

test("the viewport animates complete cubies with shader layer transforms", () => {
  assert.match(viewport, /attribute vec3 aCubie/);
  assert.match(viewport, /rotateAround/);
  assert.match(viewport, /export const turnTransform/);
  assert.match(viewport, /animateTurn/);
  assert.match(viewport, /1 - \(1 - progress\) \*\* 3/);
});

test("the viewport exposes bounded tape controls for exact algorithm states", () => {
  assert.match(viewportComponent, /data-playback-toggle/);
  assert.match(viewportComponent, /data-playback-scrubber/);
  assert.match(viewportComponent, /data-playback-speed/);
  assert.match(viewportComponent, /data-playback-loop/);
  assert.match(client, /MAX_PLAYBACK_STEPS/);
  assert.match(client, /transitionTo/);
});
