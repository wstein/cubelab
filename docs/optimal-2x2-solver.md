# Optimal 2×2 solver

CubeLab's 2×2 solver returns an **HTM-optimal** solution: no shorter sequence
of outer face turns exists. Every reachable 2×2 state can be solved in at most
11 HTM.

The browser does not generate a search database on the user's first request.
Instead, `scripts/generate-optimal-2x2-table.ts` deterministically produces a
versioned binary asset containing the exact packed distance for each of the
3,674,160 rotation-canonical corner states. The asset is about 1.8 MiB and is
fetched only by the dedicated solver worker on the first
2×2 request. The worker verifies its signature, coordinate dimensions, and
checksum before retaining it for its lifetime. The service worker caches the
asset after download, so later requests work offline.

After loading, the worker does not run a tree search. It normalizes the input
under whole-cube rotations, looks up its exact distance, and repeatedly selects
a face turn whose successor has distance one lower. This reconstructs a shortest
solution in at most eleven steps. Returned moves are parsed and replayed against
the original state before being sent to the UI.

Regenerate the checked-in asset after changing its contract:

```sh
bun run solver:generate-2x2
```

Tests cover table size, schema and checksum validation, first-use loading, and
solution replay. The static filename contains the table version; incompatible
future data should use a new filename and update the worker constant.
