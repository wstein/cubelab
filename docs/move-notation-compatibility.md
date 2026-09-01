# Move Notation Compatibility Report

<!-- markdownlint-disable MD013 -->

Research date: 2026-09-01

## Executive summary

Cube Rosetta implements the current WCA move notation needed for 2×2×2 through 5×5×5
cubes and the core cube grammar in the descriptive SiGN/LGN draft. It also accepts a
small set of reconstruction conveniences: Unicode prime/dash/space normalization,
`//` line comments, and `@1.53s`-style timestamps.

Compatibility is not universal across cube sites because several use local extensions
or older meanings for the same token. In particular, modern SiGN uses lowercase `r` as
a two-layer wide move (`Rw`), while CubeDB's optional old-notation mode and some Ruwix
4×4 material use `r` for the single inner layer (`2R`). Cube Rosetta never guesses
between these contradictory meanings. Modern SiGN is the default; users can explicitly
select legacy inner-slice semantics for 4×4 and 5×5 input.

## Implemented standards and syntax

### WCA notation

The [current WCA Regulations, Article 12a](https://www.worldcubeassociation.org/regulations/#12a)
define NxNxN face moves (`R`, `U'`, `F2`), outer-block moves (`Rw`, `3Uw`), and whole
cube rotations (`x`, `y'`, `z2`). Cube Rosetta implements these categories for its
supported sizes and enforces the WCA bound `1 < n < N` for an `nFw` outer-block move.

The WCA standard does not define groups, commutators, conjugates, lowercase wide moves,
or `M/E/S` as legal 3×3 Fewest Moves solution notation. Those are accepted by Cube
Rosetta as non-WCA extensions. Current WCA FMC interpretation rules also tolerate some
incorrect capitalization and disregard non-move symbols; Cube Rosetta remains strict
and does not act as an FMC score-sheet judge.

### SiGN/LGN

The [SiGN/LGN Draft 6](https://standards.cubing.net/draft/6/sign-lgn-notation/) is a
descriptive interoperability grammar rather than a finalized prescriptive standard. Its
cube base moves include:

- face, inner-layer, wide, lowercase-wide, slice, and rotation families;
- positive repetition and prime suffixes;
- ranged layer moves such as `2-3Rw`;
- groups, commutators, conjugates, nesting, and composite suffixes.

Cube Rosetta implements this core grammar with puzzle-aware bounds. It requires
whitespace between adjacent moves and restricts `M/E/S` to 3×3 because a single middle
layer is not unique on an even cube.

Bare lowercase face moves use modern SiGN semantics by default, so `r` is `Rw`. For
4×4 and 5×5 source material, users may explicitly select legacy inner-slice mode, where
bare `r` is `2R`. Explicit uppercase tokens (`Rw`, `3Rw`, `2R`, and `2-2Rw`) have the
same meaning in both modes. Prefixed lowercase tokens are rejected in legacy mode;
rewrite them explicitly instead.

### Project extensions

- Common typographic primes, dashes, brackets, and whitespace normalize one-for-one so
  diagnostic offsets still refer to the pasted input.
- `// comment` and `@1.53s` reconstruction annotations are ignored during execution.
- Historical rotation spellings `[r]`, `{u'}`, and `<f>2` are accepted. They are not
  current WCA notation; `x/y/z` should be preferred for portable algorithms.

## Site compatibility matrix

“Covered” below means that the documented examples for 2×2–5×5 cube algorithms parse
with the same meaning. It does not claim support for other puzzle families hosted by a
site.

| Site | Documented dialect or implementation | Cube Rosetta status | Uncovered or different syntax |
| --- | --- | --- | --- |
| [WCA Regulations](https://www.worldcubeassociation.org/regulations/#12a) | Official WCA Article 12a NxNxN notation | Covered for 2×2–5×5 | FMC's judge-side capitalization recovery and symbol-discard rules are not an input mode. |
| [J Perm move guide](https://www.jperm.net/3x3/moves) | Common WCA/SiGN subset: face, wide/lowercase-wide, slice, rotation | Covered on 3×3 | No documented cube-move gap; `U2'` is accepted and is state-equivalent to `U2`. |
| [SpeedCubeDB](https://speedcubedb.com/p/4x4/OLLParity) | Community SiGN-like algorithms for multiple cube sizes | Partial | Some 4×4 pages use `M`; Cube Rosetta rejects `M/E/S` outside 3×3 because even cubes have no unique middle slice. |
| [alg.cubing.net](https://alg.cubing.net/) | Its [bundled parser identifies itself as SiGNw](https://github.com/cubing/alg.cubing.net/blob/main/src/alg.cubing.net/twisty.js/alg/README.md) plus editor nodes | Core covered | A pause `.`, `/* block comments */`, and preserved newline/editor nodes are not implemented. `//` comments and `@…s` timestamps are covered. |
| [Twizzle / cubing.js](https://js.cubing.net/cubing/alg/) | LGN-derived general algorithm AST | Core cube grammar covered | The parser's [pause and experimental caret-NISS syntax](https://github.com/cubing/cubing.js/blob/main/src/cubing/alg/parseAlg.ts) (`.`, `^(U L)`) are not implemented. Puzzle-specific Square-1, Clock, and Megaminx moves are outside Cube Rosetta's NxN scope. |
| [CubeDB](https://cubedb.net/) | cubing.js-style algorithms with an optional “old notation (`r = 2R`)” mode | Covered with an explicit setting | Select legacy inner-slice mode for old-notation algorithms; modern SiGN remains the default. |
| [Ruwix / Roofpig widget](https://ruwix.com/widget/3d/) | Standard cube moves plus Roofpig extensions | Partial | Camera rotations (`R>`, `R>>`), combined moves (`F'+B`), and aliases such as superscript `²` or `Z` are not implemented. |
| [Ruwix 4×4 algorithms](https://ruwix.com/twisty-puzzles/4x4x4-rubiks-cube-rubiks-revenge/4x4-cube-patterns/) | Legacy lowercase inner-slice notation on 4×4 | Covered with an explicit setting | Select legacy inner-slice mode; in the default modern mode, `r` remains the outer two-layer block. |
| [Ruwix notation guide](https://ruwix.com/the-rubiks-cube/notation/) | Documents common and legacy alternatives | Partial | `Fi`/`Ri` inverse suffixes and the rare lowercase-means-inverse dialect are not implemented because they conflict with modern lowercase-wide notation. |

## Uncovered syntax, ranked

### 1. Ambiguous legacy lowercase notation — explicit mode only

- Examples: old `r = 2R`, or lowercase `r` meaning inverse `R'`.
- Sites: CubeDB old-notation mode and Ruwix documentation.
- Risk: high. The same text is a valid modern SiGN wide move with a different state.
- Implemented rule: modern SiGN is the default, and the 4×4/5×5 legacy interpretation
  requires an explicit user choice. Cube Rosetta may warn about mixed syntax but never
  switches modes heuristically.
- Portable interoperability rule: rewrite inner slices explicitly as `2R` and wide
  turns as `Rw`; explicit notation does not depend on the selected mode.

### 2. Even-cube `M/E/S` semantics — requires a declared convention

- Example: `M Rw U2` on a SpeedCubeDB 4×4 page.
- Risk: high. An even cube has two central slices, so “the middle layer” is not unique.
- Safe interoperability rule: rewrite the intended slice using a numbered move such as
  `2R` or `3L` before conversion.

### 3. Reconstruction/editor control tokens

- alg.cubing.net: pause `.`, block comments `/* … */`.
- Twizzle/cubing.js: pause `.`, experimental NISS `^(...)`.
- Risk: low for cube state conversion because pauses/comments have no move effect; NISS
  does affect how an algorithm is interpreted and would need a dedicated AST node.

### 4. Roofpig presentation syntax

- Camera-only rotations: `R>`, `R>>`, `R<`, `R<<`.
- Parallel/combined notation: `F'+B`.
- Display aliases: Unicode `²`, `Z`, and related flags.
- Risk: medium. Camera operations are presentation state, not cube state, and combined
  moves need a documented execution-order or simultaneity model.

### 5. Other WCA puzzle families — intentionally outside scope

The WCA and cubing.js also define Square-1 tuples/slashes, Megaminx `R++/D--`, Clock
dial moves, Pyraminx tips, and other puzzle-specific moves. Cube Rosetta currently models
only NxN cubes from 2×2 through 5×5, so these are product-scope gaps rather than missing
cube notation aliases.

## Recommended interoperability guidance

For portable input across Cube Rosetta, WCA tools, Twizzle, and algorithm databases:

1. Use `R'` rather than `Ri`, lowercase-as-inverse, or typographic superscripts.
2. Use explicit `Rw` for wide moves and `2R` for a single inner layer.
3. Use numbered layers instead of `M/E/S` on 4×4 and larger cubes.
4. Use `x/y/z` for whole-cube rotations rather than historical brackets or camera syntax.
5. Remove pauses, block comments, NISS markers, and viewer-only controls before pasting.

## Research limits

This report records public site documentation, examples, and official parser sources as
of the research date. Sites can change parsers without versioning their user-facing
notation. “Covered” therefore describes the cited behavior, not a permanent compatibility
guarantee.
