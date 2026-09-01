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

Every executable teaching sequence is a parenthesized AST group followed by `@0.5s`, so
the learner can inspect its immediate result. At the end of Steps 1–6, that sequence pause
is replaced—not compounded—by a single `@1.2s` phase pause. Step 7 retains its final
0.5-second sequence pause. These pauses are state-neutral timeline nodes and scale
with the player's selected 0.5×/1×/2× speed. The reported move count excludes comments,
pauses, and `x`/`y`/`z` whole-cube regrips; only face and slice layer turns count as moves.
Rotations and both pause classes remain independently addressable tape steps. The ribbon
shows Academy-generated spacing only for the seven phase boundaries; the shorter
inter-sequence delay remains intentionally invisible so adjacent teaching algorithms
stay compact. A user-authored undated pause (`.`) remains a small semantic gap.

Hovering or keyboard-focusing a parenthesized sequence highlights the complete ribbon
group without opening a tooltip. The Academy compares the canonical states immediately
before and after that sequence, selects the phase-relevant edge or corner it advances,
and locates the same physical piece in the currently displayed timeline state. In the 3D
viewport, the source cubie receives a cyan emissive rim, its centre-relative destination
receives an amber ghost treatment, and unrelated stickers become a lit neutral gray.
The six centre stickers remain coloured as orientation anchors, and the black cubie body
retains its ordinary lighting so the cube never collapses into a dark silhouette.
Destination lookup follows the live centre frame, so the focus remains correct through
explicit `x`, `y`, and `z` teaching regrips.

## Coached phase transitions

Academy playback defaults to **Coached**. Crossing a verified phase boundary pulses the
pieces completed by that invariant in emerald, eases the persistent camera to the next
phase's useful viewing angle, then previews the next unsatisfied edge or corner with the
same source-to-target trajectory used by sequence hover. At 1× the three stages take
350 ms, 450 ms, and 400 ms respectively and replace—not add to—the 1.2-second phase
pause. The selected 0.5×/1×/2× speed scales all three durations. The final phase pulses
all cubies and reports that all seven invariants passed.

**Continuous** skips generated Academy pause nodes and all coaching transitions while
preserving the exact move-state timeline. Phase cards remain direct step-by-step seek
controls in either mode. Coaching status is announced through an assistive live region;
the projected canvas itself remains hidden from accessibility APIs.

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
