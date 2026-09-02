# Two-phase solver coordinates

`TwoPhaseSolver` is the table-backed foundation for a 3×3 two-phase solver. It
uses the standard first-phase coordinates: corner twist (2,187 states), edge
flip (2,048 states), and middle-slice edge placement (495 states). Its second
phase operates in the G1 subgroup with corner permutation, non-slice edge
permutation (40,320 states each), and slice-edge permutation (24 states).

Phase-one pruning distances are packed as two four-bit values per `Uint8Array`
byte. A value of 15 means unvisited while a breadth-first table is being built.

Second-phase transition tables are flat `Uint16Array` instances. For a
coordinate `c` and phase-two move-table column `m`, the entry is at
`c * 10 + m`; `phase2MoveTableIndex` exposes that calculation. The columns use
the G1-preserving move order `U`, `U2`, `U'`, `D`, `D2`, `D'`, `R2`, `L2`,
`F2`, `B2`.

The corner, edge, and slice-permutation tables are built by decoding a cubie
permutation, composing it with one of ten static move permutations, and
re-encoding it. This deliberately avoids reconstructing facelets and reducing
pieces for every table cell.
