# Cube Rosetta

Cube Rosetta converts Rubik's Cube algorithms and state representations for 2×2×2
through 5×5×5 cubes. The implementation uses a canonical facelet model with strict,
bidirectional codecs.

The web interface uses static Astro markup and a small Vanilla DOM controller. It has
no React, virtual DOM, or client-island runtime dependency.

Implemented state codecs:

- compact URFDLB facelets;
- canonical ASCII cube nets;
- compact colours and colour nets using Western, Japanese, or custom schemes.

The move parser implements the SiGN/LGN structure used by the project: outer, inner,
wide, slice, and rotation moves; arbitrary repetition suffixes; groups; commutators;
and conjugates. A one-to-one Unicode normalization pass preserves raw-input offsets for
typed source-span diagnostics. Slice moves are deliberately limited to 3×3×3, while
layer and wide-move ranges are validated against the selected size.

The geometry executor applies the parsed AST to a solved or supplied canonical state.
It supports 2×2×2 through 5×5×5 outer, inner, wide, and whole-cube moves, plus 3×3×3
`M/E/S`. Composite notation is expanded with a 100,000-move safety limit. Sticker
movement uses an explicit fixed-frame 3D coordinate mapping; odd-cube fixed centres stay
anchored for slice moves and participate only in whole-cube rotations.

Custom colour mappings use six distinct uppercase ASCII letters in `U,L,F,R,B,D`
order. Parsers validate exact sticker counts and canonical net geometry.

## Installation

```sh
npm install
```

## Build

- Build: `npm run res:build`
- Clean: `npm run res:clean`
- Build & watch: `npm run res:dev`

## Quality checks

```sh
npm run format:check
npm run lint
npm test
```

## Run

```sh
node src/Demo.res.mjs
```
