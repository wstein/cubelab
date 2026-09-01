# Interactive 3D Viewport

Cube Rosetta's viewport is a zero-framework WebGL view of the same canonical
`cubeState` used by every codec. Rendering never reparses notation and cannot
alter the converted state.

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
  rounded vinyl-coloured tiles just above exposed faces.
- **Speed** builds stickerless pieces from one continuous rounded cap and three
  smoothly-normaled roll bands per exposed face. The band reaches the full piece
  boundary, so adjacent coloured faces meet without disconnected corner fans or
  punctures. A per-vertex sheen value gives the rolled plastic a satin highlight.

Every cube has the same world-space half-extent. Increasing the puzzle size therefore
adds smaller pieces instead of making the rendered object larger.

Western and Japanese palettes are represented directly. Custom output symbols
do not encode RGB meaning, so custom schemes use the Western physical palette
in the viewport.

## Renderer lifecycle

The native WebGL renderer uploads the mesh to one interleaved vertex buffer.
Capacity is allocated for the selected size's largest Speed mesh, then state
and style changes reuse it through `bufferSubData`.

Rendering is scheduled only after a state, style, camera, visibility, or size
change. There is no perpetual animation loop. An `IntersectionObserver`
suppresses work while the viewport is off screen, and the backing canvas
clamps device pixel ratio to 2.

Logical face, range, slice, and whole-cube moves map to a shader axis, a cubie-centre
selection interval, and a signed target angle. During a transition, Rodrigues'
rotation is applied to both position and normal for selected cubies. The easing curve
is cubic ease-out; completing an animation clears the temporary transform so the
caller can upload the committed canonical state. Cancelling, replacing, or disposing
the viewport also clears pending animation frames.

Pointer drag changes the orbit camera, the wheel controls distance, and reset
restores the documented isometric view. WebGL initialization and context-loss
failures are reported to the surrounding interface without affecting any text
codec.

## Application integration

One observable application state contains the selected size, raw input, colour
scheme, lowercase interpretation, numbered-layer dialect, and cube style. Store notifications are coalesced into
one `requestAnimationFrame`, so text cards and the viewport update from the same
parse result during the next browser paint.

The input badge reports the successful branch of the deterministic parser cascade:
algorithm, Orbit64, cubie coordinates, compact facelets, compact colours, facelet
net, or colour net. Invalid input leaves the last valid 3D state visible and marks
the input status as invalid.

For algorithm input, the client expands composite AST nodes into a canonical step
timeline and caches state 0 through state N. The viewport provides start/end jumps,
animated forward and inverse steps, play/pause, 0.5×/1×/2× speeds, looping, a range
scrubber, and clickable move tokens. Text codecs update only when a move commits, so
they always describe an exact canonical state rather than a fractional animation.

Playback caches at most 500 expanded steps. Algorithms above that limit still execute
through the normal 100,000-step safety boundary and display their final conversion,
but do not retain hundreds of intermediate cube states. When editing at the current
end of a timeline, appending exactly one expanded move animates that move; pastes and
multi-step changes render the final state immediately.

Shareable settings are written to the URL hash after 300 milliseconds without
adding browser-history entries. Hash input is validated, and imported text is
limited to 20,000 characters before it reaches the parser.

## Provenance and licensing

The physical design vocabulary was informed by the Standard and Speed looks in
the separate `flix-cube` project. Because that project is AGPL-3.0 and Cube
Rosetta is MIT, this module is an independent implementation of the underlying
geometric ideas and does not copy or translate its source code.
