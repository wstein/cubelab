# Academy guidance placement and big-cube loading

## User-facing behavior

The current instruction belongs immediately below each Academy method heading, before introductory text and phase details. For 4×4 reduction, 5×5 reduction, and 5×5 Petrus, the next-guide text and its actions stay together in this position. The 2×2 and 3×3 routes keep their existing shared generation/playback controls and expose their current instruction above the lesson details.

Keep this as document order, not CSS reordering: keyboard and assistive-technology navigation should follow the same order as the visible page. All twelve existing method panels retain their data selectors.

## Root cause of slow 4×4/5×5 startup

The issue was application startup and synchronous CPU work, rather than evidence of a slow network endpoint:

1. Converter initialization created ten copies of the general solver worker before the user requested a solve. Each worker loads the solver module graph in its own execution context. A browser regression reproduced ten starts on both 4×4 and 5×5 converter URLs.
2. `updateAcademySource` rendered the reduction panels even when the Academy tab or that method was hidden. Those render functions called center/wing planning synchronously. Consequently, restoring a scrambled big cube could run a bounded search on the interaction thread before the user opened its lesson.
3. Rendering and Apply could repeat planning for the same cube. A search result needs to be retained only for the current state and objective, then invalidated when either changes.

The startup-worker observation was first reproduced against the existing local development server. Production verification uses an isolated preview port so it cannot silently reuse that development server. Timings from different server modes are not compared as a speedup measurement.

A local Node measurement of the legal setup `2R 2F' 2D` separated inspection from planning: 4×4 inspection took about 0.14 ms while center planning took 544 ms; 5×5 inspection took about 0.16 ms while center planning took 1,137 ms. These are single-fixture diagnostic samples, not latency guarantees. They explain why running the planner from a hidden panel's render path can visibly stall startup.

## Implementation boundaries

- Start solver workers lazily on their first request; attaching listeners or disposing an unused client must not start a worker.
- Reuse the established client request/response handling, including startup failures and pending-request rejection on termination.
- Inspect only the active reduction panel. Move center/wing guide search to a worker so the lesson can paint and remain interactive while its guide is prepared.
- Keep at most the current guide request/result, keyed by cube content, size, and operation. Superseded work must be cancelled and stale responses ignored.
- Apply the displayed result only to the state it was generated from. Moving guide work off the UI thread must not introduce a second hidden search on Apply.
- Retain existing algorithm and phase semantics. Geometry/curriculum corrections remain tracked in [the universal Petrus plan](universal-petrus-academy-plan.md).

This removes unnecessary startup work and UI-thread search. It does not establish that every reduction search is fast or complete, or that all solver families share one resident table set after use.

## TDD and verification

The layout ordering test was added first and failed against the old markup. Reordering current guidance and guide actions made it pass across all twelve panels.

The startup browser test was added first and failed on both sizes, observing ten solver workers where zero unused workers were expected. It also records navigation-to-ready elapsed time as diagnostic information, without a brittle machine-dependent timing assertion.

Worker lifecycle and asynchronous guide tests cover lazy startup, reuse, startup failure, inactive panels, superseded requests, and cached results. Browser coverage must include initial big-cube loading, visible guide preparation, guide/action placement before phases, and state changes while a search is pending.

Final verification on 2026-09-08:

- `bun run test`: 617 tests passed across 63 suites.
- `bun run build`: production build passed.
- Isolated production preview on port 4339: all seven loading/guide/Petrus browser tests passed. The two guide tests also passed after strengthening Apply checks to require the exact displayed algorithm.
- The initial-load browser assertions now observe zero unused solver workers on both big-cube converter URLs. Active lessons create a guide worker when needed.
- Six additional existing smoke tests: three passed; three failed on existing URL/status expectations. All three failures reproduced unchanged against archived commit `4aae23e` on isolated port 4340: two expect the old `tab=academy&method=beginner` URL and one expects a status without the existing `+ moves` suffix. These failures are not attributed to this refactor.
- Team code review covered document order, asynchronous cache identity/cancellation, worker lifecycle and pending-request cleanup, and browser assertions. `git diff --check` passed before commits.

The layout, lazy-worker, guide-cache, and pending-request-cleanup regressions each had an observed failing test before their fixes. No broad curriculum changes or unrelated smart-cube edits are included in this increment.

## Stuck 5×5 Petrus guide: correctness follow-up

The reported 150-facelet snapshot reproduced a cycle: two improving suggestions were followed by the unchecked fallback `U R U' R'`, whose six repetitions returned to the same state. Separately, block scoring bound vertical/depth/horizontal faces to X/Y/Z axes in the wrong order. An independent physical-sticker check identifies UBR (8/19), not the previously reported UFL, as the best anchor for this snapshot.

Automatic guides now require replay-verified improvement. All outer faces and adjacent inner slices are considered, with a bounded two-move setup search when direct block candidates fail. Expansion preserves the corner block; EO guidance preserves both completed blocks. Unchecked phase fallbacks are removed. The guide remains visible when no verified continuation is found, but has neither a Suggested algorithm nor an Apply button. This is an explicit search/curriculum limit, not a claim that the cube is unsolvable. Full-cube sticker completion is required before reporting solved.

The search streams candidates rather than retaining a search tree: at most 1,374 candidate replays per block request, constant live replay-state storage, and cached parsed moves. The existing one-entry UI cache still avoids repeated planning for unchanged states. For the reported snapshot, the corrected planner advances through `B'`, `2B2`, `2F2 R`, and `U' B` (8→9→10→11→12 pieces), then honestly reports its bounded-search limit. Local Node samples took roughly 1–4 ms for direct searches and 10–16 ms for the two-move search; these are diagnostic samples, not browser latency guarantees.

Regression coverage includes the exact snapshot, independent geometry, repeated guide application, non-executable search exhaustion, and centre-only unsolved states. The browser search-exhaustion assertion was observed failing before the UI/core correction. This does not complete the experimental direct-block curriculum; the Reduction + Petrus implementation remains tracked in the universal plan.

Follow-up verification: 624 tests passed across 63 suites; production build passed; all nine focused browser tests passed, including exact-snapshot Apply progress and visible search exhaustion. Independent team review found no blocking code issues. `git diff --check` passed. The old activation test was updated because a single outer turn previously received an unchecked last-layer placeholder; it now correctly expects non-executable guidance for that unsupported phase.
