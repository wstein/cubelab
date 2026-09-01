# CFOP Academy

`src/Solver/CfopSolver.res` builds a four-stage, replay-verified 3×3 teaching solution:

1. **Cross** — build the white cross on the bottom and align all side colours.
2. **F2L Foundation** — complete the first two layers with corner placement followed by
   beginner left/right edge insertions.
3. **Two-Look OLL** — orient last-layer edges, then corners.
4. **Two-Look PLL** — permute last-layer corners, then edges.

The F2L label is intentionally qualified as a foundation. This version teaches and
verifies the F2L goal but does not claim pair-first or slot-optimized advanced F2L. That
distinction remains visible in both the Academy copy and its generated comments.

## Frame and replay guarantees

The solver derives its bounded piece-solving path from `BeginnerSolver`, then changes the
teaching frame so Cross and F2L run with white on the bottom. The OLL and PLL stages keep
yellow on top. Whole-cube `x`, `y`, and `z` regrips remain visible but do not count as
physical moves.

The four stage algorithms are concatenated and replayed against the recognized input.
CFOP Academy returns a solution only when the resulting 54 facelets equal the canonical
solved state. Invalid, unreachable, and non-3×3 inputs preserve the existing solver error
behavior.

Parenthesized sequences retain the standard 0.5-second teaching delay. Only the three
major CFOP boundaries retain the 1.2-second phase delay.
