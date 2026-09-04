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

The next implementation phase adds bounded centre and wing reduction search,
followed by explicit parity detection and repair.
