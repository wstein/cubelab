# Cube Rosetta

Cube Rosetta converts Rubik's Cube algorithms and state representations for 2×2×2
through 5×5×5 cubes. The implementation uses a canonical facelet model with strict,
bidirectional codecs.

The web interface uses static Astro markup, a small Vanilla DOM controller,
and a render-on-demand native WebGL preview. It has no React, virtual DOM,
client-island, or 3D framework runtime dependency.

Implemented state codecs:

- compact URFDLB facelets;
- canonical ASCII cube nets;
- compact colours and colour nets using Western, Japanese, or custom schemes;
- strict 2×2 CP/CO and centre-normalized 3×3 CP/CO/EP/EO coordinates;
- normative 12-character Orbit64 encoding for complete 3×3 cubie states.

The input badge identifies the recognized source format, including algorithms,
Orbit64, cubie coordinates, compact facelets/colours, and canonical nets. The
source-compatibility strip appears for algorithms and evaluates their original AST
against documented WCA token, SiGN/LGN, cubing.js/Twizzle, SpeedSolving Wiki, and
Ruwix Advanced profiles. Each badge explains any incompatibility on hover or keyboard
focus; the WCA badge describes source tokens, not event-specific competition legality.
The
interactive viewport renders the resulting canonical state as either a stickered
Standard cube or a stickerless Speedcube. Drag or touch to orbit, scroll to zoom,
and use the URL hash to share the active input and settings. Parsed algorithms expose
an expanded step ribbon—including state-neutral pause nodes—plus a scrubber,
forward/reverse stepping, play/pause, speed, and
loop controls. A single move appended while typing animates from the preceding state;
larger pastes snap directly to their final state.

The move parser implements the SiGN/LGN structure used by the project: outer, inner,
wide, slice, and rotation moves; arbitrary repetition suffixes; groups; commutators;
and conjugates. Unicode aliases preserve token length and raw-input offsets for typed
source-span diagnostics; Ruwix face subscripts such as `F₂'` map to portable
outer-block form (`2Fw'`). Slice moves are deliberately limited to 3×3×3,
while layer and wide-move ranges are validated against the selected size.

## Move notation compatibility

Cube Rosetta accepts the current WCA NxNxN face, outer-block, and rotation notation,
plus the SiGN/LGN cube grammar and selected reconstruction extensions:

| Feature | Short example |
| --- | --- |
| Face turns and suffixes | `R U' F2` |
| Wide and lowercase-wide turns | `Rw 3Uw2 r'` |
| Inner and ranged layers | `2R 2-3Rw2` |
| 3×3 slices and rotations | `M E' S2 x y' z2` |
| Groups, commutators, conjugates | `(R U)3 [R,U][D,L] [R: U2]` |
| Composite multiplier aliases | `(R U)*6`, `(R U)^6`, `(R U) x 6` |
| cubing.js-style pauses | `R . U` |
| Reconstruction annotations | `R U // note`, `R U # note`, `R /* note */ U`, and duration-aware `R @1.53s U` |
| Ruwix Unicode layer subscripts | `F₂' B₂2 F₃` |

Adjacent bare moves require whitespace; bracket-delimited units may touch because their
boundaries are unambiguous. A whitespace-delimited `.` is retained as a state-neutral
pause node; an adjacent final sentence `.` or `;` is ignored. Block comments are retained
as located editor nodes and ignored by cube-state execution. `M/E/S` are limited to 3×3,
and wide moves must turn between 2 and `N-1` layers. See the
[sourced site and dialect compatibility report](docs/move-notation-compatibility.md)
for standards, known site-specific extensions, and unsupported ambiguous notation.

Lowercase face moves follow modern SiGN by default: `r` means the outer two-layer
block `Rw`. On 4×4 and 5×5, the web interface can explicitly select the legacy
inner-slice dialect, where bare `r` means `2R`. This mode never changes explicit
uppercase notation such as `Rw`, `3Rw`, or `2R`. Cube Rosetta never guesses a dialect
from the input.

Ruwix plaintext loses the distinction between a layer subscript and a turn suffix:
`F2'` can mean Ruwix `2Fw'` or modern outer-face `F2'`. Cube Rosetta therefore parses
plaintext suffix layers only when **Ruwix suffix** mode is selected. The default modern
mode never guesses. Unicode subscript input remains unambiguous in either mode.

The geometry executor applies the parsed AST to a solved or supplied canonical state.
It supports 2×2×2 through 5×5×5 outer, inner, wide, and whole-cube moves, plus 3×3×3
`M/E/S`. Composite notation is expanded with a 100,000-move safety limit. Sticker
movement uses an explicit fixed-frame 3D coordinate mapping; odd-cube fixed centres
stay in the fixed world frame while their stickers follow slice-layer and whole-cube
rotations. The 3×3 piece reducer virtually restores the solved centre orientation
before extracting cubie coordinates, then validates permutation parity and orientation
sums.

Interactive playback caches canonical states for at most 500 expanded steps. Longer
algorithms still convert completely, but their tape controls are disabled to keep
browser memory bounded.

## Algorithm workbench

`MoveTransform.res` provides pure, canonical algorithm transformations:

- structured inversion without flattening groups, commutators, or conjugates;
- exact same-axis simplification and modulo-four cancellation after safe expansion;
- left/right, front/back, and up/down mirrors;
- `x`, `y`, and `z` coordinate-frame rotations;
- size-aware random-turn practice scrambles with adjacent-axis repetition prevented.

The 3×3 [NISS helper](docs/niss-helper.md) constructs `N · I⁻¹` from explicitly entered
normal- and inverse-side work, then replays the full scramble and candidate before it
allows the result to be loaded as a solution.

The [beginner tutorial solver](docs/beginner-solver.md) accepts any recognized 3×3 state,
works through seven verified Layer-by-Layer goals, and refuses to return a solution unless
the complete generated sequence solves all 54 facelets on replay.

The [CFOP Academy solver](docs/cfop-academy.md) provides four-stage, pair-first two-look
CFOP. It plans a complete white-bottom Cross, recognizes and locks four corner-edge F2L
pairs, applies explicit two-look OLL/PLL case libraries, and verifies every phase plus the
final 54-facelet replay.

Converter, Beginner Academy, CFOP Academy, and Alg Workbench are views in a
[single-page workspace](docs/workspace.md). The WebGL viewport and tape player stay
mounted across tab switches, and the selected view is preserved in the URL hash.

The input panel exposes the complete mirror and coordinate-rotation suite alongside
Invert, Simplify, and Practice scramble actions. State-format input disables algebraic
actions, and every generated algorithm is serialized into explicit modern notation
before being reparsed by the normal pipeline.

The practice generator is deliberately not labeled WCA-compliant. Official competition
scrambles must come from the current official WCA scramble program and, except for
specified events, must sample legal states uniformly. See the
[algorithm workbench design and guarantees](docs/algorithm-workbench.md).

Custom colour mappings use six distinct uppercase ASCII letters in `U,L,F,R,B,D`
order. Parsers validate exact sticker counts and canonical net geometry.

## Installation

```sh
bun install
```

## Build

- Production build: `bun run build`
- ReScript build: `bun run res:build`
- ReScript watch mode: `bun run res:dev`
- Production preview: `bun run preview`

## Quality checks

```sh
bun run format:check
bun run lint
bun run test
```

The browser smoke test requires Playwright's Chromium binary once per machine:

```sh
bunx playwright install chromium
bun run test:browser
```

Set `PLAYWRIGHT_PORT` when port 4321 is already in use, for example:

```sh
PLAYWRIGHT_PORT=4322 bun run test:browser
```
