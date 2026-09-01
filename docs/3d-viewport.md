# Interactive 3D Viewport

Cube Rosetta's viewport is a zero-framework WebGL view of the same canonical
`cubeState` used by every codec. Rendering never reparses notation and cannot
alter the converted state.

## Geometry contract

`CubeGeometry.generate` accepts a validated 2×2 through 5×5 state, a surface
style, and a display palette. It returns a deterministic interleaved mesh with
ten floats per vertex:

```text
position.xyz, normal.xyz, colour.rgba
```

The two styles are intentionally different physical models:

- **Standard** builds beveled charcoal cubie bodies and places smaller vinyl-coloured
  tiles just above exposed faces.
- **Speed** builds stickerless pieces whose exposed caps are coloured plastic. Edge
  rolls use three cylindrical segments with smooth normals, and corner patches carry
  the adjacent face colours into the rounded join.

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

Pointer drag changes the orbit camera, the wheel controls distance, and reset
restores the documented isometric view. WebGL initialization and context-loss
failures are reported to the surrounding interface without affecting any text
codec.

## Provenance and licensing

The physical design vocabulary was informed by the Standard and Speed looks in
the separate `flix-cube` project. Because that project is AGPL-3.0 and Cube
Rosetta is MIT, this module is an independent implementation of the underlying
geometric ideas and does not copy or translate its source code.
