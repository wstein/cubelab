# Physical state validation

CubeLab accepts facelets, colour notation, nets, cubie coordinates, Singmaster permutation
cycles, Orbit64, SSE cubie-state cycles, and smart-cube facelet
reports. For 2×2×2, 3×3×3, and 4×4×4 inputs, syntactic validity alone is
not enough: the position must also be reachable by legal turns.

## Singmaster piece cycles

The 2×2×2 and 3×3×3 **Singmaster Piece Cycles** are a reversible state declaration,
not an algorithm. Uppercase position names distinguish them from SSE's lowercase cycles:
`(URF,UBR,ULB)` cycles corners, while a `+` or `-` suffix records a corner twist and `+`
records an edge flip. CubeLab checks the reconstructed state with `PieceReducer`, so invalid
orientation or permutation parity is rejected rather than silently loaded.

## SSE cubie-state cycles (2×2 and 3×3)

An SSE cycle is a state declaration, not an algorithm. For example,
`(ulb,urf) (ul,ur)` swaps one corner pair and one edge pair; on a 3×3 the two swaps
keep the permutation-parity invariant balanced. A 2×2 has no edges, so it accepts
corner-only cycles such as `(ufl,ubr) (dlf,drb) (dfr,dbl)` even though the three
corner swaps are odd. The face-letter order of each location carries orientation, and
a leading `+` or `-` adjusts an edge flip or corner twist. CubeLab converts these cycles
to cubie coordinates, reconstructs facelets, and runs the same reachability validation
described below. Edge and marked-centre SSE parts are deliberately 3×3-only.

For a valid 2×2 or 3×3 state, the Converter can also emit a pasteable SSE spelling. It keeps a
cubie's orientation in that cubie's cycle spelling (and uses a first-part prefix when a
cycle needs one), so no cubie is repeated in a separate orientation cycle.

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
Academy solving, or smart-cube synchronization as valid states.

## 4×4 wing and centre validation

`StateValidation4x4.ts` validates a completed 4×4×4 facelet state before the manual editor
enables **Load**. It reduces the eight outer corners to the 2×2×2 coordinate model, checking
their identity permutation and twist sum. It then models all twenty-four physical wing pieces:
for every solved wing it enumerates the facelet slots and orientations reachable by outer and
inner 4×4 layer turns, and requires a perfect one-to-one assignment to the supplied stickers.
This rejects quota-preserving edits such as moving a single F wing sticker to D.

The validator also requires four centre facelets of each colour. A colour-only facelet state
does not label the four same-colour centres, or the two same-colour wing twins, so their
unobservable internal permutation is matched existentially. This is essential: legitimate
4×4 reduction parity is not an impossible state. The validation therefore proves all
facelet-visible corner, wing, centre, and reduction-parity constraints without inventing
identities the input does not contain.

The 5×5×5 manual editor does not yet provide a complete physical-state validator. Its live
colour dots nevertheless preserve a feasible assignment for corners, the twenty-four wing
pieces, and the twelve middle edges, alongside centre quotas and the six fixed core centres.
It therefore rejects impossible piece colour combinations as they are entered, while reserving
the stronger whole-state reachability claim for 4×4×4.

The editor reuses its fixed cubie-slot and candidate tables across feasibility checks. This
keeps the same reachability guidance while avoiding reconstruction of cube geometry for every
visible colour dot.

## Live colour dots are guided by a relaxation, not a completability test

The state editor's live colour dots come from `canCompleteManualState`. On 4×4 and 5×5 that
predicate is a **relaxation**: it checks a set of individually necessary conditions against the
stickers already entered — no colour exceeds its `n²` quota, each piece orbit still admits a
one-to-one assignment, and (on 4×4) the wing stickers remain reachable — and it evaluates each
condition independently. It is not a search for an actual completion.

To mitigate over-acceptance, `canAssignKind` checks colour quotas directly within piece-orbit candidate
domains: a candidate assignment is rejected if placing it on blank slots would require a colour that has
already exhausted its quota. This stops earlier placements from starving outer slots of required colours.

When an over-acceptance dead end does occur—where a tile resolves to zero legal colours (`choices.length === 0`)—the
UI surfaces the issue rather than leaving it silent. The affected sticker is highlighted with a red dashed border
(`[data-dead="true"]`), and the summary section renders an alert row (`.manual-state-dead-row`) featuring a one-click
**Undo** button (also bound to `Ctrl+Z` / `Cmd+Z` via `undoManualStateAction`). Clicking Undo or pressing the shortcut
erases the last user paint and instantly restarts verification to restore a viable path.

Furthermore, when the worker proves a singleton choice (`choices.length === 1`), the editor promotes that sticker
to auto-fill in place. Rather than triggering a full `renderManualStateEditor()` that bumps the generation, cancels
in-flight worker queries, and restarts at offset 0, the promote branch directly updates the sticker's DOM and draft
snapshot, marks its local constraint mates as dirty in the queue, and continues the existing verification chain via
`verifyNext(offset + 1)`. This avoids verification cycling and reduces verification cost from $O(k^2)$ to a single
$O(k)$ pass.

`explainManualStateColours` and `manualStateColourBudget` exist to make this legible rather than
mysterious. The first re-runs the sub-checks individually and names the one that rejected each
colour (`colourQuota`, `pieceOrbit`, `wingReachability`, `fixedCentre`); the second reports how
much budget each colour has left. Together they turn a blank grey tile into a stated cause.

## Tracing the colour dots

The dot pipeline has three stages that fail in ways that look identical on screen: the cheap
local value painted synchronously, the exact value the worker returns, and the debt bookkeeping
that decides whether a sticker is re-queued after a cancelled verification pass. A dark tile is
the same pixel whether verification never ran, was cancelled, or correctly found no legal colour.

`manual-state-trace.ts` narrates which one it is. It is off by default and free when off:

```js
cubeRosettaTraceDots(true);    // in the console; takes effect immediately and persists
cubeRosettaTraceDots(false);   // off again
```

`?traceDots=1` appended to the **URL** enables it for the loading session. Setting the
`cubeRosetta.traceDots` localStorage key directly also works, but the flag is read once at
module load, so that route needs a reload — `cubeRosettaTraceDots(true)` does not.

It logs each `render`, `queue`, `verify`, `promote`, `cancel`, and `skip` with the dot generation
and the outstanding verification debt, so a cancelled pass and its recovery are both visible. A
tile that resolves to no colour at all is reported through `dotTrace.deadTile`, which prints the
per-colour rejection reasons, the colour budget, and a replayable draft string.
