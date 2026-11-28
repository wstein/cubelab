# Orbit64 state interchange

CubeLab reads and writes Orbit64 V2 color state tokens
([FORMAT-V2.md](https://github.com/wstein/flix-orbit64/blob/main/FORMAT-V2.md))
for 2×2×2 through 5×5×5. Writing always uses the color framed entry.
`src/State/Orbit64State.res` is that path. The converter and the cubing.js
adapter call it.

| Cube | Framed color token length |
| --- | ---: |
| 2×2×2 | 5 |
| 3×3×3 | 12 |
| 4×4×4 | 27 |
| 5×5×5 | 42 |

A 43-character class-00 token, the retired V1 5×5, is refused with
"Orbit64 V1 is no longer supported". Class 00 starts with `A` through `P`.
`R` followed by 41 zeros and `2` is the move `R2`, not that token. Sizes 2,
3 and 4 keep the same framed strings as that old format, so those published
tokens still round-trip. The solved 5×5 framed token is 42 characters and is
not a run of `A`.

`src/State/Orbit64Codec.res` still holds the coordinate tables, the ranking,
and the whole-cube frame normalization (`canonicaliseState`). It no longer
reads or writes a token.

CubeLab uses Flix's published facelet convention: six row-major fields in
`U R F D L B` order. It is tested against the published 2×2, 3×3 and 4×4
reference tokens, and against the same 5×5 cubes written as framed V2 tokens.

## Orbit64 V2 (state tokens and facelets)

`src/State/Orbit64V2.res` is the coordinates codec: a 54-entry registry,
`encode(entryId, cube)` and `decode(token)`. The studio token path uses the
facelet bridge on top of it, color entries only, n = 2 through 5. A framed
color token for n = 2, 3, 4, 6 or 7 is the same string as the old class-00
token; a 43-character 5×5 token is rejected.

`src/State/Orbit64V2Facelets.res` is the facelet bridge of both models
for every n = 2..15, the port of flix-orbit64's `Orbit64.V2.Facelets`:
`toFacelets(n, model, pose, cube)`, `fromFacelets(n, model, pose, facelets)`,
and the registry-level helpers `encode(entryId, facelets)` and
`decode(token)`. A facelet string is the six faces `U R F D L B` of `n²`
symbols each, one space between fields on output; reading ignores spaces only,
so a tab or newline is a bad symbol. Odd cubes are read through the six fixed
centers (a canonical read accepts any whole-cube orientation; a framed read
keeps it as the frame rank), even canonical cubes through the DBL corner. Slot
tables for all sizes are derived as in FORMAT-V2.md and tested equal to
`FORMAT-V2-SLOTS.md`; the corners and midges of the 5×5×5 and the wings of the
4×4×4 are V1's own tables in `Orbit64Codec`. Every entry point returns a
result, never throws, whatever it is given. An invalid facelet string or an
unreachable cube (twisted corner, flipped midge, repeated or mirrored piece,
wrong-handed centers) is an error value. A cube is copied once, each element
read a single time (and a length only as a plain number), before it is
validated and drawn. This path is separate from V1's `FaceletCodec`, which
strips all whitespace and handles n ≤ 5. State tokens go through
`Orbit64State`, not through the old class-00 ranking.

The **color model** writes the letters `U R F D L B`: a sticker shows the face
of its home facelet.

The **picture model** ("Picture facelets" in FORMAT-V2.md) writes one
base64url symbol per facelet, the sticker's index within its class: a corner
sticker `3p + j`, a midge or wing sticker `2p + j`, a center orbit sticker its
home slot, a fixed center `4p + r` with its rotation `r`. The string is as long
as a color string, in the same six fields. A symbol only means something on the
class of its facelet, so a string is read in the order of the specification:
a symbol outside the alphabet and then the count; per class (corner, midge,
wings from the outermost orbit, centers in orbit order, fixed centers) a value
at or above the class range and then a repeated sticker; each corner, midge and
wing slot spelling one piece (a wing with a twist is none); the fixed centers
as a frame, or the DBL corner of an even canonical cube; and last the
orientation and parity laws. The first failure is the one reported. The
picture entries are the registry entries with n = 3..15; the 2×2×2 has no
picture entry (its picture model is the color model), so a picture 2×2×2 is an
`UnsupportedModel` error. The string is scanned once by code point and not
copied, so the memory used does not grow with its length.

Error messages follow the color bridge: a sentence with a period that quotes
only a few symbols of the caller's text. A message about one slot quotes the
symbols on that slot (up to three, for a corner); a range or repeat message
quotes one symbol; the others quote one character or none. The text is never
repeated beyond that. They differ from the Flix reference in wording only; the
decision to accept or reject a string, and every token, are the same.

The reference rows in `test/fixtures/orbit64-v2-facelet-vectors.mjs` (color,
slot tables, frames) and `test/fixtures/orbit64-v2-facelet-picture-vectors.mjs`
(174 picture rows) are generated from a flix-orbit64 checkout and are not edited
by hand. The generator fails if a source row is dropped, duplicated or
unparsed, or if the pinned count of rows per size changes:

```sh
julia scripts/generate-orbit64-v2-facelet-fixtures.jl [path-to-flix-orbit64]
```

## cubing.js and smart-cube boundary

`src/State/CubingAdapter.ts` bridges Orbit64's 3×3×3 facelet state to and from
a real [cubing.js `KPattern`](https://js.cubing.net/cubing/kpuzzle/). The
adapter does not reinterpret Orbit64 ranks: it first decodes the token to a
framed state, crosses the published `U R F D L B` facelet boundary, and then
maps the standard corner and midge positions to cubing.js's `CORNERS` and
`EDGES` orbits. The six `CENTERS` pieces carry the same whole-cube pose.

The reverse path derives the frame from `KPattern` centers, removes it, maps
the canonical cubies through facelets, then reapplies the frame before encoding
the Orbit64 token. It currently rejects non-3×3×3 patterns: 4×4×4 and 5×5×5
need a separately published cubing.js wing/center-orbit mapping rather than a
guessed slot order.

`test/cubing-adapter.test.mjs` checks named scrambles and every one of the 24
right-handed odd-cube frames. Smart-cube protocols should use this adapter after
their device-specific protocol has produced a cubing.js `KPattern` or facelets.
