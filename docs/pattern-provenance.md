# Pattern catalog provenance

<!-- markdownlint-disable MD013 -->

CubeLab's generated pattern catalog contains 229 records for 2×2×2 through
5×5×5. It was imported from `../flix-cubesolve/src/CubeSolve/Patterns/` at
`flix-cubesolve` commit `113279e59342a4db17adcf33c3090f0940d25cea` on
2026-09-01. The source repository is distributed under
[GNU AGPL 3.0 or later](https://www.gnu.org/licenses/agpl-3.0.html). Its pattern
modules state that the underlying public collections were retrieved on 2026-08-29;
the later Kewbz additions were retrieved on 2026-08-30.

The generated TypeScript catalog retains, per record, the source collection id,
direct source URL, published notation, source canonical identifier, replay notation,
solution, solution category, and recognition key. Pattern names and
algorithms remain attributed to their listed publishers; their inclusion is not a
claim of authorship by CubeLab.

## Imported collections

| Size | Records | Source module | Construction used for replay |
| --- | ---: | --- | --- |
| 2×2×2 | 89 | `Pocket.flix` | Proven-shortest `optimal` sequence |
| 3×3×3 | 112 | `Standard.flix` | Recorded face-turn-only equivalent |
| 4×4×4 | 13 | `Revenge.flix` | Published notation, made explicit where necessary |
| 5×5×5 | 15 | `Professor.flix` | Published notation, made explicit where necessary |

The 3×3 module's older prose says 110 records; the imported vector has 112 after two
later Kewbz additions. The importer checks the actual 112-record corpus and fails if
any of the four expected counts changes.

The collection ids resolve to these publishers:

- `speedsolving`: [SpeedSolving Wiki pretty patterns](https://www.speedsolving.com/wiki/index.php/List_of_pretty_patterns)
- `randelshofer`: [Walter Randelshofer's Pocket Cube patterns](https://www.randelshofer.ch/rubik/patterns_pocket.html)
- `ruwix1`: [Ruwix Rubik's Cube patterns](https://ruwix.com/the-rubiks-cube/rubiks-cube-patterns-algorithms/)
- `ruwix2`: [Ruwix additional patterns](https://ruwix.com/the-rubiks-cube/rubiks-cube-patterns-algorithms/more-rubiks-patterns/)
- `kewbz3`: [Kewbz 3×3 patterns](https://kewbz.co.uk/blogs/solutions-guides/cool-3x3-rubiks-cube-patterns)
- `kewbz4`: [Kewbz 4×4 patterns](https://kewbz.co.uk/blogs/solutions-guides/4x4-patterns)
- `kewbz5`: [Kewbz 5×5 patterns](https://kewbz.co.uk/blogs/solutions-guides/5x5-patterns)

## Curated additions

One record, **Superflip + Fourspot**, is not part of the flix-cubesolve import. It is
hand-curated in `src/client/extremal-states.ts` (not generated, safe to edit) and
tags a small "mathematical antipode" badge onto qualifying records — proven positions
that are maximally distant from solved under a specific move-counting metric.

- **Superflip** (already in the imported 3×3 records) is the proven God's-number
  antipode in the half-turn metric: exactly 20 face turns from solved (Michael Reid,
  1995). Reference: [Wikipedia — Superflip](https://en.wikipedia.org/wiki/Superflip).
- **Superflip + Fourspot** is the unique known antipode in the quarter-turn metric:
  exactly 26 quarter turns from solved (Michael Reid, 1998). Its construction was
  transcribed from [cube20.org's QTM proof page](https://cube20.org/qtm/) and
  replay-verified with this app's own move engine before being added: the published
  26-QTM construction and its computed inverse solution both round-trip through
  `MoveExecutor`, and the construction's expanded quarter-turn count is asserted to
  equal exactly 26 in `test/client/patterns.test.ts`.

Extremal-state badges are looked up by pattern name via `extremalStateFor`, exposed
through `patternsForSize(size, query, extremalOnly)`'s third parameter, and are
independent of the flix-cubesolve import — `bun run patterns:import` never touches
`extremal-states.ts`.

## Recognition and solution guarantees

- 2×2 recognition follows the source corpus's one-sided 24-way reholding rule; there
  are no fixed centers to pin a frame.
- 3×3 recognition follows the source corpus's 24 conjugations, keeping fixed centers
  as the reference frame.
- 4×4 and 5×5 use CubeLab's documented center-relative 24-way conjugation as a
  practical visual-recognition extension. The source corpus does not claim that its
  larger-cube canonical tokens define a holding equivalence.
- Recognition, invariant key generation, and holding adaptation are implemented natively in
  ReScript (`src/State/PatternState.res`).
- Every offered solution is replayed against the detected state before the UI enables
  it. A solution is rewritten for the detected holding and must restore every facelet.
- Only the 2×2 solutions are described as proven optimal. The 3×3 inverses are known,
  replayable face-turn solutions. The 4×4 and 5×5 answers are inverses of the imported
  published constructions; no shortest-path claim is made.

## Notation normalization

The original published spelling remains in every record and in the UI. A separate
construction field uses explicit Cube Rosetta notation for replay. On large cubes,
legacy lowercase inner faces are rewritten (`r` to `2R`, for example). The source
corpus defines `M/E/S` on even cubes as both central slices and on odd cubes as the
single central layer; the importer expands those meanings into explicit numbered
layers instead of relaxing Cube Rosetta's deliberate rule that bare `M/E/S` is only
accepted on 3×3.

## Reproduction

With the sibling repository at `../flix-cubesolve`, regenerate the catalog with:

```sh
bun run patterns:import
```

The importer parses each source record, normalizes only the replay copy, applies the
construction with Cube Rosetta's move engine, computes its holding-invariant facelet
key, generates the inverse, and proves that construction plus inverse returns the
solved state. `src/client/patterns.generated.ts` is generated output and must not be
edited by hand.
