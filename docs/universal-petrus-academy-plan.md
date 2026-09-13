# Implementation and Refactoring Plan: Universal Petrus Solver for CubeLab Academy

Status: proposed implementation sequence, with a focused efficiency refactor accompanying this plan. Reviewed by puzzle-mechanics, curriculum, and repository-integration teammates on 2026-09-08.

This document supersedes the design in `scratch/impl-petrus-academy.md`. The original remains available as review history. Proposed APIs and files below are future work unless explicitly identified as existing. Completion of this document does not mean completion of the solver rollout.

## 1. Outcome and scope

Provide one coherent Academy experience for Petrus and Petrus-inspired lessons on 2×2, 3×3, 4×4, and 5×5, with verified instructions, honest capability reporting, bounded CPU and memory use, and shared infrastructure that avoids duplicate implementations.

“Universal” describes the supported puzzle family and shared Academy contract. It does not mean the same mechanics apply to every size, support for arbitrary NxN sizes, or that current bounded searches solve every legal scramble.

The team recommends the following routes:

| Puzzle | Initial curriculum | Automation boundary |
|---|---|---|
| 2×2 | Existing **Petrus-inspired** first square → back pair → finish | Preserve existing staged planner and exact final-stage solver; report search failures honestly. |
| 3×3 | Existing classical Petrus; enhanced COLL/EPLL variant | Preserve phase-verified solver, including its current search bounds. |
| 4×4 | **Reduction + Petrus**: centers → paired edges → parity normalization → reduced Petrus | Bounded reduction guidance and verified reduced finish initially; general reduction coverage is a separate backend deliverable. |
| 5×5 | **Reduction + Petrus**: centers → wings matched to midges → reduced Petrus | Bounded reduction guidance and verified reduced finish initially; no claim of a complete existing automatic reducer. |
| 4×4/5×5 practice | **Experimental blockbuilding drills** with explicit physical regions | A drill ends at its local verified milestone; it is not advertised as a complete direct-block solver. |

This changes two recommendations in the old plan: direct blockbuilding is no longer the default complete big-cube route, and 4×4 parity is normalized before entering the standard Petrus planner, rather than during EO. The reason is concrete: the old direct route has no center-completion algorithm, and the current 3×3 planner requires a legal reduced state. Direct blockbuilding remains an explicit research milestone in section 10.

No one-click arbitrary trigger, two-phase solution, or successful projection may be relabeled as a verified Petrus lesson. A general solver fallback must be a separately named user action and must not earn unverified Petrus milestones.

## 2. Team decisions and review disposition

Ratings measure implementation priority, not confidence in an existing implementation.

| Priority | Decision | Implementation consequence |
|---|---|---|
| 10/10 | Use a corner-only 2×2 curriculum | Reuse `docs/petrus-inspired-2x2-academy.md`; remove edge/EO/EP claims for this puzzle. |
| 10/10 | Make reduction and solved predicates explicit | Centers, complete edges, F2L, and full-puzzle solved status have independent checks. |
| 10/10 | Separate physical regions from reduced Petrus blocks | One coordinate source drives physical progress and focus; reduced goals use actual reduced pieces. |
| 10/10 | Execute only verified guidance | Replay and milestone contracts apply to every emitted action, including fallbacks and parity repairs. |
| 10/10 | Bound CPU, memory, and duplicate work | Demand-driven search, finite caches, cancellable workers, shared inspection, and measured budgets are release requirements. |
| 9/10 | Retain correct puzzle-specific parity | Typed 4×4 parity flags; 5×5 wing cases during pairing; invalid reduced 5×5 states remain diagnostics. |
| 9/10 | Refactor existing 5×5 code rather than recreate it | Repair current modules and migrate current callers/tests. |
| 9/10 | Consolidate shared contracts and sources of truth | Share guide evaluation, frame transforms, worker messages, and phase presentation; avoid a universal puzzle-mechanics engine. |
| 9/10 | Make tests observe replayed behavior | Compile before testing, ensure suite discovery, and test negative cases and resource bounds. |
| 8/10 | Keep anchor/frame ownership explicit | Preserve existing teaching conventions first; adaptive anchors are a later extension. |

Deferred: an unconditional nine-commutator bound, automatic direct-block completion, and EO-time 4×4 parity repair. These need algorithmic evidence beyond the existence of wing three-cycles. A 4trus comparison card must have verified sources and must not alias 4trus to the distinct route above.

## 3. Repository baseline

Source inspection takes precedence over names suggesting that a solver is complete.

| Existing area | Reuse | Required change |
|---|---|---|
| `src/client/two-by-two-academy.ts` and its worker route | Locked teaching frame, phase boundary verification, exact corner finish | Adapt to shared presentation/results without replacing the proven corner route. |
| `src/Solver/PetrusSolver.res`, `PetrusCases.res` | Classical/enhanced 3×3 phases and algorithms | Add budget instrumentation and a reusable reduced-size adapter; retain current phase contracts. |
| `src/Solver/Petrus5x5/*` | Physical region inspection and candidate guidance foundation | Correct geometry naming, remove unchecked guidance, fix full-state completion, and isolate drill behavior. |
| `src/Solver/Reduction4x4.res` | Center-frame checks, pairing inspection, reduction and repair foundation | Separate projection, parity inspection, and legal-state gate; support combined parity. |
| `src/Solver/FullReduction4x4.res` | Bounded center/wing orchestration and original-state replay | Expose a reduction-prefix result independently of its current two-phase finish; do not present its 24-step loops as completeness. |
| `src/Solver/Reduction5x5.res` | Center and wing guidance; strict midge-alignment handoff | Remove misleading reduced OLL/PLL repair dispatch; retain actual wing-pairing cases. |
| `src/Solver/ThreePhase4x4.res`, `src/Solver/Cube555/*` | Search-coordinate and conversion foundations | Audit implemented entry points and tables before committing to a complete reducer; `Solver555.res` currently supplies inspection/conversion. |
| `src/client/workers/solver.worker.ts`, `solver-client.ts` | Request/progress transport and worker cancellation patterns | Add a reduced-Petrus route and shared typed protocol; lazily own expensive workers. |
| `src/client/academy-request.ts`, `academy-target.ts` | Request invalidation and target handling | Include exact state, lesson frame, route, and objective in result applicability. |
| `src/client/petrus-5x5-academy.ts`, `converter.ts` | Existing panel and playback integration | Avoid hidden-panel search, duplicate inspection, and repeated phase prose. |
| `src/pages/index.astro`, `store.ts` | Actual Academy markup and persisted method selection | Integrate method metadata and migration. `academy.astro` is a wrapper around `index.astro`. |
| Existing Petrus tests and `vitest.config.ts` | Fixtures and current runner | Migrate `bun:test` Petrus imports and include solver TypeScript suites in the main test command. |

Immediate correctness debt includes constant phase-2/4/5 algorithms in `PetrusSolver555.res`, EO candidates that check only bad-edge count, and `BlockDetector5x5.res` using an outer projection for solved status and pairing alone for F2L progression. A separate confirmed axis-mapping defect consumes `(D,B,L)` as x/y/z faces: after a legal `R` turn on solved 5×5, independent physical enumeration counts 14 solved cubies at each right-side anchor while the detector reports 10. Add this legal-state regression during correctness containment. These remain correctness work even if a performance-only refactor preserves current outputs.

## 4. Puzzle-mechanics contracts

### 4.1 Coordinates and physical regions

Use grid coordinates `0..N-1`: x increases L→R, y D→U, and z B→F. At DBL, `(0,0,0)` is the anchor. Facelet mapping follows `x=L/R`, `y=D/U`, `z=B/F`; do not infer coordinate-axis order from a human-readable corner name.

For a corner region not extending to the opposite outer face, count only positions touching at least one of the three anchor faces. A region with dimensions `(a,b,c)` has `abc - (a-1)(b-1)(c-1)` visible cubies and `ab + ac + bc` outward facelets. When a region reaches the opposite outer face, enumerate the entire surface explicitly instead of applying this restricted formula.

| Region | Coordinate extent at DBL | Visible cubies | Outward facelets |
|---|---|---:|---:|
| Literal 4×4 corner 2×2×2 | `[0,1] × [0,1] × [0,1]` | 7 | 12 |
| Literal 4×4 corner 2×2×3, z expansion | `[0,1] × [0,1] × [0,1,2]` | 10 | 16 |
| Literal 5×5 corner 2×2×2 | `[0,1] × [0,1] × [0,1]` | 7 | 12 |
| Existing 5×5 drill, physical 3×3×3 shell | `[0,1,2]³` | 19 | 27 |
| Existing 5×5 drill expansion, physical 3×3×4 shell | `[0,1,2] × [0,1,2] × [0,1,2,3]` | 24 | 33 |

The 19-cubie shell contains one corner, three midges, three wings, three fixed centers, six plus-centers, and three X-centers. The literal 4×4 expansion contains one corner, four wings, and five centers; it does not reach the opposite corner at coordinate 3.

Rename legacy physical-drill labels and derive counters, facelet masks, and focus targets from the same region description. Generate immutable region metadata once for the supported size/anchor/axis combinations. Keep cached arrays private or expose defensive/readonly views; consumers must not corrupt later inspections. Audit current grid-to-face mapping using independently labeled stickers, since a uniformly solved cube can conceal mapping errors.

### 4.2 Reduced blocks

A reduced Petrus 2×2×2 goal means one solved corner and three complete solved edges in the lesson frame, with reduction invariants already satisfied. Its 2×2×3 expansion means two corners and five complete edges. These are virtual 3×3 goals, not the literal physical regions above. Standard block dimensions and the classical seven-stage sequence come from [Lars Petrus's tutorial](https://lar5.com/cube/).

Highlight all physical members of each selected virtual edge. Indicate center reduction separately; do not imply that a 19-cubie physical region is the entire reduced block. Keep the existing 3×3 solver's internal/display-frame convention initially and transform predicates, turns, and highlights together.

### 4.3 Reduction gates and parity

Implement three separate operations: inspect reduction completeness, project a geometrically reduced cube, and validate the projected cubie state.

- **4×4:** Require all six monochrome center blocks in a valid color frame and all twelve dedges paired on both visible sides. Inspect edge-orientation parity and corner/edge permutation parity as independent flags. Reject malformed inventory, duplicate pieces, or invalid corner orientation as invalid states, not parity cases.
- **4×4 repair:** Normalize OLL then PLL parity at the handoff, reinspecting after each action. A verified OLL repair may leave PLL parity present. Check that the targeted flag clears, centers and pairing survive, and no new invalidity appears. Bound repair attempts and reject repeated state/flag combinations. Standard Petrus starts only when both flags clear and the reduced state validates.
- **5×5:** Require every center to match its fixed core and both wings of every edge to match its midge on both stickers. Teach last-two-edge wing cases during pairing. For a legal fully reduced state, reduced edge flips and corner/edge permutation have the ordinary 3×3 constraints; reduced OLL/PLL violations require invalid-state/projection diagnostics. These constraints are documented in [Jaap's 5×5 analysis](https://www.jaapsch.net/puzzles/cube5.htm).

Replace control flow based on error-message prefixes with typed diagnostics. Keep human-readable error text at presentation boundaries. Update 5×5 reduction callers and tests along with Petrus code, so the shared reducer does not retain a contradictory parity lesson.

### 4.4 Frames and solved status

Represent a teaching frame explicitly as a proper cube orientation and a mapping between canonical and displayed faces. Camera orbit is presentation only. Whole-cube rotations in a returned algorithm must either remain in playback or be consistently conjugated out of every subsequent move and predicate.

Preserve the existing four-frame choice for 2×2. For 3×3 and reduced big cubes, initially use the existing Petrus convention; lock it for the Petrus segment. Select a big-cube drill anchor once at drill start. Switching targets or manually breaking prerequisites invalidates the guide; it does not silently choose a more convenient anchor.

Accept a physically valid, monochrome full cube in an allowed whole-cube orientation as solved. Validate all `6N²` stickers, not only projected corners/midges. Milestone goals can be frame-specific while final success is orientation-equivalent.

## 5. Curriculum and interaction

### 5.1 Lesson sequence

| Route | Phase sequence and completion criteria |
|---|---|
| 2×2 Petrus-inspired | First square: the declared two-corner relation holds. Back pair: first layer relation holds while the square survives. Finish: all faces monochrome. Use the existing locked-frame route contracts. |
| 3×3 classical | 222 block → 223 block → EO with block preserved → complete F2L with EO preserved → position LL corners → orient LL corners → permute LL edges. |
| 3×3 enhanced | Same early goals; use the existing verified COLL/EPLL grouping for the last layer. |
| 4×4 Reduction + Petrus | Centers complete → all dedges paired while centers survive → conditional parity normalization → the selected 3×3 Petrus sequence on the reduced cube. |
| 5×5 Reduction + Petrus | Centers complete → all wing/midge triples complete, including L2E cases → legal reduction handoff → the selected 3×3 Petrus sequence. |

Use stable phase IDs, not a universal five-phase enum or hard-coded display numbers. Completed phases may be empty if their goal already holds. A legal manual move that breaks an earlier milestone returns the lesson to the earliest unmet prerequisite in the same frame.

Each card has one observable goal, relevant pieces, protected milestones, completion evidence, and a conceptual hint. Progressive help reveals target → spatial idea → verified preview → explicit Apply. Search-budget exhaustion leaves inspection and manual practice available. A conceptual hint has no executable algorithm field.

Preservation normally applies at a complete guide/algorithm boundary; inner moves of a commutator may temporarily disturb a structure. State stricter per-turn preservation only when verified. During playback, show the active sequence and do not treat its temporary interior state as a completed new phase.

### 5.2 Physical drills

Retain 4×4 literal 222/223 and 5×5 physical 333/334 shells as separately named experiments. Each drill records its exact region, anchor, starting phase, protected set, setup moves, and verified endpoint. Generate starts by legal moves and assert that a drill actually enters its intended phase under frame selection.

For commutator lessons, precompute moved-piece support with uniquely labeled stickers. Candidate acceptance uses the current protected set and a full replay. The reviewed `[2R, U R' U']` is a wing three-cycle but moves a wing in a UFR block, so three-cycle purity does not establish universal block preservation. Display actual cycle count for a verified plan, never an unproven “at most nine” estimate.

## 6. Shared architecture and duplication removal

Share transport and mathematical contracts where behavior is the same. Keep 2×2 corner mechanics, 4×4 parity, 5×5 center orbits, and physical-drill region definitions puzzle-specific.

| Duplication to remove | Single owner | Consumers |
|---|---|---|
| Repeated candidate parsing and replay/selection loops | Solver candidate preparation and typed evaluation helper | Physical block and EO candidate searches |
| Repeated region construction/counts | Region geometry module | Detector, counters, protected masks, focus rendering |
| Repeated full inspection during status and planning | One per-state inspection value | Status mapping and guide planner |
| Repeated phase titles/instructions in converter and bridge | Route phase definitions | Cards, progress, hints, accessible labels |
| Repeated reduction→3×3→NxN replay orchestration | Reduced-Petrus adapter | 4×4 and 5×5 worker routes |
| Repeated worker request/result unions | Shared TypeScript worker protocol | Worker and client wrapper |
| Repeated method-name conditional chains | Narrow Academy method metadata | Size eligibility, source selection, controls, panel lookup |
| Repeated string-based failure dispatch | Typed solver outcomes | Worker, UI, tests |

Extract helpers only for identified duplication; avoid converting the entire converter or every solver to a new framework. Migrate one caller family at a time and remove superseded paths after all their consumers move.

### 6.1 Proposed core boundaries

- `src/Solver/PetrusAcademy/PetrusAcademyTypes.res`: route/phase IDs, inspection evidence, frame, guide outcome, budget, and diagnostic types.
- `src/Solver/PetrusAcademy/PetrusGeometry.res`: shared coordinate mapping and finite physical region metadata; migrate legacy 5×5 geometry through compatibility wrappers initially.
- `src/Solver/PetrusAcademy/PetrusGuide.res`: candidate preparation and replay acceptance; score only after prerequisite checks.
- `src/Solver/PetrusAcademy/ReducedPetrus.res`: reduction adapter dispatch, typed handoff, move lifting, phase replay, and full-puzzle completion.
- Existing `Reduction4x4.res` / `Reduction5x5.res`: own puzzle-specific completeness, projection, and parity rules.
- Existing `PetrusSolver.res`: owns classical/enhanced 3×3 algorithms and phase boundaries. Reuse this solver rather than reimplementing last-layer libraries per size.
- Existing `Petrus5x5/*`: initially retain public wrappers; migrate physical drill logic into explicitly named drill APIs and retire misleading production phase semantics.

These are proposed module boundaries, not a requirement to create a file for every record or a second copy of existing APIs. If a helper fits an existing module without coupling unrelated consumers, extend that module instead.

### 6.2 Guide and request contracts

Planning outcomes are a tagged union: `Ready`, `Solved`, `NoVerifiedGuide`, `BudgetExceeded`, `Unsupported`, `InvalidState`, and `Cancelled`. `Searching` belongs to worker/UI lifecycle. A conceptual hint is presentation data associated with the current phase, not a successful plan.

A `Ready` guide contains route/phase ID, immutable input identity, frame/objective identity, algorithm, protected prerequisites, objective evidence before/after, and an endpoint identity. Only the verifier constructs this outcome. Inspection inputs must belong to the exact state being planned; keep unsafe “plan with arbitrary inspection” entry points private to the adapter.

For each emitted guide:

1. Confirm size, input structure, supported notation, frame, and phase prerequisites.
2. Replay on the actual input cube.
3. Recheck protected milestone predicates at the declared action boundary.
4. Require the requested goal or a declared measurable subgoal to improve. Search may use temporarily non-improving internal moves, but a returned complete guide must meet its contract.
5. Serialize and preserve the verified endpoint. Return a bounded failure if no candidate qualifies.

For a complete route, replay every declared phase boundary and the final full cube. Detect repeated `(state, frame, phase, objective)` during multi-step planning. A sequence of individually improving hints does not by itself prove complete solving coverage.

### 6.3 Reduced move lifting

Only apply the standard planner after a legal reduced gate. Preserve its phase metadata and any normalization rotations. Explicitly map outer face turns and whole-cube rotations to the original size; reject size-dependent slice/wide instructions unless their mapping is implemented and verified. Preserve pauses and annotations without treating them as turns.

For every supported outer move/rotation `m`, test:

`project(applyN(state, lift(m))) == apply3(project(state), m)`

Run the same equality on composed algorithms and all supported frames. Replay lifted phase boundaries on the original big cube, rechecking centers and pairing; finish with a full NxN solved check. Never obtain a whole-cube two-phase solution and subdivide it into fictional Petrus stages.

## 7. CPU and memory efficiency

Correctness checks remain mandatory. Optimize the representation and repeated work around them rather than skipping verification.

### 7.1 Immediate low-risk refactoring

The accompanying implementation pass targets existing 5×5 code: prepare fixed candidate algorithms once, reuse private finite geometry metadata, avoid duplicate status/planner inspection, skip work for inactive panels, and remove repeated phase presentation where practical. Preserve public behavior in this pass; document unrelated correctness debt instead of silently treating an optimization as the complete redesign.

Measure unchanged, changed, and reconstructed-equivalent states. Any per-panel cache must have a fixed capacity, include all state fields relevant to semantics, invalidate on content changes, and be owned by the panel/session. Reference identity alone is insufficient when a caller can mutate a cube object. Returned arrays must not let callers mutate shared cached solver state.

### 7.2 Search architecture

- Inspection is a cheap pure operation. Do not enumerate candidate moves from the general render path or run any solver for a hidden method panel.
- Run searches on explicit request in workers. Coalesce obsolete requests so repeated source updates cannot queue an unbounded backlog.
- Initially permit one active heavy solver search per page and at most one pending latest request. Include existing general-solver clients in ownership and memory accounting when switching routes; do not retain duplicate table sets outside an Academy-only cap. Start workers lazily; retain at most one warmed heavy solver worker and release it on route disposal or memory pressure. Terminate/recreate the dedicated worker when synchronous search cannot observe cancellation.
- Pass explicit node, elapsed-time, maximum-depth, and memory budgets through search APIs. Check budgets within search, including table initialization; worker termination is the final cancellation mechanism, not the normal budget check.
- Reuse immutable move tables and candidate ASTs within their owner. Prefer compact typed arrays and integer coordinates for search; avoid cloning full facelet arrays or constructing notation strings at every node.
- Use reversible moves or reusable scratch buffers only after move/unmove and sibling-isolation tests. Retain full-state replay at candidate/phase acceptance boundaries.
- Prefer depth-first/IDA* strategies with bounded transposition storage where the heuristic permits. Do not allocate an unbounded BFS frontier or retain every explored full state.
- Prune inverse/repeated equivalent turns and use symmetry only when it preserves the locked lesson goals. Generic symmetry reduction can incorrectly identify distinct protected-frame states.
- Precompute pruning tables offline only where measurements justify their download and resident cost. Version artifacts and validate transitions against the canonical move executor. Share one resident table set; avoid allocating the same large tables in many workers.
- Keep browser/render objects out of worker state. Send compact facelets or cubie arrays plus frame/objective metadata; transfer buffers only when ownership is clear and the UI retains what it needs.

### 7.3 Budgets and measurements

Initial engineering targets below are proposed budgets, not measured capabilities of the current solver. Record runtime, device, cold/warm status, and fixture corpus before claiming a speedup.

| Resource | Initial target / policy | Verification |
|---|---|---|
| Inactive Petrus panel | Zero Petrus planning calls | Spy/counter test across ordinary render updates |
| Unchanged active state | At most one inspection and one requested guide computation per unchanged active key while cached; A→B→A may recompute | Call-count tests including equivalent reconstructed states |
| State-result cache | One current state/inspection/guide per panel; replace previous entry | Mutation, invalidation, and retained-entry tests |
| Main-thread inspection | Target p95 under 16 ms on recorded reference hardware | Separate inspection benchmark; never hide search in this metric |
| Interactive guide search | Initial 2 s wall-time and 250,000 expanded-node caps, whichever occurs first | Deterministic node-limit tests; timed runs reported separately |
| Longer route search | Explicit opt-in; initial 30 s cap, cancellable | Cancellation/progress tests and fixed-corpus benchmark |
| Search scratch/transposition memory | Initial 32 MiB per active job; finite eviction | Allocation accounting and maximum-capacity tests |
| Resident solver tables | Initial 64 MiB total across retained heavy solver workers, including existing general-solver routes | Asset-size and resident-byte report before enabling a backend |
| Cancellation | Target acknowledgement and cooperative stop/worker termination under 100 ms; obsolete result never applied | Browser test with a deliberately slow job; verify obsolete node counts stop growing |

If a backend cannot fit these limits, return `BudgetExceeded`, measure the requirement, and revise its design or explicitly version its product budget. Never silently lift caps. Completion coverage and memory limits may conflict; this is a tracked backend deliverable, not grounds to claim a bounded planner is complete.

Create a reproducible Petrus benchmark command with fixed legal fixtures: solved, physical-drill candidates, EO, reduced classical/enhanced finish, 4×4 parity cases, and inner-slice reduction states. Report median/p95, nodes, generated candidates, replay count, cold table initialization, table bytes, and peak/retained memory where the runtime supports measurement. Distinguish allocation accounting from noisy process heap measurements. Keep benchmark loops bounded and exclude input generation from timed search.

## 8. Client, worker, and persistence integration

Add a shared protocol file under `src/client/workers/` for reduced-Petrus requests and outcomes. Extend the existing progress-client pattern instead of creating a parallel messaging system. Request identity includes generation, state content, size, route/variant, frame, objective, and relevant notation settings. Ignore stale progress as well as stale final responses.

Before Apply, compare the verified guide's input identity with the live puzzle. Any manual turn, scramble, undo, size/method/frame change, or source edit invalidates that guide. Worker failure, cancellation, and disposal release listeners and pending promises. Do not retain every completed search result for navigation.

Create a narrow method registry, initially for Petrus and reduction routes, recording supported sizes, state source, panel key, worker capability, and phase definitions. Use it to remove repeated method checks in converter source selection, cache identity, shared controls, comparison eligibility, and focus handling. Keep existing public method IDs compatible.

- Preserve `twoByTwoPetrus`, `petrus`, and `enhancedPetrus`.
- Add `petrus4x4` with the label **4×4 Reduction + Petrus**.
- Migrate `petrus5x5` to the label **5×5 Reduction + Petrus**, with a curriculum-version change. Reinspect saved states and reset incompatible phase/frame progress; never translate an old numeric phase blindly.
- Give experimental drills distinct route IDs. Do not normalize `4trus` to `petrus4x4`.
- Render panels in `index.astro` using existing `data-academy-method` and `data-academy-method-panel` conventions. Keep `academy.astro` as the route wrapper.
- Store phase definitions once. Render titles/instructions from those definitions and attach runtime evidence separately. Derive counters from inspected totals.
- Keep conceptual hints available for unsupported automatic steps. Show Apply only for `Ready`; show a plain, specific reason for budget exhaustion or invalid input.
- Preserve keyboard operation, focus after async completion, and polite live status announcements. Dim irrelevant cubies without making color the only indicator.

## 9. Implementation sequence and acceptance gates

Implement these as reviewable increments. Later increments must not be implied complete by an earlier optimization or UI merge.

For subsequent implementation, use TDD: write a focused behavioral regression first, observe its intended failure, make the smallest passing change, then refactor under passing tests. For behavior-preserving refactors, establish characterization/equivalence evidence before changing implementation. Update this document and the relevant feature documentation as each increment lands. Have a teammate independently review the final code and tests before committing. Use focused conventional commits, separating solver internals, client integration, and design documentation when those changes have independent review boundaries. Record actual verification; do not describe earlier test-after work retrospectively as TDD.

| Increment | Work and primary files | Exit gate |
|---|---|---|
| A — Efficiency baseline and duplication reduction | Existing `Petrus5x5/*`, client bridge/converter, focused tests/benchmark | Equivalent outputs for legal fixed fixtures; less repeated parsing/inspection; bounded cache; inactive panel does no search. Record remaining correctness debt. |
| B — Correctness containment | `BlockDetector5x5.res`, `PetrusSolver555.res`, bridge and panel | No unchecked executable fallback; full-state solved check; explicit prerequisites; old direct route labeled experimental with truthful no-guide states. |
| C — Geometry, frames, and shared contracts | Proposed shared types/geometry/guide modules; migrate old wrappers | Independent coordinate fixtures, all anchors/axes, frame round-trips, one source for counts/focus; no duplicated candidate-selection policy. |
| D — Reduction gates and parity | `Reduction4x4.res`, `Reduction5x5.res`, their callers/tests | Typed diagnostics; combined 4×4 parity handled; legal 5×5 reduction never routed through a 4×4-style LL repair. |
| E — Reduced-Petrus adapter | `ReducedPetrus.res`, existing 3×3 solver | Move-lifting identity, every phase replayed on original size, actual whole puzzle solved; search failures remain explicit. |
| F — Workers, budgets, and UI | Shared protocol, worker/client, method registry, store, converter, markup | Demand-driven bounded planning; lazy worker lifecycle; stale Apply rejected; persistence migrated; progressive hints render from one definition. |
| G — Coverage and release | Test suites, benchmark script, browser tests, docs | All supported routes/drills pass their defined corpus and resource targets; capability labels match measured support. |
| H — General automatic reduction | `FullReduction4x4.res`, `ThreePhase4x4.res`, `Reduction5x5.res`, `Cube555/*` as justified | Independently verified reduction backend coverage and termination strategy, versioned tables, resource measurements, and original-state replay. |

For H, first expose a reduction-prefix API from the existing 4×4 orchestrator, returning boundary states and phases before the two-phase finish. Then close center/wing search coverage with a documented complete algorithm or clearly bounded capability. For 5×5, inventory conversion, coordinate transitions, pruning/search implementations, and orchestration before selecting the missing backend work. Preserve existing upstream attribution when reusing translated solver components.

Do not promise arbitrary-scramble automatic completion based on a finite random test set. A complete method needs a justified algorithmic coverage argument; a production bounded implementation additionally needs a measured resource envelope and honest failure outcomes. Until H closes, ship the curriculum with manual continuation and bounded automated assistance.

## 10. Direct-block research track

The research outcome is a concrete direct-first route, not a new name for reduction. To promote experiments into a complete route, supply:

1. A physical region and fixed color/frame contract, plus an actual block-building algorithm.
2. A center-completion algorithm that preserves the declared block at the stated boundaries.
3. Protected-wing pairing with explicit support sets, setup moves, exceptional cases, and parity treatment.
4. A verified transition from that physical block to the full reduced Petrus 222/223 goal.
5. Termination/coverage reasoning, CPU/memory budgets, and legal-scramble replay evidence.

An ordinary reduction fallback that destroys the original block is allowed only as a clearly explained route switch. It does not prove the original preservation claim. Evaluate a 4trus curriculum separately with authoritative source verification before adding its method ID or comparison text.

## 11. Verification

### 11.1 Test runner and migration

Use the repository's main `npm test` command, which compiles ReScript and runs Vitest. The accompanying refactor migrates the two Petrus suites from `bun:test` to `vitest` and explicitly includes `test/Solver/petrus-5x5.test.ts` in discovery. Broaden the pattern only after migrating the remaining unrelated Bun-only solver suite. Keep one documented runner for Petrus tests.

During implementation, run `npm run res:build` before targeted Vitest suites that import generated `.res.mjs` files. Rebuild generated modules through the compiler, never edit them manually. Verify production integration with `npm run build` and the relevant Playwright Academy cases. Avoid a fixed test-count promise.

### 11.2 Required evidence

- **Geometry:** exact independent coordinates, orbit composition, facelet mapping, uniqueness, and totals; all eight physical anchors and all three expansion axes. Include asymmetric/labeled states, not only solved colors.
- **Frames:** every proper cube orientation, move/inverse round-trip, stable lesson frame, camera changes, and rotated final solved states.
- **Reduction:** paired wings with unfinished centers; center-complete but incomplete edges; 5×5 wings agreeing with each other but disagreeing with their midge; solved outer pieces with mixed inner centers; invalid color frame and invalid cubie inventory.
- **Parity:** reachable 4×4 OLL-only, PLL-only, and combined cases; targeted repair preserves reduction while allowing the other flag to remain. Generate legal 5×5 L2E cases separately from deliberately impossible manual states.
- **Guidance:** every algorithm replays, preserves prerequisites, advances its declared objective, and cannot execute on a changed state. No candidate means no algorithm. Test escape paths needing temporary non-improving internal moves.
- **Curriculum:** paired edges do not imply F2L, EO does not imply F2L, and an outer projection does not imply full completion. Validate each drill's initial phase and endpoint independently.
- **Reduced adapter:** projection/lift identity for all supported moves; frame normalization retained; unsupported slice semantics rejected; phase and final replay on the actual NxN cube.
- **Integration:** hidden panels do not search; equivalent states reuse bounded work; mutated state invalidates it; cancellation/disposal settles requests; stale progress/results/Apply are rejected; old saved method IDs load coherently.
- **Efficiency:** fixed-capacity caches, finite candidate preparation, node-budget exit, no accumulating workers/listeners/tables across repeated route changes, cold/warm benchmark and original-state output equivalence.

Use seeded legal scrambles and targeted adversarial fixtures. Include repeated-step route tests with explicit step/node limits and cycle detection. Random coverage supplements independently justified predicates; it does not replace them. Avoid brittle CI timing assertions: enforce deterministic budgets and call counts in CI, and report timings on a recorded reference machine.

## 12. Definition of done

The initial Academy release is complete when 2×2/3×3 behavior is preserved, 4×4/5×5 Reduction + Petrus has correct inspection and a verified reduced finish, conceptual guidance cannot masquerade as executable output, and all resource/integration gates above pass. Experimental drills have separate names and bounded local contracts.

The general automatic solver milestone is complete only after backend coverage, phase preservation, full-state replay, and resource limits are demonstrated together. The direct-block solver milestone additionally requires the research obligations in section 10. Record these as separate capabilities so partial implementation cannot be mistaken for completion of the universal-solver objective.

## 13. Execution record — 2026-09-08

### Delivered in the accompanying focused refactor

- Prepared the 24 block and eight EO candidate algorithms once; shared their replay/scoring loop. Returned guide algorithms remain independent mutable values.
- Reused private finite geometry tables for eight anchors and 24 expansions, and removed the duplicate DBL inspection during anchor selection.
- Added `evaluatePetrusStep5x5` and a shared client status mapper, so a cache miss uses one inspection for status and planning. Kept standalone public inspection/planning APIs compatible.
- Added a one-entry, per-panel cache keyed by all 150 facelets. It recognizes reconstructed equivalent states, invalidates in-place changes, releases its entry when inactive/invalid, and protects cached results from caller mutation.
- Skipped Petrus work while its panel is inactive; refreshed correctly on activation with existing workspace moves. Reused phase definitions for repeated titles/instructions.
- Registered the Petrus core suite with Vitest and migrated both Petrus suites to that runner. Added core mutation-isolation/equivalence tests, client cache regressions, and a focused browser activation/refresh test.
- Added `npm run benchmark:petrus`, which compiles before measuring six fixed legal states with bounded warmup and 1,200 calls per operation.

### TDD and review evidence

The earlier efficiency changes used characterization/equivalence checks and tests added alongside implementation; they are not recorded as a full tests-first exercise. After the explicit TDD request, the sparse-facelet regression was written and run first. It failed because `Array.every` skipped missing entries and permitted evaluation. Replacing that validation with a single `for...of` validation/key-building pass made the test pass, including cache invalidation on malformed input.

The integration reviewer approved the core changes after checking candidate ordering, fixed cache bounds, output mutation isolation, generated code, and the 10-test core suite. The mechanics reviewer approved the client changes after checking identity, activation, sparse-input rejection, and the eight-test bridge suite. The curriculum reviewer approved the plan's scope and required the explicit delivered/pending distinction recorded here.

### Measured evidence and remaining work

The benchmark's inspection/guide fingerprint is unchanged from the pre-refactor legal-fixture baseline: `8e7eb6ed6a5ad1c12cb4b91223e9f4d06ab8bf7bdd3eebfd3606a35eb8e72353`. A local Bun 1.4.2 sample measured 22 ms for 1,200 inspections and 407 ms for 1,200 plans. Timings varied across runs; these are aggregate warmed measurements, not p95 latency or a general speedup guarantee. Post-GC retained-heap deltas do not measure total static cache memory or peak memory; no overall memory-reduction claim is made.

The fixed-capacity reuse and avoided duplicate calls are implemented. Active-panel cache misses still plan synchronously. Demand-driven workers, full resource accounting, cancellation targets, general reduction coverage, and the correctness/curriculum increments remain planned. The existing animation-frame-delayed input synchronization also needs a stale/double-Apply regression before claiming the stronger Apply contract in section 8.

Pre-commit verification: `npm test` passed 601 tests across 61 suites; `npm run build` passed with the existing large-chunk warning; the focused `petrus-5x5-activation.playwright.mjs` browser test passed; `git diff --check` passed. The benchmark command completed with the unchanged fingerprint above. These checks validate this increment, not the unimplemented release gates.

## 14. Follow-up — guidance placement and big-cube startup

The next requested increment moves current guidance and its actions above lesson details across all Academy sizes and addresses 4×4/5×5 startup delays. The investigation reproduced ten eager solver workers and hidden reduction panels performing synchronous center/wing searches. See [Academy guidance placement and big-cube loading](academy-performance.md) for the root-cause evidence, TDD regressions, implementation boundaries, and verification record. This follow-up does not imply completion of the mechanics/curriculum redesign.

## 15. Follow-up — looping experimental 5×5 guidance

A reported snapshot exposed the unchecked block fallback cycle and incorrect coordinate-to-face scoring. Both are corrected with independent geometry and replay regressions. Block search now considers all outer and adjacent inner faces, with a bounded two-move setup pass. Expansion/EO preserve completed block milestones; unsupported or exhausted phases return explicit non-executable guidance. Solved requires all stickers solved. See [the reproduction and resource bounds](academy-performance.md#stuck-5×5-petrus-guide-correctness-follow-up).

This deliberately changes behavior, unlike increment A's equivalence refactor. The benchmark fingerprint is now `6791789f30119a763e8f1e4e942ee46706530676ccabe2d11e5232183d5c44d7`; a local warmed sample measured 21 ms for 1,200 inspections and 504 ms for 1,200 plans. These samples do not establish general latency or memory guarantees. Complete direct-block solving, correct phase/curriculum prerequisites, and general Reduction + Petrus remain unfinished; stopping honestly is not a universal-solver implementation.
