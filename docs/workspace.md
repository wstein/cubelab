# Single-page workspace

Cube Rosetta uses four client-side workspace views over one canonical state:

- **Converter** presents the six size-aware state formats and copy controls.
- **Beginner Academy** generates and explains a seven-phase 3×3 LBL tutorial.
- **CFOP Academy** teaches a replay-verified Cross, four recognized and locked F2L pairs,
  two-look OLL, and two-look PLL path.
- **Alg Workbench** contains transformations and the state-verified NISS helper.

The tabs are visibility controls, not routes or hydrated framework components. The page
contains one `CubeViewport` instance outside the changing left-hand panels, so switching
views does not recreate the WebGL context, mesh buffers, camera, or tape player. The
active tab is stored in the URL hash alongside the current input and settings. The
supported values are `tab=converter|beginner|cfop|workbench`.

## Shared-state behavior

The puzzle size, notation settings, input, recognized cube state, viewport style, and
turn-guide preference remain shareable URL state. The playback timeline remains shared
in memory. Tab-only state changes do not reparse the input or reset
playback. Editing the source or changing a conversion setting intentionally rebuilds the
recognized state and clears any generated tutorial.

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

Practice scramble is located in **Quick load**, not among algebraic transformations. It
remains a random-turn practice sequence and is not labeled as an official WCA scramble.
