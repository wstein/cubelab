# 4×4 reduction solver

CubeLab's current 4×4×4 capability is a replay-verified **reduced-state
finisher**. It is not a general 4×4 solver.

## Architecture

The solver has four stages:

1. Solve the six 2×2 centre blocks.
2. Pair the twenty-four wing edges into twelve dedges.
3. Reduce the resulting position to a physical 3×3×3 state and solve it with
   the existing two-phase solver.
4. Detect and repair the OLL- and PLL-parity cases that reduction can create.

Every stage runs in the solver worker. Before a solution is presented, CubeLab
replays it against the original 4×4 facelets and accepts it only when every
face is monochrome in the current whole-cube orientation.

## Current foundation

## Three-phase port status

`Solver/ThreePhase4x4.res` is a GPL-attributed ReScript port in progress. Its
first completed increment is the strict 96-facelet U/R/F/D/L/B row-major
boundary: a CubeLab 4×4 state round-trips exactly through the format consumed
by the upstream three-phase search. The second increment ports
`FullCube.centerFacelet`: its 24 centre slots are extracted in the upstream
U/D/F/B/R/L coordinate order. The third increment ports
`FullCube.edgeFacelet`: all 24 ordered wing pairs extract from CubeLab state in
the upstream coordinate order. Corner, move-transition, pruning-table, and
search coordinates are not ported yet; the module is not connected to the
Converter.

`Reduction4x4.reduce4x4` is the handoff gate for stage 3. It accepts only a
4×4 with monochrome 2×2 centres and paired visible wings, converts it to the
corresponding 3×3 facelet state, and validates that reduced state with
`PieceReducer`. This prevents a 3×3 solution from being misrepresented as a
4×4 solution before the centre and wing stages have completed.

The Converter exposes **Finish reduced state** only after centres and wings
are fully reduced. It runs the 3×3 finish directly and replay-verifies the
returned algorithm against the original 4×4. Unresolved states receive the
specific centre or wing prerequisite instead of a long greedy sequence.

The retained full-reduction prototype is not exposed by the Converter because
its local centre and wing guides do not meet the move-quality or completeness
contract. It remains test-only while coordinate-based search replaces it.

A 4×4 result reports **STM** and **OBTM**, never HTM: STM prices every
non-rotation slice or block turn at one; OBTM prices an outer block turn at one
and an isolated inner slice at two. Both counts are derived from the normalized
expanded algorithm, excluding whole-cube rotations.
The regression suite covers both an already reduced state and a simple
centre-complete wing-pairing state; each case replays the returned algorithm
against the original facelets before asserting that the cube is solved.

## Reduction milestones

`Reduction4x4.inspectReduction4x4` is the shared milestone model for the
worker, eventual reduction search, and Academy. It never calls a partly
reduced position a 3×3 state. Instead it reports:

- the number of monochrome 2×2 centre blocks, out of six;
- the number of matched visible wing rows, out of twenty-four;
- the current stage (`centres`, `wings`, or `reduced`) and its next goal.

The worker reports those counts before it attempts the strict 3×3 handoff.
This means a future centre/wing search can publish the same verified
milestones as it improves the position, and an Academy can teach the two
4×4-specific phases without duplicating the existing 3×3 Academy methods.

The next implementation phase adds bounded centre and wing reduction search,
followed by explicit parity detection and repair.

## Wing-pair endgame

The wing-pair guide normally chooses an immediately improving pairing move.
For the legal last-two-dedge configuration, however, the required setup can
temporarily reduce the visible matched-row count. When no one-ply improvement
exists, the guide therefore tries a bounded two-ply fallback: its first move
may lose up to four matched rows, while the final combined sequence is offered
only when it restores all centre blocks and improves the original wing score.
If no such sequence is verified, the guide reports that the position needs a
setup or parity step; it does not describe the cube state as impossible.

## Centre frames and parity hand-off

A monochrome 2×2 centre block is not by itself a completed reduction. The six
blocks must also form one of the 24 whole-cube U/R/F orientations. A mirrored
or otherwise invalid arrangement remains in the centre stage; the Academy's
centre-coordinate search supplies a verified reordering sequence before wing
pairing continues.

Once centres and wings are reduced, `reduce4x4` distinguishes the two legal
even-cube parity cases from genuinely invalid input. OLL parity is an odd
reduced-edge orientation sum; PLL parity is a reduced corner/edge permutation
parity mismatch. The Academy offers the applicable repair only after replaying
it and confirming that the resulting 3×3 projection is legal. The converter
routes either parity result back to that repair step instead of attempting a
3×3 finish.
