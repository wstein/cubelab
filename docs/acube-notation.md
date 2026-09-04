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
Setup field requires one complete physical state. Setup therefore rejects a
non-fixed definition and directs it to the **ACube state generator** in the
Workbench.

The generator implements ACube's constraints and materializes one legal 3×3
completion. It supports ignored individual cubies, wildcard masks such as
`U*` and `UF*`, and `M`/`E`/`S`/face edge-layer masks. It fills only
unconstrained cubies, orientations, and parity. The seed is part of the
generation request: reuse it to reproduce a state, or use **Next seed** for a
different legal member of the same state family. Generated states are written
to Setup as ordinary compact facelets.

## Move input

ACube uses normal face, wide, and slice turns. Its lowercase `e`, `s`, and `m`
are whole-cube rotations in the directions of `E`, `S`, and `M`; CubeLab maps
them to `y'`, `z`, and `x'` respectively. Uppercase `E`, `S`, and `M` remain
middle-slice turns.

ACube's `R*`-style allowed-turn lists are solver configuration, not an
executable algorithm, so they are intentionally not accepted in Setup or Moves.
