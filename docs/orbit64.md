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
