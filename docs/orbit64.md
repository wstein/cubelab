# Orbit64 state interchange

CubeLab implements the state-token part of
[Flix Orbit64](https://github.com/wstein/flix-orbit64/blob/main/FORMAT.md) for
2×2×2 through 5×5×5. That document is normative; this page is the CubeLab
integration reference.

Orbit64 is URL-safe Base64URL with alphabet
`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_`. Its first
two bits select the token class. CubeLab accepts and emits only class `00`
state tokens (`A`–`P` as the first character); move, algorithm, and extension
tokens are deliberately not treated as cube states.

| Cube | State-token width | Coordinates, in packing order |
| --- | ---: | --- |
| 2×2×2 | 5 | corners |
| 3×3×3 | 12 | corners, midges, frame |
| 4×4×4 | 27 | corners, wings, centres |
| 5×5×5 | 43 | corners, midges, wings, X-centres, plus-centres, frame |

Coordinates are combined by mixed-radix Horner ranking. Corner twists and
midge flips omit their forced final orientation. For every size, those stored
orientation digits are little-endian: the first digit is the units digit.
On odd cubes the midge
permutation is ranked in the parity class selected by the corners; the final
factor is one of the 24 right-handed whole-cube frames in Flix's `x`, then
`z`, then `y` wire order. On even cubes the
movable centre orbits already determine the pose, so no frame factor is
present.

CubeLab uses Flix's published facelet convention: six row-major fields in
`U R F D L B` order, with standard corner and midge orders, wings ordered by
their reference facelet, and centres ordered by facelet index. It is tested
against Flix's published 2×2, 3×3, 4×4, and 5×5 reference vectors.

For odd cubes, CubeLab derives the stored 24-way frame from the six fixed
centres and reapplies it on decode, so a whole-cube-rotated labelled state
round-trips exactly. Even-cube centres encode their orientation directly.

## Orbit64 V2 (state tokens and color facelets)

`src/State/Orbit64V2.res` implements the draft Orbit64 V2 state token format
(flix-orbit64 `FORMAT-V2.md`) as a coordinates codec: a 54-entry registry,
`encode(entryId, cube)` and `decode(token)`. No UI or V1 path uses it. A V1
state token for n = 2, 3, 4, 6 or 7 decodes as the V2 color framed entry with the
same corner state; a V1 5×5×5 token is rejected.
The reverse direction is unsafe: a V2 token has no class bits, so a V1 decoder
can take it for a move sequence or an algorithm. Wherever a V1 decoder could see
V2 tokens, they MUST be labeled, for example by a field name or an
`orbit64v2:` prefix. CubeLab does not yet parse such a label.

`src/State/Orbit64V2Facelets.res` is the facelet bridge of the **color model**
for every n = 2..15, the port of flix-orbit64's `Orbit64.V2.Facelets`:
`toFacelets(n, model, pose, cube)`, `fromFacelets(n, model, pose, facelets)`,
and the registry-level helpers `encode(entryId, facelets)` and
`decode(token)`. A facelet string is the six faces `U R F D L B` of `n²`
letters each, one space between fields on output; reading ignores spaces only, so
a tab or newline is a bad letter. Odd cubes are read through the six fixed
centers (a canonical read accepts any whole-cube orientation; a framed read keeps
it as the frame rank), even canonical cubes through the DBL corner. Slot tables
for all sizes are derived as in FORMAT-V2.md and tested equal to
`FORMAT-V2-SLOTS.md`; the corners and midges of the 5×5×5 and the wings of the
4×4×4 are V1's own tables in `Orbit64Codec`. Every entry point returns a result,
never throws, whatever it is given. An invalid facelet string, an unreachable
cube (twisted corner, flipped midge, repeated or mirrored piece, wrong-handed
centers) or a picture entry is an error value. A cube is copied once, each
element read a single time, before it is validated and drawn. The picture model
is out of scope here: its entries are an error until it is defined. This path
is separate from V1's `FaceletCodec`, which strips all whitespace and handles
n ≤ 5, and V1 behavior is unchanged.

The reference rows in `test/fixtures/orbit64-v2-facelet-vectors.mjs` are
generated from a flix-orbit64 checkout and are not edited by hand:

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

The reverse path derives the frame from `KPattern` centres, removes it, maps
the canonical cubies through facelets, then reapplies the frame before encoding
the Orbit64 token. It currently rejects non-3×3×3 patterns: 4×4×4 and 5×5×5
need a separately published cubing.js wing/centre-orbit mapping rather than a
guessed slot order.

`test/cubing-adapter.test.mjs` checks named scrambles and every one of the 24
right-handed odd-cube frames. Smart-cube protocols should use this adapter after
their device-specific protocol has produced a cubing.js `KPattern` or facelets.
