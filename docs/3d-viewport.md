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

## Provenance and licensing

The physical design vocabulary was informed by the Standard and Speed looks in
the separate `flix-cube` project. Because that project is AGPL-3.0 and Cube
Rosetta is MIT, this module is an independent implementation of the underlying
geometric ideas and does not copy or translate its source code.
