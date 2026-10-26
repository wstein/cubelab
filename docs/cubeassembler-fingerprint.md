# CubeAssembler fingerprint specification

Status: version 1 (`spec=1`). Normative for producers and consumers of the
fingerprint; the CubeLab integration section describes current CubeLab
behavior.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used as in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Purpose and scope

A web page that shows a cube and its move history can publish that history as
data. A consumer that only sees the page's DOM (a browser extension content
script, or any other tool) then reads the moves and the cube size
authoritatively instead of scraping visible text and guessing the size.

The fingerprint consists of two elements:

1. a **marker**, a `<meta>` element that identifies the contract and its
   version, and
2. a **moves block**, a `<script type="application/json">` element that holds
   the cube size and the move history.

This document specifies the elements, the notation of the move string
(`layer-prefix/v1`), how a consumer reads the elements, and how CubeLab
itself maps a valid fingerprint to a workbench link. It does not specify
solving, cube state, or any other data. The fingerprint carries no cube
state, only the move history.

Reference implementations:

- Producer: [CubeAssembler](https://github.com/wstein/cube-assembler), see
  `docs/cubelab-fingerprint.md`, `src/client/cubeLabFingerprint.ts` and
  `src/core/view/CubeLabFingerprint.res` there.
- Consumer: the Chrome extension
  [CubeLab Linker](https://github.com/wstein/cubelab-chrome-extension), see
  `FINGERPRINT.md`, `detector.js` and `content.js` there (branch
  `feat/cube-assembler-fingerprint` when this document was written).

## Versioning

- `spec` in the marker is the version of this contract. This document
  specifies `spec=1`.
- `spec` rises only for a breaking change: a field removed, renamed or
  reinterpreted, or a changed meaning of an existing value.
- A producer MAY add fields to the moves block and `key=value` pairs to the
  marker without changing `spec`. A consumer MUST ignore block fields and
  marker pairs it does not know.
- A consumer MUST treat a `spec` it does not implement as if the fingerprint
  were absent (see [Consumer behavior](#consumer-behavior)). It MUST NOT
  apply the rules of `spec=1` to another `spec`.
- `format` in the moves block names the notation of `moves`. The only value
  defined here is `layer-prefix/v1`. A new notation MUST get a new `format`
  value (for example `layer-prefix/v2`); `layer-prefix/v1` never changes
  meaning. A consumer MUST ignore a block whose `format` it does not
  implement.

## The marker

```html
<meta name="cubelab-fingerprint" content="spec=1;app=cube-assembler@0.1.0">
```

- The element is a `<meta>` whose `name` is `cubelab-fingerprint`. Consumers
  SHOULD match the name case-insensitively, as HTML does for metadata names.
- `content` is a semicolon-separated list of `key=value` pairs. Pairs are not
  quoted and neither keys nor values contain `;` or `=`.
- `spec` is required and, for this document, MUST be exactly `1`. It MUST
  occur once.
- `app` is the producer's name and version, `name@version`. It is
  informational. A consumer MUST NOT change its interpretation of the moves
  block depending on `app`.
- The marker SHOULD be present in the static HTML before any script runs, so
  a consumer can detect it without waiting for the page to render. The
  reference producer writes it into its HTML shell at build time and serves
  it on every page of the app, including pages that show no cube.
- The marker alone makes no statement about moves. A page may carry the
  marker and no moves block (for example while no cube is shown).

## The moves block

```html
<script type="application/json" id="cubelab-moves">
{"size":3,"moves":"2L' 2R U2","format":"layer-prefix/v1"}
</script>
```

- The element is a `<script>` with `type="application/json"` and
  `id="cubelab-moves"`. Because the type is not a JavaScript type, a browser
  never executes it.
- Its text content is one JSON object (RFC 8259) with the fields below.
- The block describes the history the page currently shows. A producer that
  shows a "Moves" line next to the block SHOULD place the block directly
  after that line and MUST keep both in agreement after every change
  (scramble, turn, undo, reset). The reference producer does so.
- The block exists only while the page shows the cube's move history. When it
  does not (for example in a 2D view or on another page), the block SHOULD be
  absent. A consumer MUST handle both appearance and disappearance of the
  block at any time.
- Without moves the block remains and `moves` is the empty string. It never
  contains placeholder text such as "None".

| Field    | Type    | Required | Meaning                                                                    |
| -------- | ------- | -------- | -------------------------------------------------------------------------- |
| `size`   | integer | yes      | Cube size N of an N×N×N cube, 2 to 7 inclusive.                            |
| `moves`  | string  | yes      | The move history in `layer-prefix/v1`, turns separated by one space, or `""`. |
| `format` | string  | yes      | The notation id. For this document always `layer-prefix/v1`.               |

Other fields MAY be present and MUST be ignored by a consumer that does not
know them.

### JSON Schema

The block is described by the JSON Schema (draft 2020-12) published by the
reference producer:

<https://wstein.github.io/cube-assembler/schemas/cubelab-fingerprint-v1.schema.json>

Its source is `public/schemas/cubelab-fingerprint-v1.schema.json` in the
CubeAssembler repository. The schema does not set `additionalProperties`
to false, in keeping with the forward-compatibility rule above. The schema
checks syntax only: it does not know whether a layer exists for the given
`size` (see [Layer validity](#layer-validity)). Where this document and the
schema disagree, this document and the producer's prose are authoritative and
the schema is to be corrected.

### Escaping in the producer's JSON

A producer MUST serialize the JSON so that the element text cannot end the
`<script>` element or open a comment: every `<` in the serialized JSON MUST be
written as the six characters `<`. This is valid JSON; `JSON.parse`
returns the original `<`. The grammar of `moves` contains no `<`, so for valid
moves the escape never occurs; it is a defense in depth, not an encoding the
consumer needs to undo by hand.

## Notation `layer-prefix/v1`

`moves` is either the empty string or one or more turns separated by exactly
one space (U+0020). No leading or trailing space, no other whitespace, no
comments, no groups.

One turn is either a layer turn or a whole-cube rotation:

```text
turn      = layer-turn / rotation
layer-turn = [layers] face ["w"] [amount]
rotation  = axis [amount]
layers    = digit / digit "-" digit
digit     = "2" / "3" / "4" / "5" / "6" / "7"
face      = "U" / "R" / "F" / "D" / "L" / "B"
axis      = "x" / "y" / "z"
amount    = "'" / "2"
```

This is the same grammar as the producer's schema pattern:

```text
^(([2-7]-[2-7]|[2-7])?[URFDLB]w?['2]?|[xyz]['2]?)( (([2-7]-[2-7]|[2-7])?[URFDLB]w?['2]?|[xyz]['2]?))*$|^$
```

Meaning:

- `face`: `U` up, `D` down, `R` right, `L` left, `F` front, `B` back.
  Clockwise is as seen looking at that face.
- `amount`: none is one clockwise quarter turn, `'` is one counterclockwise
  quarter turn, `2` is a half turn. A half turn has no direction.
- `face` alone turns the outer layer (`R`).
- `N` + `face` (for example `2R`, `3U'`) turns the single layer at depth N
  counted from the named face; `2R` is the second layer from the right face.
  `2L'` and `2R` on a 5×5×5 are therefore different slices.
- `face` + `w` turns the two outermost layers (`Rw` is `R` and `2R`).
- `N` + `face` + `w` turns the N outermost layers (`3Rw`).
- `A-B` + `face` + `w` turns layers A through B counted from the named face,
  an inner block (`2-3Rw`).
- `x`, `y`, `z` rotate the whole cube like `R`, `U` and `F`; they accept `'`
  and `2` (`x2`). A whole-cube rotation is a block as wide as the cube.

A layer prefix on a turn that has `w` is the block size; a prefix on a turn
without `w` is a single layer. The same text can therefore mean different
turns with and without `w`, and the same turn can differ between cube sizes:
a block as wide as the cube is a rotation, so moves are only meaningful
together with `size`.

Producers merge consecutive turns of the same layers (`R R` becomes `R2`,
`R R'` disappears), so the string is the shortest history. This is a producer
behavior, not a requirement on consumers; a consumer MUST NOT reject moves
because they are not merged.

### Layer validity

The grammar admits layer numbers 2 to 7 for every `size`. A turn is valid
only if the layers it names exist: a layer number MUST NOT exceed `size`
(`3R` is invalid on a 2×2×2, `7R` on a 5×5×5), and a block written with `w`
MUST turn at least 2 and at most `size - 1` layers (`Rw` is invalid on a
2×2×2, `3Rw` on a 3×3×3; a block as wide as the cube is written as a
rotation). A producer MUST NOT emit invalid turns. A consumer SHOULD verify layer validity with its own
move parser and ignore the fingerprint if the check fails, instead of linking
moves it cannot reproduce.

## Consumer behavior

### Reading

A consumer reading the fingerprint:

1. MUST look for the marker and read `content` with `getAttribute`.
2. MUST ignore the moves block when there is no valid marker (see
   [Ignored](#when-the-fingerprint-is-ignored)). Page content with the right
   `id` but no marker is not a fingerprint.
3. MUST read the block with `textContent` and parse it with `JSON.parse`. It
   MUST NOT evaluate it (`eval`, `new Function`, dynamic script injection)
   and MUST NOT use `innerHTML` or any other markup parser for these values.
4. MUST NOT write any value from the fingerprint back into the page as markup.
   Values placed into the DOM by the consumer (a label, a link) MUST be set
   as text or as attributes through DOM APIs, and a URL built from the moves
   MUST be percent-encoded for its context.
5. SHOULD bound its input before parsing. The reference consumer ignores a
   block longer than 16384 characters, a marker `content` longer than 512
   characters and a `moves` string of more than 2000 turns. These limits are a
   consumer's choice, not part of the contract.
6. SHOULD re-read the fingerprint when the block or the marker changes, since
   the block changes while the user turns the cube.

### When the fingerprint is ignored

A consumer MUST ignore the fingerprint (and then behave as if it were absent,
for example by scanning visible text as before) without showing an error when
any of the following holds:

- there is no marker, no `spec` pair, `spec` is not a value the consumer
  implements, or `spec` occurs more than once;
- there is no moves block, it is not a `<script>` element, or its `type` is
  not `application/json`;
- the block text is not valid JSON, or the JSON is not an object;
- `format` is missing or is not a value the consumer implements;
- `size` is not an integer in 2 to 7;
- `moves` is not a string or does not match the grammar of the format;
- the moves fail the consumer's own validation for `size` (for example a layer
  the cube does not have).

A consumer that supports fewer sizes than 2 to 7 MAY recognize a valid
fingerprint of an unsupported size and create nothing for it, but it SHOULD NOT
fall back to scanning the page text for a block it recognized, because that
text describes a cube of the unsupported size. The reference consumer
supports sizes 2 to 5 only and behaves this way.

A valid fingerprint with an empty `moves` string describes a cube with no
moves; a consumer creates nothing for it and does not scan the text it
replaces.

### Authority

When valid, the fingerprint is authoritative for the history it describes.
Size from the block takes precedence over any size inferred from the page,
headings or user preferences. A consumer SHOULD NOT also create a second
result from the visible text that the block replaces.

## Security considerations

- The fingerprint is untrusted input: any page can publish it, and a hostile
  page can publish a hostile one. The marker proves nothing about the page's
  origin or identity. A consumer MUST NOT grant extra privileges to a page
  because it carries the marker.
- Consumers read only the two elements and only through `getAttribute` and
  `textContent`. Strict JSON parsing, a bounded size, a fixed set of field
  types and a closed grammar for `moves` mean that the only data that can
  flow on from the fingerprint are a small integer, a string of a closed
  alphabet (digits, `URFDLBxyzw`, `'`, `-`, space) and constant strings.
- Because `moves` is restricted to that alphabet, it contains none of the
  characters that matter in HTML, JavaScript or URL syntax except `'`, `-`
  and space. A consumer that builds a URL MUST still percent-encode.
  Validation against the grammar is a required step, not an optimization.
- A producer escapes `<` in its JSON (see above) so that content it embeds
  can never terminate the script element.

## Privacy considerations

The marker and the block carry only the spec version, the producer's name and
version, the cube size and the move string. A producer MUST NOT put the view
mode, photographs, color profiles, settings, facelets, identifiers or
anything personal into them, and MUST NOT transmit anything because of
them. Consumers read the elements locally. The only data that leaves the page
because of the fingerprint is what a user chooses to open, for example the moves
in a link's fragment after clicking it. A URL fragment is not sent to a server
in an HTTP request.

## CubeLab mapping

CubeLab does not read the fingerprint itself. It is a destination: a consumer
(today, CubeLab Linker) reads the fingerprint and opens CubeLab with a link.
This section describes the link, as implemented by CubeLab's own fragment
parser (`readHash` in `src/client/store.ts`) and by the reference consumer's
default destination (`detector.js`).

```text
https://wstein.github.io/cubelab/workbench#moves={moves}[&size={size}]
```

- Path `/cubelab/workbench`: the Alg Workbench route. The `/cubelab` prefix is
  the GitHub Pages deployment base (`astro.config.mjs` uses it when built
  by GitHub Actions); a local build has no prefix. The pathname selects the
  workspace; the fragment carries the cube state and settings.
- `moves` is the producer's `moves` string, unchanged, URL-encoded as a
  `URLSearchParams` value (a space becomes `+`, `'` becomes `%27`), for
  example `#moves=2L%27+2R+U2`. CubeLab replays `moves` from the cube's setup
  state, which is solved when there is no `alg` parameter, so the
  workbench shows the cube after those moves. CubeLab truncates `moves` at
  20000 characters.
- `size` is carried only when it is not 3: nothing for a 3×3×3,
  `size=N` otherwise (for example `#moves=Rw+U&size=4`).
- CubeLab parses `moves` with its Modern (WCA/SiGN) dialect by default, in
  which `Rw`, `3Rw`, `2-3Rw`, `2R`, `x`, `y` and `z` have the meanings of
  `layer-prefix/v1` above. The link carries no `dialect` or `lowercase`
  parameter, so the default applies. Layer prefixes are interpreted by
  CubeLab's parser, which rejects layers that do not exist for the size.
- **CubeLab supports sizes 2 to 5 only.** `readHash` accepts `size` only in
  2 to 5 and silently falls back to 3 for any other value. A fingerprint of
  size 6 or 7 MUST NOT be linked to CubeLab: the link would open a 3×3×3 with
  moves for a different cube. This is the reason the reference consumer
  skips those sizes.
- CubeLab validates nothing about the fingerprint and does not need the marker.
  Any link of this form works regardless of where the moves came from.

## Examples

### Valid

Marker and block as published by a 3×3×3 page:

```html
<meta name="cubelab-fingerprint" content="spec=1;app=cube-assembler@0.1.0">
<script type="application/json" id="cubelab-moves">
{"size":3,"moves":"2L' 2R U2","format":"layer-prefix/v1"}
</script>
```

Resulting CubeLab link: `/cubelab/workbench#moves=2L%27+2R+U2`.

A 5×5×5 with a wide, a ranged and a whole-cube turn:

```json
{"size":5,"moves":"Rw 2-3Uw' x2 3F","format":"layer-prefix/v1"}
```

Link: `/cubelab/workbench#moves=Rw+2-3Uw%27+x2+3F&size=5`.

No moves yet (valid; creates no link):

```json
{"size":4,"moves":"","format":"layer-prefix/v1"}
```

Extra fields and extra marker pairs are accepted and ignored:

```html
<meta name="cubelab-fingerprint" content="spec=1;app=example@2.0.0;theme=dark">
```

```json
{"size":3,"moves":"R U","format":"layer-prefix/v1","note":"ignored"}
```

### Invalid (consumer ignores the fingerprint)

| Input                                                                | Reason                                         |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| block without any marker                                             | no valid marker                                |
| marker `spec=2;app=x@1`                                              | unknown `spec`                                 |
| marker `spec=1;spec=1;app=x@1`                                       | `spec` occurs twice                            |
| `{"size":3,"moves":"R U","format":"layer-prefix/v2"}`                | unknown `format`                               |
| `{"size":8,"moves":"R","format":"layer-prefix/v1"}`                  | `size` out of 2 to 7                           |
| `{"size":"3","moves":"R","format":"layer-prefix/v1"}`                | `size` not an integer                          |
| `{"size":3,"moves":"R  U","format":"layer-prefix/v1"}`               | two spaces between turns                       |
| `{"size":3,"moves":"M R","format":"layer-prefix/v1"}`                | `M` is not in the grammar                      |
| `{"size":3,"moves":"r u","format":"layer-prefix/v1"}`                | lowercase faces are not in the grammar         |
| `{"size":3,"moves":"R2'","format":"layer-prefix/v1"}`                | one amount only                                |
| `{"size":3,"moves":"3Rw","format":"layer-prefix/v1"}`                | grammar-valid, but a block of 3 layers on a 3×3×3 is not a layer turn (CubeLab's parser rejects it) |
| `{"size":5,"moves":"7R","format":"layer-prefix/v1"}`                 | grammar-valid, but layer 7 does not exist on a 5×5×5 |
| `{"size":3,"moves":"R U",}`                                          | not valid JSON, no `format`                    |
| `[{"size":3}]`                                                       | JSON is not an object                          |
| `<script type="text/javascript" id="cubelab-moves">...</script>`     | wrong `type`                                   |

## Conformance checklist

Producer:

- [ ] Marker `<meta name="cubelab-fingerprint">` with `spec=1;app=name@version`
      in the static HTML.
- [ ] Moves block `script#cubelab-moves` with `type="application/json"`,
      present exactly while the move history is shown, absent otherwise.
- [ ] JSON object with `size` (integer 2 to 7), `moves` (string) and `format`
      (`layer-prefix/v1`); validates against the published schema.
- [ ] `moves` matches the grammar, has single spaces, and every turn is valid
      for `size`.
- [ ] Block always agrees with the visible history after every change.
- [ ] Every `<` in the serialized JSON is written `<`.
- [ ] Nothing personal in the marker or block; nothing sent because of them.

Consumer:

- [ ] Ignores the block without a valid marker; checks `spec` exactly.
- [ ] Reads with `getAttribute` and `textContent` only; `JSON.parse`; never
      evaluates; never writes values back as markup.
- [ ] Requires `format` it implements, integer `size` in 2 to 7, `moves`
      matching the grammar; ignores unknown fields and marker pairs.
- [ ] Validates the moves for `size` with its own parser, or ignores the
      fingerprint.
- [ ] Bounds its input.
- [ ] Never links a size its destination does not support (CubeLab: 2 to 5).
- [ ] Falls back to normal behavior silently when the fingerprint is ignored.
- [ ] Follows changes of the block and the marker, including removal.

## Known deviations between the sources

These were found while checking this document against the reference
implementations and are recorded so they can be corrected at the source.

- The producer's prose says the text inside the element escapes `<` as
  `<` and that `JSON.parse` returns the original characters. As written the
  escape and its original are the same character; the producer's code
  (`escapeForScript` in `CubeLabFingerprint.res`) writes `<`, which is
  what this document specifies. The producer's prose should be corrected.
- The consumer's `FINGERPRINT.md` states that the schema pattern allows only
  `[xyz]'?` and so rejects `x2`. The schema in the producer repository at the
  time of writing allows `[xyz]['2]?`; this document follows the schema and the
  prose (`x2` is valid).

## Open questions

1. **Sizes 6 and 7.** The producer emits sizes 2 to 7, CubeLab and the
   reference consumer support 2 to 5. Whether CubeLab will add 6 and 7 is
   undecided. Until it does, consumers must skip them.
2. **Layer validity rules.** The layer rules above were checked against
   CubeLab's parser only for a sample (`2R` on 2×2×2 accepted, `3R` on 2×2×2
   and `7R` on 5×5×5 rejected, `3Rw` on 3×3×3 and `2-2Rw` on 2×2×2 rejected,
   `2-2Rw` on 3×3×3 and `2-3Uw'` on 5×5×5 accepted), not exhaustively. A
   single-layer range such as `2-2Rw` is accepted by CubeLab but is not
   produced by the reference producer; whether the notation should allow it
   is undecided. Treat the consumer's own parser as the final check.
3. **Resolution of `format` aliases.** There is no registry of `format` values
   beyond `layer-prefix/v1`. Whether CubeLab should host one is undecided.
4. **Stable URL of this specification.** The schema is published by the
   producer, not by CubeLab. Whether CubeLab should also publish or mirror a
   schema, and whether the marker should link to this document, is
   undecided.
5. **Native CubeLab consumption.** CubeLab does not read the fingerprint
   itself (for example to import moves from a page opening it). Whether it
   should is undecided.
