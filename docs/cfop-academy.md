# CFOP Academy

`src/Solver/CfopSolver.res` builds a four-stage, replay-verified 3×3 teaching solution:

1. **Cross** — search for the complete white cross, build it on the bottom, and align all
   four side colours.
2. **F2L Pairs** — solve each matching white corner and middle edge together while locking
   the cross and every completed pair.
3. **Two-Look OLL** — recognize and orient the edge case, then recognize and orient the
   corner case.
4. **Two-Look PLL** — recognize and permute the corners, then solve the Ua, Ub, H, or Z
   edge case.

This is explicit **two-look CFOP**, not a claim to include the full 57 OLL and 21 PLL
libraries. Its F2L stage is pair-first: each sequence records the pair colours, current
corner and edge positions, white-sticker direction, edge orientation, and whether the
pieces are connected, separated, or trapped.

## Curated virtual drills

The Academy’s Smart Controller workflow also offers a focused curated selector.
Representative OLL and PLL entries come directly from the executable CFOP case tables,
alongside compact F2L insertion drills. Loading a case assigns its inverse state to the
virtual cube, so executing the listed algorithm solves it. The physical smart cube remains
only a turn-and-gyro controller; its facelets do not alter the drill state.

The selector filters to **OLL**, **PLL**, or **F2L**. **Random case** chooses within that
family and cycles y-orientations (`0`, `y`, `y2`, `y'`) before returning to the first
orientation. Both the injected state and solving algorithm use the same orientation.
Academy keeps cases visible for untimed learning by default; **WCA drill** opts an
instant or curated drill into the covered 15-second timer theater.

## Planning and scoring

Cross uses a complete bounded search over all four cross edges instead of solving them
one at a time. F2L evaluates every remaining pair, searches candidate insertions, scores
them in the white-bottom human frame, and backtracks over pair order when the cheapest
immediate choice prevents a later locked slot. The score accounts for physical turns,
half turns, explicit rotations, estimated regrips, and penalties for less ergonomic back,
left, and slice turns.

The fast F2L tier considers the destination faces plus the faces containing the current
pieces. A bounded all-side fallback handles pairs trapped in unrelated slots. A
single-cubie distance lower bound prunes paths that cannot reach the locked goal within
the remaining depth.

## Frame and replay guarantees

The solver shares the verified cubie transition and bounded-search primitives from
`BeginnerSolver`, but owns its CFOP planning, pair selection, case libraries, and phase
goals. Cross and F2L run with white on the bottom; OLL and PLL keep yellow on top.
Whole-cube `x`, `y`, and `z` regrips remain visible but do not count as physical moves.

The four stage algorithms are concatenated and replayed against the recognized input.
The solver verifies the Cross after phase 1, the cross plus all four F2L slots after phase
2, complete last-layer orientation after phase 3, and the solved permutation after phase
4. It then replays the concatenated algorithm against the original input and returns a
solution only when all 54 facelets equal the canonical solved state. Invalid, unreachable,
and non-3×3 inputs preserve the existing solver error behavior.

Parenthesized sequences retain the standard 0.5-second teaching delay. Only the three
major CFOP boundaries retain the 1.2-second phase delay.

## Target-pattern replay

The Academy target field may replace canonical solved with a standard-frame 3×3 target
pattern. The client derives `target⁻¹ ∘ setup` before invoking the solver, then replays the
returned algorithm against `setup` and accepts it only when every target facelet matches.
This preserves the solver's solved-state phase checks while making the user-facing route
state-to-state. Whole-cube rotated targets are rejected because their centre frame is a
regrip convention rather than a cubie permutation.
