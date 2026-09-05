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
factor is one of the 24 right-handed whole-cube frames. On even cubes the
movable centre orbits already determine the pose, so no frame factor is
present.

CubeLab uses Flix's published facelet convention: six row-major fields in
`U R F D L B` order, with standard corner and midge orders, wings ordered by
their reference facelet, and centres ordered by facelet index. It is tested
against Flix's published 2×2, 3×3, 4×4, and 5×5 reference vectors.

For odd cubes, CubeLab derives the stored 24-way frame from the six fixed
centres and reapplies it on decode, so a whole-cube-rotated labelled state
round-trips exactly. Even-cube centres encode their orientation directly.
