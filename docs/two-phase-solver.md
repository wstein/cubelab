# Two-phase solver coordinates

`TwoPhaseSolver` is the table-backed foundation for a 3×3 two-phase solver. It
uses the standard first-phase coordinates: corner twist (2,187 states), edge
flip (2,048 states), and middle-slice edge placement (495 states). Its second
phase operates in the G1 subgroup with corner permutation, non-slice edge
permutation (40,320 states each), and slice-edge permutation (24 states).

Phase-one pruning distances are packed as two four-bit values per `Uint8Array`
byte. A value of 15 means unvisited while a breadth-first table is being built.
The phase-one `slice × twist` and `slice × flip` tables, and the phase-two
`corner permutation × slice permutation` and `edge permutation × slice
permutation` tables, are cached for the worker lifetime. Breadth-first builds
use a compact `Uint32Array` work queue rather than a boxed JavaScript array,
which avoids heap fragmentation and keeps initial construction fast. The search
hot path also uses flat `Uint16Array` phase-one transition tables rather than
boxed coordinate rows.

Second-phase transition tables are flat `Uint16Array` instances. For a
coordinate `c` and phase-two move-table column `m`, the entry is at
`c * 10 + m`; `phase2MoveTableIndex` exposes that calculation. The columns use
the G1-preserving move order `U`, `U2`, `U'`, `D`, `D2`, `D'`, `R2`, `L2`,
`F2`, `B2`.

The corner, edge, and slice-permutation tables are built by decoding a cubie
permutation, composing it with one of ten static move permutations, and
re-encoding it. This deliberately avoids reconstructing facelets and reducing
pieces for every table cell.

`solve` runs iterative-deepening A* in two stages. It applies a conservative
symmetry-breaking normal form to consecutive opposite faces: because `U/D`,
`R/L`, and `F/B` commute, it retains one canonical order for each pair while
discarding the equivalent reversed branch. Phase one uses the maximum
of its slice×twist and slice×flip distances; phase two uses the maximum of its
corner×slice and edge×slice distances. Both bounds are admissible. Every
successful solver result is replay-verified against the solved facelets at the
solver boundary before it is returned, but it is not an HTM-optimal solution.
It explores phase-one candidates against a shared total
depth budget and returns only solutions of at most 24 HTM. The default request
begins at the proven 20-HTM upper bound for responsiveness, widening one bound
at a time only when this particular phase split cannot realize it, then returns
that first verified result. The control changes to **Search for better result**;
that explicit refinement request searches progressively lower bounds while
keeping the existing candidate available to apply. If no candidate fits the
24-HTM limit, the solver reports `SearchFailed` rather than returning a longer
algorithm.

The converter exposes full solutions through the dedicated worker request
`solveTwoPhase`, separate from Academy's tutorial request contract. Its 3×3
control solves the current Setup plus Moves state off the UI thread and reports
the HTM count and canonical algorithm. An optional **Target** uses the same
standard-centre-frame rule as Academy: CubeLab solves the relative state and
replay-verifies that the result maps the original Setup to the requested target.
An empty Target means solved. It reports table-preparation and search stages and
publishes verified best-so-far candidates. **Stop search** terminates the
dedicated worker immediately and replaces it before another request can start.
Apply solution preserves Setup and appends the verified algorithm to Moves; it
asks for a new solution if Setup, Moves, or Target changed after the search.

For background on the 20-HTM upper bound for every 3×3 position, see the
[God's Number proof project](https://www.cube20.org/).
