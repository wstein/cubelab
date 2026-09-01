# Beginner 3×3 tutorial solver

`src/Solver/BeginnerSolver.res` solves a validated 3×3 state through seven explicit
Layer-by-Layer goals. It accepts the canonical cube state, not the source algorithm, so
compact facelets, colour notation, nets, cubie coordinates, Orbit64, and algorithms all
use the same solving path.

## Phase contract

Each phase preserves the completed goal of every earlier phase:

1. **White Cross** — all four white edges are oriented and aligned with side centres.
2. **First-Layer Corners** — the white layer is complete.
3. **Middle Layer** — the four non-yellow edges complete the first two layers.
4. **Yellow Cross** — all four last-layer edges are oriented.
5. **Orient Yellow Corners** — the yellow face is oriented with Sune/anti-Sune cases.
6. **Position Yellow Corners** — every last-layer corner occupies its solved slot.
7. **Position Yellow Edges** — the final edges are cycled and the fixed frame is solved.

The generated tutorial places white on the bottom while teaching, then restores the
canonical `U/R/F/D/L/B` centre frame at the end. Inputs ending in whole-cube rotations
are first returned to that canonical centre frame.

## Solving strategy

- Cross edges and first-layer corners use bounded cubie-coordinate searches. Each search
  locks every piece completed earlier in the current phase.
- Middle edges use rotations of the standard beginner left/right insertion algorithms.
- Last-layer stages search only rotations of the yellow-cross, Sune/anti-Sune,
  corner-positioning, and U-permutation cases.
- Search operates on `CP/CO/EP/EO`; emitted moves are still executed by the facelet
  permutation engine.

This is intentionally a teaching solver rather than an optimal solver. Generated
solutions are usually longer than two-phase solutions, and move count is secondary to
visible phase boundaries and recognizable beginner algorithms.

## Correctness boundary

Before `solve` returns success it applies the complete annotated algorithm to the
original input state and compares all 54 facelets with the canonical solved state. A
search-limit or replay failure returns an error and no candidate tutorial. Tests also
assert every intermediate phase invariant and solve seeded random-turn states without
depending on their source algorithms.

Performance depends on the state. A 100-state, 25-turn development sample on Node.js
averaged approximately 228 ms and had a sampled maximum of approximately 912 ms. These
numbers are observations, not a runtime guarantee.
