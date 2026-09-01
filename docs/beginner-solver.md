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

The generated tutorial keeps **white on top for Steps 1–2**, matching the beginner's
view while building the cross and inserting the first-layer corners. Step 3 begins with
an explicit `x2` regrip; **yellow remains on top for Steps 3–7**. A final `x2` restores
the canonical `U/R/F/D/L/B` centre frame. Inputs ending in whole-cube rotations are
first returned to that canonical frame. Reorientation is emitted explicitly with `x`,
`y`, and `z` moves instead of silently remapping every case: `y` regrips present
insertion and last-layer cases from a natural front face, while whichever axes are
required normalize an already-rotated input.

Every executable teaching sequence is a parenthesized AST group. A duration pause of
`@0.5s` follows each group so the learner can inspect its result; `@1.5s` separates the
seven phase boundaries. These pauses are state-neutral timeline nodes and scale with the
player's selected 0.5×/1×/2× speed. The reported move count excludes comments, pauses,
and `x`/`y`/`z` whole-cube regrips; only face and slice layer turns count as moves.
Rotations and pauses remain independently addressable tape steps.

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
visible phase boundaries, human regrips, and recognizable beginner algorithms.

## Correctness boundary

Before `solve` returns success it applies the complete annotated algorithm to the
original input state and compares all 54 facelets with the canonical solved state. A
search-limit or replay failure returns an error and no candidate tutorial. Tests also
assert every intermediate phase invariant and solve seeded random-turn states without
depending on their source algorithms.

Performance depends on the state. A 100-state, 25-turn development sample on Node.js
averaged approximately 228 ms and had a sampled maximum of approximately 912 ms. These
numbers are observations, not a runtime guarantee.
