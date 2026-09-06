# Three.js renderer migration plan

## Goal

Replace CubeLab's hand-written WebGL draw backend with a Three.js-backed implementation
without changing the observable `CubeViewport` behavior used by the converter, player,
Academy, timer, or smart-cube controller. This is a rendering-backend migration, not a
visual redesign: Standard and Speed styles, the Canvas2D teaching overlay, motion, capture,
camera controls, and low-idle-rendering policy must remain equivalent.

Three.js still renders through WebGL (or a supported future backend); the migration removes
application-owned shader compilation, buffer allocation, and renderer lifecycle code. It does
not remove the browser's WebGL requirement.

## Current boundary

`src/client/cube-gl.ts` currently combines three distinct responsibilities:

1. Shared domain math and public types: camera, turn transforms, quaternion/orientation math,
   PNG conversion, and the `CubeViewport` interface.
2. The native WebGL renderer: shader sources, program/buffer management, mesh uploads, and
   render scheduling.
3. Viewport interaction and lifecycle: pointer orbit/inertia, auto orbit, resize and visibility
   handling, snapshots, dialog occlusion, and disposal.

`src/client/converter.ts` depends only on the public `CubeViewport` interface. The Canvas2D
`motion-overlay` also depends on the same camera and turn math. This is the seam to preserve.

## Non-negotiable compatibility contract

The Three backend must implement every existing method before it can become the default:

```text
setScene, setState, setStyle
animateTurn, cancelTurn, setTurnPreview
setFocus, setMilestone, setTurnGuide, setMoveRibbon, setOrientationDebugVectors
smoothOrbitTo, setDeviceOrientation, recenterDeviceOrientation,
reconcileDeviceOrientation
setAutoOrbit, setDialogOpen, resetCamera, refresh, capturePng, dispose
```

It must also preserve canvas data attributes consumed by browser tests and UI state:
`data-webgl`, `data-animating`, `data-turn-preview-degrees`, `data-auto-orbit-state`,
focus attributes, and device-orientation state.

## Phased delivery

### 0. Establish parity baselines

- Add deterministic screenshots for solved and scrambled 2×2 through 5×5 cubes in Standard
  and Speed styles, plus a turn-preview and an active turn frame.
- Add browser coverage for camera drag/wheel, auto-orbit pause/resume, PNG capture, context
  fallback, and smart-cube orientation state. Keep existing math tests unchanged.
- Define visual tolerance per screenshot and measure first-render and state-update timing.

**Exit:** baseline tests run reliably against the native renderer; no production behavior changes.

### 1. Extract the renderer-neutral contract

- Move `CubeViewport` types, turn/camera/quaternion utilities, and `CubeGeometry` data adapters
  into renderer-neutral modules. Keep their current exports as temporary re-exports so smart-cube
  and overlay imports do not churn.
- Isolate native WebGL code behind `createNativeCubeViewport` while preserving
  `createCubeViewport` as the current factory.
- Keep the Canvas2D overlay renderer-neutral: it receives current camera matrices and turn
  transforms rather than accessing native WebGL state.

**Exit:** native output is pixel-equivalent and all current unit/browser tests pass after the
file split.

### 2. Add Three.js as an optional backend

- Add a pinned `three` dependency and a narrow `createThreeCubeViewport` implementation. Do not
  expose Three.js objects outside that module.
- Use the existing `<canvas>` and Canvas2D overlay canvas; there must remain one mounted
  viewport and no duplicate input handlers.
- Convert CubeGeometry's fourteen-float interleaved mesh into `BufferGeometry` attributes:
  `position`, `normal`, `color`, `cubieCentre`, and `rollSheen`.
- Port the current vertex and fragment lighting logic into `ShaderMaterial`. Built-in Three
  materials are not sufficient: layer turns, per-cubie focus/milestone selection, and the two
  established surface finishes require the existing custom attributes and uniforms.
- Use a single opaque mesh and the existing state-triggered render scheduling; do not introduce
  Three's continuous animation loop.

**Exit:** an internal backend selector can render equivalent static 2×2–5×5 states with no
converter changes.

### 3. Port motion, camera, and overlay projection

- Map the existing yaw/pitch/distance camera model to `PerspectiveCamera`; retain the documented
  defaults, drag inertia, clamping, wheel limits, safe player framing, and smooth-orbit tween.
- Implement layer turns in the shader using the existing axis/range/angle uniform model. This
  preserves rigid cubie membership for wide turns and avoids splitting a cubie at a clipping
  boundary.
- Compose smart-cube quaternions at the scene-root level while preserving current coordinate-frame
  conversion and correction smoothing.
- Feed the Canvas2D overlay the Three camera's projection and inverse-world matrices (or a tested
  renderer-neutral matrix adapter), so focus outlines, trajectory anchors, and guide arrows remain
  attached during a turn preview.

**Exit:** turn preview, animated turns, focus/milestone highlighting, guides/ribbon, gyro tracking,
and Academy reframing pass parity tests.

### 4. Shadow rollout and default switch

- Add a development-only `renderer=native|three` URL selector. Default remains native initially;
  production share links never persist this implementation detail.
- Run the same browser suite and screenshot matrix for both backends. Compare output, context-loss
  fallback, idle rendering, memory after size/style changes, and snapshot export.
- Make Three the default only after parity and performance acceptance are met. Retain native as a
  short-lived fallback for one release cycle.

**Exit:** Three is default; native remains selectable only for regression triage.

### 5. Remove the native backend

- Delete the native factory, shader compiler, raw buffer management, and selector after the
  fallback window closes.
- Rename renderer-neutral files where useful, update viewport documentation from “native WebGL” to
  “Three.js/WebGL renderer,” and remove obsolete test branches.

**Exit:** one maintained rendering backend, unchanged public viewport contract, complete docs.

## Acceptance matrix

| Area | Required proof |
| --- | --- |
| Visuals | Screenshot parity for 2×2–5×5, both styles/palettes, focus/milestone/guide states |
| Motion | Exact final facelets after face, slice, wide, and `x/y/z` turns; preview stays non-destructive |
| Interaction | Pointer orbit/inertia, wheel zoom, reset, auto-orbit, player layout transition |
| Smart cube | Orientation coordinate frames, smoothing, recenter/reconcile, controller-mode separation |
| Lifecycle | Resize, intersection/document visibility pause, dialogs, context loss, disposal |
| Export | PNG snapshot works without persistent drawing buffer or network fetch |
| Performance | No idle render loop; bounded GPU memory across repeated size/style/state changes |

## Risks and mitigations

- **Visual drift:** retain the custom shader rather than approximating with `MeshStandardMaterial`;
  use the screenshot baseline from phase 0.
- **Overlay mismatch:** port projection through a tested matrix adapter before switching default.
- **Bundle growth:** measure the Three chunk separately and load it only when the viewport mounts;
  avoid optional Three examples/add-ons.
- **Lifecycle regressions:** retain the current interface and data attributes, then test both
  backends through the same browser scenarios.
- **Scope creep:** do not redesign geometry, colours, controls, or smart-cube behavior during the
  backend migration.

## First implementation slice

Phase 1 is the next safe code change: extract the renderer-neutral `CubeViewport` contract and
math without adding Three.js. It is independently reviewable, has no runtime dependency change,
and creates the boundary needed for a parallel backend.
