# 4×4 solver performance specification

## Status

This is the acceptance contract for a future complete 4×4 solver. The current
Converter action only finishes an already reduced state and does not meet this
contract.

## Metrics

Search and pruning tables use **STM**: every non-rotation slice or block turn
costs one. Results and release gates use **OBTM**: an outer block turn costs
one and an isolated inner slice costs two. Every result reports both named
metrics; 4×4 output must never be labelled HTM.

## Quality gates

| Tier | Mean OBTM | Maximum OBTM |
| --- | ---: | ---: |
| Ship gate | ≤ 85 | ≤ 105 |
| v1 target | ≤ 70 | ≤ 85 |
| Stretch | ≤ 60 | ≤ 75 |

The solver must solve every corpus state deterministically. A failed state is a
hard gate failure, not a partial score.

## Latency gates

| Scenario | p50 | p95 | Hard cap |
| --- | ---: | ---: | ---: |
| Warm solve, tables resident | 400 ms | 1.5 s | 5 s |
| Cold start, including table load | 2 s | 4 s | 8 s |

All search, table loading, progress reporting, and cancellation run in the
existing solver worker.

## Pending product decisions

Two choices remain intentionally unresolved:

1. Is the 400 ms warm p50 an interactive-Academy requirement, or may a
   click-and-wait action spend more time to reduce OBTM?
2. Are pruning tables shipped in the application bundle or generated on first
   use? The listed cold-start budget assumes shipped tables, but the bundle-size
   trade-off needs an explicit product decision.

The benchmark report must record the selected interaction profile and table
delivery mode. It cannot certify the latency gates until both are decided.

## Corpus and records

`test/fixtures/reduction-4x4-benchmark.json` is the versioned corpus manifest.
It must contain 200 deterministic WCA-legal random-state scrambles for CI and
1,000 for release measurement. Each record contains a stable identifier, seed,
facelets, parity labels, and result fields for STM, OBTM, elapsed time, and
per-phase breakdown. CI asserts explicit OLL and PLL parity coverage rather
than relying on sampling.

The harness must reject an incomplete corpus and must record a solver/table
version with every run, making regressions bisectable.

`bun run benchmark:4x4` and `bun run benchmark:4x4:release` are the CI and
release entry points. The committed scaffold intentionally exits with an error
until a compliant corpus has been generated; an empty corpus must not produce
misleading performance numbers.
