# Optimal 2×2 solver

CubeLab's 2×2 solver returns an **HTM-optimal** solution: no shorter sequence
of outer face turns exists. Every reachable 2×2 state can be solved in at most
11 HTM.

The browser does not generate a search database on the user's first request.
Instead, `scripts/generate-optimal-2x2-table.ts` deterministically produces a
versioned binary asset containing corner-permutation and corner-orientation
transition tables plus packed breadth-first pruning distances. The asset is
about 1.5 MiB and is fetched only by the dedicated solver worker on the first
2×2 request. The worker verifies its signature, coordinate dimensions, and
checksum before retaining it for its lifetime. The service worker caches the
asset after download, so later requests work offline.

Search uses iterative-deepening A*. The maximum of independent permutation and
orientation distances is admissible; therefore the first verified result at a
depth is shortest in the half-turn metric. The transition tables, pruning
tables, and a canonical order for commuting opposite-face turns keep this
search bounded without changing the set of shortest solutions. Returned moves
are parsed and replayed against the original state before being sent to the UI.

Regenerate the checked-in asset after changing its contract:

```sh
bun run solver:generate-2x2
```

Tests cover table size, schema and checksum validation, first-use loading, and
solution replay. The static filename contains the table version; incompatible
future data should use a new filename and update the worker constant.
