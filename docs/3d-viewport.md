# Interactive 3D Viewport

CubeLab's viewport is currently a zero-framework WebGL view of the same canonical
`cubeState` used by every codec. Rendering never reparses notation and cannot
alter the converted state.

The planned Three.js backend migration is staged to preserve this viewport contract and behavior;
see [the renderer migration plan](three-renderer-migration.md).

## Geometry contract

`CubeGeometry.generate` accepts a validated 2×2 through 5×5 state, a surface
style, and a display palette. It returns a deterministic interleaved mesh with
fourteen floats per vertex:

```text
position.xyz, normal.xyz, colour.rgba, cubieCentre.xyz, rollSheen
```

`cubieCentre` is constant across every triangle belonging to one physical piece.
The vertex shader uses that coordinate to select complete cubies for an animated
layer, avoiding the edge-vertex misclassification that coordinate-only clipping
would cause.

The two styles are intentionally different physical models:

- **Standard** builds subtly beveled charcoal cubie bodies and places 84%-width,
  rounded mid-gloss vinyl-coloured tiles just above exposed faces. The restrained
  clearcoat retains a polished finish without mirror-bright highlights obscuring colour.
- **Speed** builds stickerless pieces from one continuous rounded cap and three
  smoothly-normaled roll bands per exposed face. The band reaches the full piece
  boundary, so adjacent coloured faces meet without disconnected corner fans or
  punctures. A per-vertex sheen value gives the rolled plastic a satin highlight.

The shared material is lit as a compact product studio: a warm upper-left key defines
form, a cooler front-right fill keeps every sticker colour readable, and a low-intensity
rim light separates the silhouette from the dark canvas. Standard stickers retain a
restrained mid-gloss softbox reflection rather than a mirror-like highlight.

Every cube has the same world-space half-extent. Increasing the puzzle size therefore
adds smaller pieces instead of making the rendered object larger.

Western and Japanese palettes are represented directly. Custom output symbols
do not encode RGB meaning, so custom schemes use the Western physical palette
in the viewport.

## Renderer lifecycle

The native WebGL renderer uploads the mesh to one interleaved vertex buffer.
Capacity covers the selected size's largest supported mesh and grows if a future geometry
variant needs more room. Both styles draw through the same opaque WebGL path.

Rendering is scheduled only after a state, style, camera, visibility, size, or visual
guide change. There is no perpetual animation loop by default. The **Auto orbit** toggle
deliberately starts a slow camera loop; disabling it restores zero idle rendering. When
smart-cube orientation tracking is active, auto orbit is disabled and suppressed to ensure
the physical device solely drives the object orientation.
An `IntersectionObserver` suspends both drawing and auto orbit while the viewport is
off screen, and the Page Visibility API does the same while the document is hidden.
Animation resumes without accumulating a large time delta. The backing canvas clamps
device pixel ratio to 2.

## Focused player mode

The **Full-size player** route (`/player`) reuses this same viewport rather than
creating a second renderer. Its canvas fills the window while the connection,
camera, style, and tape controls become translucent HUDs. The route link changes
to **Back to studio** in that mode. The default camera is framed farther from the
cube, and narrow viewports apply an additional aspect-ratio safety distance, so
the complete puzzle remains inside the frustum. Opening or leaving player mode
is an in-place layout transition: the active WebGL scene, move tape, workers,
and Bluetooth connection remain live. Browser history and Escape return to the
originating workspace; refreshing `/player` reconstructs the selected workspace
and source state from the URL hash.

Logical face, range, slice, and whole-cube moves map to a shader axis, a cubie-centre
selection interval, and a signed target angle. During a transition, Rodrigues'
rotation is applied to both position and normal for selected cubies. The easing curve
is cubic ease-out; completing an animation clears the temporary transform so the
caller can upload the committed canonical state. Cancelling, replacing, or disposing
the viewport also clears pending animation frames.

Pointer drag changes the orbit camera, the wheel controls distance, and Reset view
turns off Auto orbit before restoring the documented isometric view. Auto orbit pauses its camera movement while
the user is dragging and remains active across workspace tab changes. Academy phase
changes can request a bounded smooth camera orbit; manual playback cancellation or Reset
view cancels that interpolation. WebGL initialization and context-loss
failures are reported to the surrounding interface without affecting any text
codec.

## Application integration

One observable application state contains the selected size, raw input, colour
scheme, lowercase interpretation, numbered-layer dialect, and cube style. Store notifications are coalesced into
one `requestAnimationFrame`, so text cards and the viewport update from the same
parse result during the next browser paint.

The input badge reports the successful branch of the deterministic parser cascade:
algorithm, Orbit64, cubie coordinates, SSE cubie-state cycles, Singmaster piece cycles, compact facelets, compact colours, facelet
net, or colour net. Invalid input leaves the last valid 3D state visible and marks
the input status as invalid.

For algorithm input, the client expands composite AST nodes into a canonical step
timeline, retains internal pauses as state-neutral steps, and caches state 0
through state N. The viewport uses a five-button studio deck: previous sequence, animated
previous move, a prominent play/pause toggle, animated next move, and next sequence. The
range scrubber provides arbitrary start/end seeking; playback also provides 0.5×/1×/2×
speeds, looping, and clickable move or
pause tokens. Clicking an adjacent move animates it at the selected speed. Clicking
farther within the current bordered algorithm sequence animates every intervening move at
twice the selected speed. A click across sequence boundaries time-travels to the canonical
state immediately before the selected move, then animates that move at the selected speed.
Text codecs update only when a move commits, so
they always describe an exact canonical state rather than a fractional animation.

The viewport is mounted once beside the Converter, Beginner Academy, CFOP Academy, and
Alg Workbench panels. Client-side tab changes only toggle the left-hand view, preserving the WebGL
context, camera, geometry buffers, and current tape position.

Duration annotations such as `@1.3s` are distinct state-neutral timeline steps. The
ribbon does not render pause tokens or editor syntax. Academy-generated 0.5-second
inter-sequence delays are visually compact with no gap, while 1.2-second phase boundaries
use a wider gap; a user-authored dot pause retains a small semantic gap and short default
wait.

The position indicator counts only physical face, wide, inner-layer, and slice turns.
State-neutral pauses and whole-cube `x`, `y`, or `z` regrips remain playable timeline
events but never increment either the current move number or the total.
Parenthesized AST groups are retained during expansion and displayed as bordered move
clusters, including a distinct cluster for every repetition. In both Academy views,
hovering or focusing a cluster highlights its complete token group and derives the
phase-relevant physical edge or corner from its before/after states. A projected Canvas2D
HUD draws a moving dashed trajectory between camera-selected sticker-surface anchors and
projects cyan source and amber target outlines around their visible cubie faces. Focus
never modifies the WebGL sticker material, so original colours and opacity remain readable
in both cube styles. The HUD applies the same layer transform as the shader, keeping its
anchors and outlines attached during the 4° move preview. Layer membership is determined
once from the owning cubie centre—matching the shader—so every projected frame corner
moves as one rigid sticker outline rather than drifting at an outer layer boundary.
Hovering an individual
move projects a single elegant, solid tapered direction arrow elevated cleanly above the primary front-facing
layer face with an integrated aerodynamic barbed arrowhead (matching the design language of whole-cube curved
arrows) and a persistent 100% width Move Sequence Ribbon at the top of the 3D viewport. The guide arrow hovers
stationary in fixed space as the cube row rotates beneath it rather than spinning with the animated slice.
The endless ribbon spans edge-to-edge across the entire viewport width, displaying past moves to the left,
the prominent glowing active move pill in the center (clean text notation without icons, including amber "Undo"
recovery cues seamlessly embedded in the ribbon), and upcoming moves filling the full available canvas width to
the right with smooth edge fades. Whole-cube `x`, `y`, and `z` rotations suppress single-layer face arrows and
project an elevated sweeping tapered front-facing arc arrow indicating the whole-cube rotation. Active
pieces and the currently turning layer remain at full material brightness; unrelated
layers receive only a soft saturation and brightness reduction. Hidden destinations dim
the guide and request that the user orbit to the back. The group's pedagogical purpose
remains its accessible label rather than a floating tooltip.

Hovering or keyboard-focusing an individual move temporarily uploads the cached canonical
state immediately before that timeline entry, then displaces the affected layer by exactly
4° in the move's direction without changing the camera. Leaving the token restores the
player's current canonical state; text codecs never change during this non-destructive
preview.

The **Turn guides** viewport toggle controls only the circular single-move arrow and its
angle/direction badge. It is enabled by default; opting out removes an active arrow and
suppresses later arrows without disabling the exact pre-move state, 4° layer cue, camera
reframe, source/target trajectory, piece highlighting, milestone pulses, or coached phase
previews. The setting is shareable URL state (`guides=off`).

Single-move stepping skips all intervening pause nodes immediately. Sequence-back and
sequence-forward animate exactly one bordered group at the selected speed, also without
waiting on pauses. They stop on a cached canonical state, highlight the next sequence, and
reframe the camera around that sequence's source and target cubies. Camera reframing is a
sequence-purpose behavior and is never triggered by an individual move preview.

Outside editable controls, `Space` toggles playback, `←`/`→` step one physical move,
`Shift+←`/`Shift+→` and `[`/`]` step one sequence, and `R` resets the camera while stopping
auto orbit. The buttons expose the same bindings through `aria-keyshortcuts` and titles.

Academy playback defaults to **Coached** mode. At a phase boundary it uses the existing
state-neutral pause as a three-part transition: a 350 ms emerald pulse over the verified
milestone cubies, a 450 ms eased camera reframe, and a 400 ms next-piece trajectory.
Durations scale with the selected playback speed. Step 7 uses a final all-cubie success
pulse. **Continuous** mode skips generated Academy pauses and these coaching transitions.
The HUD canvas is visual-only; milestone and next-step messages are mirrored to an
`aria-live` status node.

Playback caches at most 500 expanded steps. Algorithms above that limit still execute
through the normal 100,000-step safety boundary and display their final conversion,
but do not retain hundreds of intermediate cube states. When editing at the current
end of a timeline, appending exactly one expanded move animates that move; pastes and
multi-step changes render the final state immediately.

Shareable continuous settings are written to the URL hash after 300 milliseconds
without adding browser-history entries. Workspace and Academy-method navigation
instead creates a browser-history entry. Hash input is validated, and imported
text is limited to 20,000 characters before it reaches the parser.

## Snapshot export

The viewport can copy a PNG snapshot to the clipboard (or download it when the
clipboard API is unavailable) from its **Snapshot** control or `Ctrl/Cmd+Shift+S`.
Capture forces a draw and reads the canvas synchronously in the same JavaScript
execution period, so the normal WebGL context keeps `preserveDrawingBuffer` off
and retains its ordinary rendering performance.

## Cube motion and camera motion

Mouse orbit changes only the observer's view. In contrast, notation rotations `x`, `y`, and `z`
are execution turns: the WebGL turn transform rotates all cubies, preserves the changed cube frame
for following moves, and exposes the same direction guide used by face and slice turns.

The timeline displays both execution effort and puzzle-state scoring. ETM includes every expanded
turn, including `x/y/z`; HTM excludes whole-cube reorientations. Half turns still count as one in
both metrics.

## Smart-cube live orientation

When a physical smart cube (e.g. GoCube, GAN) with IMU hardware is connected, telemetry stream quaternions drive the WebGL object orientation in real time:

- **World Delta Pipeline:** The relative orientation delta between baseline and current pose is computed directly in raw $\mathrm{SO}(3)$ space (`current * base.conjugate()`), ensuring mathematical invariance regardless of the cube's resting pose.
- **Direction Alignment & Basis Mapping:** For hardware sensors that rotate against the hand (such as GoCube), the rotation direction is inverted and re-expressed in canonical viewport axes (using the measured $180^\circ$ $Y$-yaw change of basis `basis = -x, +y, -z`).
- **Orientation marker:** the compact x/y/z overlay advances only with accepted virtual x/y/z regrips, never with raw in-between gyro motion. Its geometry and colours are remapped together, so each positive axis shows the centre colour currently assigned to that virtual direction.
- **Threshold settling:** after a 65° regrip confirmation, the viewport holds the accepted cardinal pose through the remaining physical quarter-turn. The trigger sample therefore cannot leave a 20–40° display residual.
- **Facelet Alignment:** Top White ($+Y$), Right Red ($+X$), and Front Green ($+Z$) remain 1:1 aligned during physical turns and whole-cube regrips across 0°, 90°, 180°, and 270°.

In normal **physical mirror** mode, reported facelets also determine the displayed cube
state. **Controller mode** deliberately separates those concerns: the gyro still controls the
camera, but a selected practice/timer scramble or Academy drill owns the virtual state. Physical
facelet reports are ignored until the user returns to physical mirroring, so an old device state
cannot repaint an instant virtual scramble. When a coached move tape is active, controller
packets advance the tape on a correct turn using their fixed hardware face indices.

## Provenance and licensing

The physical design vocabulary was informed by the Standard and Speed looks in
the separate `flix-cube` project. Cube Rosetta is AGPL-3.0-or-later; this module
is an independent implementation of the underlying
geometric ideas and does not copy or translate its source code.
