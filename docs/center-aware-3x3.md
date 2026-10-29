# Bounded center-aware 3×3 solving

CubeLab's existing two-phase search now has an opt-in picture-cube goal. It
tracks six physical center twists during both search phases and accepts a path
only when the ordinary cubies **and** requested center appearance are solved.
It does not solve colors first and append a separate center-correction word.
The ordinary `solve` and `solveAtDepth` APIs and their tables are unchanged.

This is a fixed-frame solver API and dedicated worker contract. The current
color-only converter, codecs and viewport do not acquire printed-center input
or artwork from this change. A color facelet string cannot reconstruct physical
center orientations; callers must supply them explicitly.

## Physical state and goal

`PictureCenters` uses six clockwise quarter-turn orientations, each an integer
from 0 through 3, in **U/L/F/R/B/D** storage order. Zero means the printed motif's
original up direction on that face. Inputs must use the canonical center-color
frame. Whole-cube-rotated inputs are rejected rather than normalized while
silently discarding their print orientation. Outer face turns are supported;
slice, wide and whole-cube moves are rejected by the center replay helper.

Each goal has a period:

- `1`: orientation is visually irrelevant, for example an unprinted center;
- `2`: a half turn is visually equivalent;
- `4`: all four orientations are distinct and the original up direction is required.

The physical input always contains the full six orientations, including centers
whose goal ignores rotation. Reachability requires
`sum(center quarter turns) mod 2 == corner permutation parity`, in addition to
the existing ordinary-cube invariants. For solved ordinary cubies, precisely
2,048 of the 4,096 center tuples satisfy this rule. One center rotated 180° is
possible; just one center rotated 90°, with ordinary cubies solved and all other
centers unchanged, is not. A free visual goal does not excuse an impossible
physical input.

## API and limits

After compiling ReScript:

```js
import {solvePictureAtDepth} from "../src/Solver/TwoPhaseSolver.res.mjs";

const result = solvePictureAtDepth(
  cube,                         // Valid canonical-frame 3×3 color state.
  [0, 0, 0, 1, 0, 0],          // Actual physical center orientations.
  [4, 4, 4, 4, 4, 4],          // Goal periods.
  20,                           // Maximum outer-face HTM, range 0..24.
  1000000,                      // Search-node budget, range 1..10,000,000.
);
```

The example orientation tuple describes an R quarter-turn center orientation;
the accompanying ordinary state must have the corresponding odd permutation
parity. It is not a valid tuple for a color-solved cube.

The search reuses the existing transition and pruning tables. An additional
admissible bound counts mismatched centers, because each outer turn changes
only one fixed center. Phase-two entry also checks that constrained side-center
parities can be repaired with the existing phase-two move set. Final color and
center goals are independently replayed before returning `Ok`.

`SearchBudgetExceeded` means the node budget was exhausted, not that the state
is impossible. `SearchFailed` means no path was found within the configured
bounded two-phase search, not global impossibility. The inherited phase-one cap
is 12 HTM; this implementation makes no completeness or optimality claim for
picture cubes. A legal pure-center case can exhaust its budget even though a
short solution exists. Do not replace either failure with a color-only answer.

Use `createPictureSolverClient` from
`src/client/workers/picture-solver-client.ts` with a **dedicated** existing solver
worker. Its request contains `cube`, `orientations`, `symmetry`, `maximumDepth`
and `maximumNodes`. It permits one in-flight request, defaults to a 10-second
hard deadline, and terminates the worker on cancellation, deadline, startup or
message failure. Replace a terminated client before retrying. The page thread
never performs the synchronous search.

## The 21-move statement

[Kociemba's primary analysis, “Cubes with Twisted Centers”](https://kociemba.org/twisted.htm)
concerns the **2,048 residual center combinations when all ordinary cubies are
already solved**. Its at-most-21 HTM result does not establish a 21-move bound
for an arbitrary scrambled picture cube or for this bounded search. Nor does it
prove a 21-move bound for partial calendar displays. The
[user-supplied Ruwix introduction](https://ruwix.com/twisty-puzzles/rubiks-cube-sticker-mods-and-picture-cubes-orient-center/)
is background, not this implementation's correctness certificate.

## Ownership and validation

This extends CubeLab's existing solver without creating a second reusable
engine or changing its existing consumers. Reusable Supercube modeling and
solver integration remain assigned to [PuzlWerk issue #6](https://github.com/wstein/puzlwerk/issues/6).
A future migration must preserve these input, goal, replay and failure contracts;
no shared-package publication or cross-repository migration is claimed here.

Regressions cover all 18 center move deltas against separate cubing transformation
data, all 4,096 parity tuples, move/inverse replay, exact and symmetric goals,
misoriented color-solved inputs, malformed/fractional inputs, budgets, existing
ordinary two-phase behavior, and worker deadlines/cancellation. A positive
regression uses two physically different center pictures with identical color
facelets: the ordinary solution misses one picture goal, while the integrated
search finds a different six-HTM solution. Reproduce:

```sh
npm run res:build
npm exec -- vitest run test/picture-centers.test.mjs test/two-phase-solver.test.mjs test/client/picture-solver-client.test.ts test/client/solver-client.test.ts
npm run test:browser -- e2e/picture-solver.playwright.mjs
```

The browser regression loads the real hashed production worker and checks its
returned algorithm, physical center result, and rejection of an impossible
input. The standard browser command requires Bun and installed Chromium as
described in the repository instructions.


This work tracks [CubeLab issue #26](https://github.com/wstein/cubelab/issues/26).
Author validation: 677 tests in 66 files passed; production build and changed-file
ReScript formatting passed. The actual production-worker browser test passed.
The repository-wide formatting gate still reports 19 preexisting files; those
are outside this change and were not reformatted.
