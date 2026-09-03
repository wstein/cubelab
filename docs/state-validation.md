# Physical state validation

CubeLab accepts facelets, colour notation, nets, cubie coordinates, Orbit64, SSE cubie-state
cycles, and
smart-cube facelet reports. For 2×2×2 and 3×3×3 inputs, syntactic validity alone is
not enough: the position must also be reachable by legal turns.

## SSE cubie-state cycles (2×2 and 3×3)

An SSE cycle is a state declaration, not an algorithm. For example,
`(ulb,urf) (ul,ur)` swaps one corner pair and one edge pair; on a 3×3 the two swaps
keep the permutation-parity invariant balanced. A 2×2 has no edges, so it accepts
corner-only cycles such as `(ufl,ubr) (dlf,drb) (dfr,dbl)` even though the three
corner swaps are odd. The face-letter order of each location carries orientation, and
a leading `+` or `-` adjusts an edge flip or corner twist. CubeLab converts these cycles
to cubie coordinates, reconstructs facelets, and runs the same reachability validation
described below. Edge and marked-centre SSE parts are deliberately 3×3-only.

`(+r)`, `(-u)`, and `(++r)` marked-centre rotations are accepted, but CubeLab's current
colour-only facelet model cannot render a centre logo orientation. The parsed Setup label
therefore states that marked-centre orientation was omitted; it does not silently claim
that the information is visible or preserved.

`StateParity.res` owns the reachability invariants after `PieceReducer` has established
the coordinate shape, value ranges, and piece permutations:

- corner orientations sum to zero modulo 3;
- on 3×3×3, edge orientations sum to zero modulo 2;
- on 3×3×3, corner and edge permutations have equal parity.

The validator returns a structured violation rather than a solver failure. Its rendered
diagnostic identifies affected coordinate slots where possible—for example, `UFR` for a
single corner twist and `UR` for a single edge flip. A parity mismatch is reported as a
single swapped pair because the invariant cannot identify which physical pair was swapped.

`PieceReducer.reduce` applies this check to decoded cubie coordinates. The client applies
the same reducer boundary to every recognized 2×2×2 or 3×3×3 state and to facelets
reported by a connected smart cube. Unreachable positions therefore never enter playback,
Academy solving, or smart-cube synchronization as valid states. Larger cubes continue to
use their existing codec and shape validation because this cubie-coordinate model does not
represent their complete reachability constraints.
