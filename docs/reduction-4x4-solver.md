# 4×4 reduction solver

CubeLab's planned 4×4×4 solver is a replay-verified **reduction solver**.
It is not an optimal solver: it makes no shortest-solution or HTM-optimality
claim.

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

`Reduction4x4.reduce4x4` is the handoff gate for stage 3. It accepts only a
4×4 with monochrome 2×2 centres and paired visible wings, converts it to the
corresponding 3×3 facelet state, and validates that reduced state with
`PieceReducer`. This prevents a 3×3 solution from being misrepresented as a
4×4 solution before the centre and wing stages have completed.

The Converter exposes this working handoff as **Finish reduced state** for a
4×4 Setup that has already completed stages 1 and 2. It runs the 3×3 finish
in the worker, lifts the returned outer-layer algorithm onto the original
4×4, and replay-verifies that every resulting face is monochrome. It rejects
an unresolved position with the specific centre or wing-pair prerequisite.

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
