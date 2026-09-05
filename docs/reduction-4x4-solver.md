# 4×4 reduction solver

## Provenance

The in-progress three-phase engine derives from **TPR-4x4x4-Solver** by Shuang
Chen (`cs.threephase`), supplied to this workspace as
`repomix-output-cs0x7f-TPR-4x4x4-Solver.xml`. Upstream `Search.java` is
GPLv3-or-later. CubeLab retains that attribution and GPL notice in `NOTICE` and
in translated source headers; CubeLab-owned surrounding code is
AGPL-3.0-or-later. The port currently translates only the facelet-coordinate
boundary and coordinate-building primitives. It does not yet include a working
upstream-equivalent three-phase search.

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
the upstream coordinate order. The fourth increment ports
`FullCube.cornerFacelet`: all eight oriented corner triples now extract in
upstream slot order. The fifth increment adds a validated move-transition seam
for outer, inner, and wide 4×4 moves; coordinate tables will be generated and
checked against this canonical executor. The sixth increment generates compact
centre transition permutations by moving a unique marker through that executor;
the row is stored target-to-source for direct coordinate application.
The seventh increment ranks the phase-one U/D centre coordinate as eight
selected slots among 24 (`C(24,8) = 735,471` raw states), matching the raw
domain used before upstream symmetry reduction. The eighth increment ports
`Center1`'s exact 48-transform walk (including its non-rotational `z2`
coordinate transform), validates the upstream 15,582-orbit reduction, and
encodes each raw rank as a compact representative plus inverse symmetry. The
centre-table generator now runs packed BFS on those representatives and writes
the 7,791-byte artifact to `public/solver/three-phase-centre.v1.bin`; it
rejects any unreached compact state. The ninth increment ports
`Moves.move2std` and `Moves.move3std`: the 28-move phase-two and 20-move
phase-three restricted sets, each move tagged with the upstream face id
(0–11, `U,R,F,D,L,B,u,r,f,d,l,b`) that its `ckmv` adjacency rule keys on.
`axisTransitionAllowed` ports that rule directly — reject a repeated face,
and within an axis pair (`faceId mod 3`) accept only ascending face-id
order — the same commuting-move symmetry break already used by
`TwoPhaseSolver.canonicalFaceTransition` for the 3×3 search.

Building the ninth increment surfaced a bug in `centreMoveNotations` (used by
every phase-one table build since the sixth increment): its "wide" half used
this codebase's `2X` SiGN inner-slice notation (layer two only, outer face
untouched) where upstream's `u/r/f/d/l/b` move indices are block turns — the
outer face and its adjacent inner slice together, confirmed by comparing
`centreTransition("2U")` against `centreTransition("Uw")` and by
`CenterCube.move`'s own case 6 rotating `ct[0..3]` (the outer U face) in the
same call as the inner-slice cycle. `centreMoveNotations` now uses `Uw`-style
wide notation; `public/solver/three-phase-centre.v1.bin` has been
regenerated (still 7,791 bytes — the fix changes stored distances, not the
15,582-orbit count).

The tenth increment adds a phase-two centre coordinate — an independent
redesign of upstream's `Center2`, not a bit-compatible port. Compiling and
running upstream's actual Java showed `Center2.set` depends on
preconditions established by `Center1`'s full 48-symmetry search plus a
3-case post-solve canonicalisation (`Center1.finish`) that the eighth
increment did not port: feeding it a state that only satisfies this port's
own phase-one rank-0 (reached by an arbitrary move path) reproducibly threw
inside upstream's own `getct()`. A first replacement attempt — ranking which
8 of slots 8–23 hold an F/B-coloured sticker — assumed that boundary was
closed under phase-two's restricted moves; it is not, confirmed by applying
`Rw` to a phase-one-solved state with the canonical executor and watching a
U/D-coloured sticker move from slot 5 into slot 9. The corrected design
tracks two independent whole-24-slot ranks the same way phase-one's own
`rankUdCentres` already does — always well-defined, since exactly 8 U/D and
8 F/B stickers exist somewhere among all 24 slots regardless of arrangement:
`rankUdCentres` (target 0, unchanged) and the new `rankFbCentres` (target
`phase2TargetFbRank`, the rank with F/B holding slots 8–15). Both transition
through the existing `transitionUdRank` fed the same `centreTransition`
permutation, so no second move-table derivation was needed. A whole-cube `x`
rotation conjugates the U/D target to the F/B target
(`transitionUdRank(0, x) == phase2TargetFbRank`, verified), so
`phase2FbDistance` reuses the already-committed phase-one symmetry pruning
table by rotating into the U/D frame first rather than building a second
table; `udRankDistance` and `phase2CombinedDistance` (their max) complete
the admissible heuristic. This bound is looser than a phase-two-move-specific
table would be (it reflects the full move set, not the 28-move restriction),
which is a performance follow-up, not a correctness gap. It also does not
track upstream's centre/wing parity-avoidance bit: a phase-one endpoint that
isn't reachable to the joint target by phase-two's restricted moves alone is
expected, and the fix is retrying other phase-one endpoints (matching
upstream's own multi-candidate strategy) in the phase-one/two chaining
increment, not a flaw in this coordinate. `udRankDistance` names what was
`phase2UdDistance` in that increment's first commit, since the eleventh
increment below reuses it as a general "distance to U/D rank 0" bound, not
something phase-two-specific.

The eleventh increment adds a concrete phase-one search: table-driven IDA*
over the raw U/D-centre coordinate using the full 36-move set, in the same
shape as `TwoPhaseSolver.searchPhase1WithinTotal` — recurse move by move,
prune via an admissible distance bound, deepen the total when no solution
exists at the current depth. The bound is `udRankDistance` against the
already-committed 15,582-orbit symmetry table; `centreMoveFaceIds` tags each
of `centreMoveNotations`' 36 entries with the face id `axisTransitionAllowed`
already keys on (outer and wide turns of the same physical face get distinct
ids, since a wide turn is not a repeat of the outer one). `solvePhase1Centres`
is the entry point: given a centre string, it returns the shortest move
sequence (as both move indices and notations) reaching U/D rank 0, replay
verified in tests against the canonical executor. Move and symmetry tables
are cached at the module level the same way `TwoPhaseSolver` caches its own,
so repeated searches do not rebuild them. Phase-two/three search and the
solver integration are not ported yet. The module is not connected to the
Converter. The existing Academy guides remain independent and intact.

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
