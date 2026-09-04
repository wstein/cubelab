# ACube 4 notation

CubeLab imports the complete, concrete 3×3 states written by
[Josef Jelinek's ACube 4](https://github.com/josef-jelinek/acube). Select
**ACube 4** in Settings when entering its move spelling.

## State input

Setup accepts both documented ACube state forms:

- Positional notation: twelve edges followed by eight corners, for example the
  solved state `UF UL UB UR DF DR DB DL FR FL BR BL URB UFR UBL ULF DRF DFL DLB DBR`.
- Cycle notation and standalone orientation terms, for example
  `(UL UR) (UFR URB)` and `UFR- URB+ UL- UF-`.

Cubie names are case-insensitive on import. Cycles run left to right exactly as
ACube documents them; an oriented cubie spelling such as `FRU` is retained as
the corresponding cubie orientation.

ACube also accepts partial constraints: `?`, `@`, bracketed ignored pieces, and
their wildcard forms. Those describe many possible cubes, while CubeLab's
viewport, replay timeline, and solvers require one complete physical state.
CubeLab therefore detects those forms and explains why it cannot choose an
arbitrary completion. It never silently substitutes a state.

## Move input

ACube uses normal face, wide, and slice turns. Its lowercase `e`, `s`, and `m`
are whole-cube rotations in the directions of `E`, `S`, and `M`; CubeLab maps
them to `y'`, `z`, and `x'` respectively. Uppercase `E`, `S`, and `M` remain
middle-slice turns.

ACube's `R*`-style allowed-turn lists are solver configuration, not an
executable algorithm, so they are intentionally not accepted in Setup or Moves.
