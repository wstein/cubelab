# Move Notation Compatibility Report

<!-- markdownlint-disable MD013 -->

Research date: 2026-09-01

## Executive summary

Cube Rosetta implements the current WCA move notation needed for 2×2×2 through 5×5×5
cubes and the core cube grammar in the descriptive SiGN/LGN draft. It also accepts a
small set of reconstruction conveniences: Unicode prime/dash/space normalization,
`//` and `#` line comments, composite multiplier aliases, terminal sentence
punctuation, retained `/* … */` block-comment nodes, and `@1.53s`-style timestamps.
Whitespace-delimited `.` input is retained as the state-neutral pause leaf documented
by cubing.js.

Compatibility is not universal across cube sites because several use local extensions
or older meanings for the same token. In particular, modern SiGN uses lowercase `r` as
a two-layer wide move (`Rw`), while CubeDB's optional old-notation mode and some Ruwix
4×4 material use `r` for the single inner layer (`2R`). Cube Rosetta never guesses
between these contradictory meanings. Modern SiGN is the default; users can explicitly
select legacy inner-slice semantics for 4×4 and 5×5 input.

Ruwix also publishes outer-block widths as HTML subscripts after a face. Cube Rosetta
accepts unambiguous Unicode copies such as `F₂'` as outer-block turns in every mode.
Plaintext copies collapse the subscript into an ordinary digit, making `F2'` conflict
with a modern half turn; these forms are accepted only after the user explicitly
selects Ruwix suffix-layer mode.

The Settings dialog also offers two opt-in import dialects. **Twizzle / cubing.js**
recognizes the experimental caret-NISS leaf `^(...)`, leaving ordinary parentheses as
normal grouping. **SSE 3×3 (Superset ENG)** maps Randelshofer's 3×3-only `T`, `M`,
`S`, and `C` prefixed turns to Cube Rosetta's standard wide, slice, paired-face, and
rotation moves. SSE also permits compact adjacent move sequences such as `CD2MR2MD`;
the other dialects retain their whitespace requirement. Neither dialect is inferred from
pasted input.

## In-app compatibility profiles

For every recognized algorithm, the source-compatibility strip inspects the original
located AST and source spelling rather than the expanded move sequence. This preserves
the distinctions that matter for portability: a commutator and its expanded turns have
the same cube effect, but only the former requires bracket grammar at the destination.

The five badges cover WCA Article 12 move-token spelling, normative SiGN/LGN grammar,
documented cubing.js/Twizzle input, conventions described by the SpeedSolving Wiki, and
Ruwix Advanced notation. A green badge means that the original source fits the cited
profile; a red badge exposes the specific incompatible features in its tooltip. The WCA
badge deliberately says **WCA tokens** because token compatibility alone cannot decide
whether an algorithm is legal for a particular event, attempt, or score sheet.

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

Cube Rosetta implements this core grammar with puzzle-aware bounds. Adjacent bare moves
require whitespace; self-delimiting bracket units may touch, as in `[R,U][D,L]` or
`R(U R')`. It restricts `M/E/S` to 3×3 because a single middle layer is not unique on
an even cube.

Bare lowercase face moves use modern SiGN semantics by default, so `r` is `Rw`. For
4×4 and 5×5 source material, users may explicitly select legacy inner-slice mode, where
bare `r` is `2R`. Explicit uppercase tokens (`Rw`, `3Rw`, `2R`, and `2-2Rw`) have the
same meaning in both modes. Prefixed lowercase tokens are rejected in legacy mode;
rewrite them explicitly instead.

### Project extensions

- Common typographic primes, dashes, brackets, and whitespace normalize one-for-one so
  diagnostic offsets still refer to the pasted input.
- Unicode Ruwix face subscripts `₂` through `₅` map to outer-block widths without
  changing token length, so `F₂'` is equivalent to `2Fw'` and retains its source span.
- `// comment` and `# comment` reconstruction annotations are ignored during execution.
- `@1.53s` is retained as a located `TimedPause(1.53)` node. It is state-neutral, appears
  as `@1.53s` in the tape ribbon, and waits 1.53 seconds at 1× playback speed. Playback
  speed scales the wait. Durations use at most millisecond precision and are bounded to
  60 seconds per node.
- Whitespace-delimited `.` is retained as a located `Pause` AST node and remains visible
  to editor/playback consumers while cube-state execution treats it as a no-op.
- `/* block comment */` is retained as a located `BlockComment` AST node and treated as
  a no-op by execution. This is a Cube Rosetta editor extension: the current cubing.js
  parser defines `//` line-comment and pause leaves but does not accept block comments.
- Composite repetitions also accept explicit `*`, `^`, or spaced `x` markers, such as
  `(R U)*6`, `(R U)^6`, and `(R U) x 6`. An adjacent terminal sentence `.` or `;` is
  ignored only at the end of complete input; a whitespace-delimited internal `.` is a
  cubing.js-compatible pause node.
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
| [alg.cubing.net](https://alg.cubing.net/) | Its [bundled parser identifies itself as SiGNw](https://github.com/cubing/alg.cubing.net/blob/main/src/alg.cubing.net/twisty.js/alg/README.md) plus editor nodes | Core covered | Internal pause nodes and Cube Rosetta block-comment nodes are covered as state-neutral input. Preserved newline/editor nodes remain outside the current AST. |
| [Twizzle / cubing.js](https://js.cubing.net/cubing/alg/) | LGN-derived general algorithm AST | Core grammar, pause leaves, and opt-in experimental caret-NISS covered | Select **Twizzle / cubing.js** to use [experimental caret-NISS](https://github.com/cubing/cubing.js/blob/main/src/cubing/alg/parseAlg.ts) (`^(U L)`); ordinary groups retain their normal meaning. Block comments are a Cube Rosetta extension. Puzzle-specific Square-1, Clock, and Megaminx moves remain outside Cube Rosetta's NxN scope. |
| [Randelshofer SSE 3×3](https://www.randelshofer.ch/rubik/patterns/doc/supersetENG_3x3.html) | Superset ENG 3×3 layer/rotation prefixes and cubie-state cycles | Partial, explicit SSE 3×3 dialect and Setup-state importer | `TR`, `MR`, `SR`, and `CR` families (including inverse/half turns and `-` inverse suffixes) are supported. Setup also accepts corner/edge permutation cycles with orientation. Marked-centre rotations parse as inert metadata until centre-orientation rendering exists. |
| [CubeDB](https://cubedb.net/) | cubing.js-style algorithms with an optional “old notation (`r = 2R`)” mode | Covered with an explicit setting | Select legacy inner-slice mode for old-notation algorithms; modern SiGN remains the default. |
| [Ruwix / Roofpig widget](https://ruwix.com/widget/3d/) | Standard cube moves plus Roofpig extensions | Partial | Camera rotations (`R>`, `R>>`), combined moves (`F'+B`), and aliases such as superscript `²` or `Z` are not implemented. |
| [Ruwix 4×4 algorithms](https://ruwix.com/twisty-puzzles/4x4x4-rubiks-cube-rubiks-revenge/4x4-cube-patterns/) | Legacy lowercase inner-slice notation on 4×4 | Covered with an explicit setting | Select legacy inner-slice mode; in the default modern mode, `r` remains the outer two-layer block. |
| [Ruwix advanced notation](https://ruwix.com/the-rubiks-cube/notation/advanced/) | Post-face HTML subscripts for outer-block width | Covered with deterministic modes | Unicode `F₂'` works directly as `2Fw'`. Plaintext `F2'` requires explicit Ruwix suffix-layer mode because modern notation reads it as an outer half turn. |
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

### 3. Ruwix plaintext subscript loss — explicit mode only

- Examples: HTML `F₂'` copied as plaintext `F2'`; HTML `B₂2` copied as `B22`.
- Risk: high. Modern SiGN already defines `F2'` as a two-quarter-turn outer-face move.
- Implemented rule: Unicode subscripts are unambiguous and accepted directly. Plaintext
  post-face layer digits require the explicit Ruwix suffix-layer setting on 4×4/5×5.
- Portable interoperability rule: retain the Unicode subscript or rewrite it as `2Fw'`.

### 4. Reconstruction/editor control tokens

- Implemented: located internal pause `.` and block-comment `/* … */` nodes. Both are
  state-neutral; only the pause is portable to the current cubing.js parser.
- Uncovered: Twizzle/cubing.js experimental NISS `^(...)` and preserved newline nodes.
- Risk: low for comments and pauses because they have no cube-state effect; NISS changes
  algorithm interpretation and requires a dedicated execution model.

### 5. Roofpig presentation syntax

- Camera-only rotations: `R>`, `R>>`, `R<`, `R<<`.
- Parallel/combined notation: `F'+B`.
- Display aliases: Unicode `²`, `Z`, and related flags.
- Risk: medium. Camera operations are presentation state, not cube state, and combined
  moves need a documented execution-order or simultaneity model.

### 6. Other WCA puzzle families — intentionally outside scope

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
5. Keep whitespace around portable cubing.js pauses; remove block comments, NISS markers,
   and viewer-only controls before pasting into tools that do not document them.

## Research limits

This report records public site documentation, examples, and official parser sources as
of the research date. Sites can change parsers without versioning their user-facing
notation. “Covered” therefore describes the cited behavior, not a permanent compatibility
guarantee.
