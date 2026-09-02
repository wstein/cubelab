# Physical state validation

CubeLab accepts facelets, colour notation, nets, cubie coordinates, Orbit64, and
smart-cube facelet reports. For 2×2×2 and 3×3×3 inputs, syntactic validity alone is
not enough: the position must also be reachable by legal turns.

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
