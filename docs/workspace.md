# Shared workspace and routes

CubeLab uses four client-side workspace views over one canonical state:

- **Converter** presents the six size-aware state formats and copy controls.
- **2×2 Beginner / Ortega Academy** generates a replay-verified First layer → OLL → PBL route; it accepts monochrome solved orientations because a 2×2 has no fixed centres.
- **2×2 Petrus-inspired Academy** selects one equivalent white-first teaching frame from the setup, locks it for the lesson, then replay-verifies First square/block → Back pair → Finish. It deliberately describes corner relations rather than claiming a 2×2 has edge cubies or canonical Petrus steps.
- **Beginner Academy** generates and explains a seven-phase 3×3 LBL tutorial.
- **CFOP Academy** teaches a replay-verified Cross, four recognized and locked F2L pairs,
  two-look OLL, and two-look PLL path.
- **Alg Workbench** contains transformations and the state-verified NISS helper.
- **Pattern Catalog** browses and loads the 230-record attributed pattern library,
  filters to proven mathematical antipodes, and surfaces live pattern recognition
  against the current cube state.

All layer-based Academy lessons use **white as the bottom first layer** and
**yellow as the top last layer**. Reduction lessons retain their separate
centre-and-wing workflow, then hand off to that same white-bottom 3×3 finish.

The tabs are visibility controls over one persistent `CubeViewport`, so switching views
does not recreate the WebGL context, mesh buffers, camera, or tape player. They also have
static entry routes: `/` (Converter), `/academy`, `/workbench`, `/patterns`, and `/timer`.
The pathname selects the workspace; the URL hash carries the shareable cube state and
settings. Legacy root links using `#tab=…` continue to select a workspace, but a clean
pathname wins if the two conflict.

Workspace and Academy-method selections create browser history entries. Continuous edits
to setup, moves, and settings are debounced and replace the current URL instead, so Back
and Forward move between destinations without producing an entry for every keystroke.

## Offline installation

Production builds register a small progressive-web-app shell. Once CubeLab has been opened
online, it can be installed from a browser that supports PWAs and its static workspace routes
remain available offline. The service worker caches only same-origin application assets and
never proxies Bluetooth, TNoodle, or other network requests; smart-cube connections and local
TNoodle checks still require their normal browser and network permissions.

## Shared-state behavior

The puzzle size, notation settings, setup, moves, recognized cube state, viewport style, and
turn-guide preference remain shareable URL state. The playback timeline remains shared
in memory. Tab-only state changes do not reparse the input or reset
playback. Editing the source or changing a conversion setting intentionally rebuilds the
recognized state and clears any generated tutorial.

An optional **Note** next to the Setup and Moves editor is also included in a shared link.
It is deliberately limited to 200 characters: enough to label a case, solve, or coaching
exercise without turning URL sharing into document storage. Device-only preferences and
timer-session data do not enter the URL.

Beginner solutions use `buildTimeline(initialState, solutionAlg)`, so playback begins at
the user's recognized scramble rather than incorrectly applying the solution to a solved
cube. Phase buttons seek within that same timeline. The displayed/copyable tutorial uses
line comments, while structured phase metadata remains separate from notation parsing.
Move hover reads the exact cached pre-move state without changing the shared tape index or
converted outputs; leaving hover restores the indexed state and camera.
Timeline token clicks animate adjacent moves normally, traverse a shared algorithm group
at 2× the selected speed, or jump across distant groups to the selected move's immediate
pre-state before animating that final move.
Transport single-step controls skip state-neutral pauses, while the dedicated sequence
controls animate one complete parenthesized group forward or backward. A sequence stop
keeps its exact canonical state and reframes the persistent viewport for the next
sequence-purpose visualization.

Practice scramble is located in **Quick load**, not among algebraic transformations. On
2×2 it uniformly samples one of the 3,674,160 canonical states, then renders a
replay-verified inverse scramble. The drill selector offers **Any**, exactly **3 HTM**,
exactly **4 HTM**, and **5+ HTM** optimal distance; 5+ is the default. Other sizes retain
a random-turn practice sequence. Neither is labeled as an official WCA scramble.

## Setup and moves

The editor separates **Setup (state)** from optional **Moves**. Setup accepts compact
facelets, compact colours, canonical nets, cubie coordinates,
Orbit64 state tokens for 2×2 through 5×5, SSE corner-cycle cubie-state cycles, Singmaster permutation cycles, ACube
positional states, or an algorithm. The 2×2/3×3 cards offer SSE and reversible Singmaster
permutation cycles; the 3×3 cards also offer unfolded ACube positional spellings.
Every listed format is
directly pasteable into Setup.
The Setup header also offers a one-click **Copy as compact facelets** action for the recognised
state, alongside an Orbit64 copy action at every supported size. Orbit64 uses the Flix
mixed-radix piece coordinates: corners on 2×2, corners/midges on 3×3, wings and centres
on 4×4, and both centre orbits on 5×5. The state widths are 5, 12, 27, and 43 Base64URL
characters. Odd-cube tokens also preserve their 24-way fixed-centre frame; impossible
sticker arrangements remain rejected rather than serialised.
Moves are parsed with the selected notation dialect and replayed from whatever Setup
resolves to. This includes Setup algorithms: CubeLab first evaluates the Setup algorithm to
its state, then places that state at tape position zero and replays only Moves. Thus the
viewport always shows the supplied Setup at the start of playback rather than a transient
solved cube. When Moves is empty, an algorithm entered in Setup is simply evaluated to its
resulting state for inspection.

For valid 3×3 Setup states, a centre-frame badge reports whether the six facelet blocks use
CubeLab's canonical U/R/F orientation. A valid rotated state can be explicitly rewritten with
**Canonicalise orientation**; this preserves its physical piece arrangement while replacing the
Setup text with canonical spaced facelets. The badge and action always describe Setup at tape
position zero; optional Moves do not affect them.

The Academy, optimal 2×2, and two-phase solvers always take their source position from **Setup** only.
Moves is a playback tape, so editing it never changes a solver request or invalidates an
already-returned solver candidate. Changing Setup resets that candidate and any optional
two-phase refinement search. The 2×2 control returns a shortest solution in the half-turn
metric; its compact worker table is downloaded only on first use.

For a 4×4×4 that has already been reduced—each 2×2 centre block is
monochrome and every visible wing pair is matched—**Finish reduced state**
hands the corresponding 3×3×3 position to the two-phase solver and lifts its
outer-layer result back to the original cube. The worker replay-verifies the
finish against the 4×4×4 and requires every face to be monochrome. This is a
reduction-stage finish, not a general 4×4×4 or move-optimal solver; centre,
wing-pairing, and parity stages remain separate work.

The 5×5×5 Reduction Academy currently begins before that handoff: its inspector reports
the six fixed-core 3×3 centres (with X- and +-centre orbits separately), then the 24
two-wing pairs around fixed middle edges. During the centre stage it may offer one bounded,
replay-verified inner-slice improvement. Its wing stage likewise offers only bounded,
centre-preserving slice–setup–restore cycles; the reduced 3×3 finish remains explicitly
locked until a dedicated 5×5 physical-state handoff is available.

## Manual state entry

The editor keeps its private draft, hover target, keyboard cursor, and dot-verification
generation in a small dependency-free signal layer. Derived values such as completion update
from those signals without adding a UI framework or coupling the draft to shareable Setup state.

For 2×2×2 through 5×5×5, **Enter state by hand** opens a draft-only sticker editor. It
starts blank for an empty Setup, or from a valid existing Setup. On 2×2×2, each blank
sticker shows only colours that have a complete reachable continuation, so every displayed
dot is selectable. On 3×3×3 through 5×5×5, a cheap local corner/edge and colour-quota
check paints dots immediately; full reachability verification corrects any optimistic dot
asynchronously. Verification debt is tracked per sticker across renders so that cancelled or
interrupted passes automatically requeue unverified stickers on subsequent passes without
repainting provisional values. In addition, routine chrome-only renders (palette clicks, eraser
activation, representation changes, or eyedropper double-clicks) preserve in-flight verification
passes rather than bumping the generation and discarding progress. When the worker proves a singleton
choice during verification, it promotes the sticker to reversible auto-fill directly in the current pass, updating
local constraint mates without restarting the verification chain from scratch. Big-cube piece orbit domains
similarly take remaining colour quotas into account, rejecting candidates that would exhaust a colour still
demanded by unplaced outer slots. If a dead draft is ever reached where a blank tile has no legal colours left,
the affected sticker is surfaced with a prominent red dashed outline, and the summary card displays an alert
with a one-click **Undo** button (also callable anywhere in the dialog via `Ctrl+Z` or `Cmd+Z`). A click is always gated by
that full check, and auto-fill candidates are
likewise verified before being written; on 4×4×4 and 5×5×5 it uses the same local propagation
instead of rechecking every blank sticker, except for a two-sticker exact endgame pass. The dots never change position: they are fixed as
**Up / Down**, **Right / Left**, and **Front / Back**; unavailable colours are dimmed. Clicking a specific dot
paints that colour directly, regardless of which palette swatch or tool is currently selected (even when the
**Eraser** tool is active). The palette includes an **Eraser** tool that displays an active cyan selection frame when
active. Holding **Shift** highlights the **Eraser** button and temporarily changes the text in each palette colour swatch
to **Reset**; shift-clicking any colour swatch resets all user-placed stickers of that colour across the net (preserving
fixed core centres) and recomputes auto-fills. Clicking or dragging over stickers while Eraser is selected erases them,
and shift-clicking any individual sticker erases it at any time. Double-clicking an already-filled sticker loads its colour into the palette without
changing the sticker; a plain click on a filled sticker with a colour selected otherwise does nothing, so it
cannot race and clobber that double-click — shift-click (or selecting Eraser) then click remains how to
correct one. The six fixed core-centre stickers on 3×3×3 and 5×5×5 define face
orientation; they are rendered a nuance darker with no hover or focus frame and are not
selectable (arrow keys skip them during keyboard navigation). The remaining 5×5×5 centre
stickers remain editable. Double-clicking a centre sticker similarly selects its colour
into the palette. Both click and key entry
automatically fill subsequently forced stickers, rendered slightly smaller with a cyan inset outline.
Auto-set stickers cannot be erased directly; erasing the user-placed sticker that forced them returns
them to dots. Auto-fill is recomputed from only the stickers entered by the user, so a sticker returns to its dots
whenever an edit makes more than one colour possible. **Reset**
intentionally leaves stickers blank so a completed draft can be corrected. CubeLab does not
alter Setup or the viewport until **Load** is enabled. On 2×2×2, 3×3×3, and 4×4×4 that requires a
complete, physically valid position. The 4×4×4 validator checks corner orientation and permutation,
all twenty-four wing-piece placements and orientations, and the four-centre inventory for each
colour; legitimate reduction-parity positions remain valid. Before either a 4×4×4 or 5×5×5
sticker is accepted, its colour dots preserve a feasible assignment of corner and edge-piece
identities (including the 5×5×5 wing and middle-edge orbits). The 5×5×5 editor additionally
enforces complete exact colour quotas and its fixed core centres, but does not claim full
big-cube reachability validation.
Hovering an outer corner or edge-wing sticker frames its matching stickers across both
representations, while independent centre stickers deliberately have no false piece frame.

The editor's **Edit with notation** field uses the same parser as **Setup**, one non-empty line
at a time. A supported state-notation line replaces the private draft; an algorithm, move
sequence, or cube-transformation line applies to the current complete, physically valid draft.
Unrecognized prose is treated as a comment, so an annotated script can put an Orbit64 or other
state on one line and later moves or transformations on subsequent lines. This combines sticker
editing with facelets, colour notation, nets, cubie-state formats, and the configured move dialect
without changing shareable Setup until **Load** is selected.

The net also accepts keyboard entry: arrow keys move a focus cursor between stickers,
wrapping across a 3×3's face boundaries so the cursor keeps moving in the same visual
direction rather than stopping at an edge (2×2 has no such wrap and stops there); U, R, F,
D, L, or B paints the focused sticker directly; E erases it.

The **Flat net**, **Folded net**, and **3D view** are selectable layouts of the same editor, so only one
is shown at a time. Folded net keeps Front square, folds Up and Right away in perspective, and
leaves Left, Down, and Back visibly attached. 3D view projects all non-frontal faces into their
respective 3D planes (Left and Right vertical, Up and Down horizontal) in an exploded axonometric layout.
Because the layouts share the same sticker buttons, they always retain identical colour dots, click/drag paint,
erase, double-click colour pickup, keyboard entry, and piece-hover highlighting. Where supported and motion is not
reduced, the same six face elements morph smoothly across all three layouts.
A live summary card tracks Entered/Corner/Edge
progress; on 2×2×2 and 3×3×3 it also tracks completed corners and edges, and on 3×3×3 it
distinguishes **Known** stickers by including the six fixed
centres. It always includes a colour-by-colour remaining bar—including its final `0 left`
state—while each palette swatch also shows its own
remaining count. The summary, palette, copy control, and actions form one right-hand
rail. Spaced neatly below the action buttons, the bold, colour-coded keyboard
reference card sits immediately above **Copy as…**: face/colour keys on the left,
with **E** to erase and arrow keys stacked to their right. Valid progress is shown
continuously through remaining counters, the live dot matrix, and the enabled
state of **Load** without an extra redundant status banner. This keeps the cube,
its preview, and the relevant controls visible together in a clean, focused layout.
**Copy as…** places the current draft on the clipboard as compact facelets, spaced
facelets or (on 2×2×2/3×3×3) Singmaster piece cycles, once the draft is complete; it is
disabled until then.

**Sync state** from a connected smart cube writes its physical facelet state into Setup. It
does not change the optional Moves field, allowing a user to inspect or replay a sequence
from a freshly synchronized physical position. Both fields are shareable in the URL hash as
`alg` (setup) and `moves`.

When a connected cube is in normal **physical mirror** mode, the viewport deliberately
continues to show its actual facelets. Loading a practice scramble changes Setup but cannot
turn the physical puzzle; CubeLab asks the user to perform the setup turns. In **Controller
mode**, the same Setup source initializes a separate virtual state at once, and physical
facelet reports are ignored until physical mirroring is restored.

For 2×2×2 and 3×3×3, Setup and smart-cube facelets must also describe a physically
reachable position. CubeLab rejects a twisted-corner, flipped-edge, or permutation-parity
mismatch before it updates the viewport or begins solving; its diagnostic names affected
cubie slots when that is mathematically determinable.

## Academy targets

Academy normally solves the recognized setup to solved. Its optional **Target pattern** field
instead accepts a 3×3 state in the same formats and generates a route from the current setup
to that target. The Academy builds the relative cubie state `target⁻¹ ∘ setup`, runs its
existing verified solver, and then replays the returned algorithm against the original setup.
It presents a solution only if the final 54 facelets exactly equal the requested target.

Target patterns use the standard U/R/F centre orientation. Whole-cube rotations are hand
regrips, not target-state changes; rotate an input back to the standard centre frame before
using it as a target.

## Background Academy searches

Academy solving crosses a worker boundary at `src/client/workers/solver-client.ts`. The
main thread posts a request containing the selected method and relative 3×3 state to
`solver.worker.ts`; that worker imports and dispatches the existing Beginner, CFOP, and
Petrus solvers. It returns only a solution or a human-readable error. The main thread
remains responsible for replaying a returned solution from the original setup to the
requested target before showing it, so the worker is a responsiveness boundary rather than
a weaker correctness boundary.

The worker client uses request identifiers and supports multiple future solver requests
without conflating their responses. Any worker startup or runtime error rejects the pending
request and appears in the Academy status area. Table-based or deep searches added later
should use this same client boundary instead of running on the UI thread.

The manual-state editor similarly sends its deferred exact colour-dot verification to a
dedicated worker. Local hints remain visible if that worker cannot start, while clicks and
auto-fill retain their synchronous final correctness gates.
