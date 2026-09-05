# Orbit64: 70-bit orientation-preserving 3×3 state encoding

## Abstract

Orbit64 is CubeLab's fixed-length, URL-safe encoding for one complete, physically reachable
3×3×3 state. It represents both the cubie position and the cube's whole-cube centre frame.
The encoding is exactly 12 Base64URL characters (nine bytes). Its leading two bits are reserved
and must be zero, leaving a 70-bit payload.

Orbit64 encodes only legal 3×3 states. It does not serialise sticker arrangements with a broken
corner-twist sum, edge-flip sum, permutation parity, or centre frame.

## Coordinate model

The canonical cubie coordinate order is CubeLab's `cp`, `co`, `ep`, and `eo` order:

- `cp`: eight-corner permutation, ranked lexicographically (`0` through `8! - 1`).
- `co`: the first seven corner orientations, little-endian base 3. The eighth is implied by
  the twist sum.
- `ep`: twelve-edge permutation, ranked lexicographically *within the parity class matching
  `cp`* (`0` through `12!/2 - 1`).
- `eo`: the first eleven edge orientations, little-endian base 2. The twelfth is implied by
  the flip sum.

Parity-aware edge ranking is essential. A naïve full edge-permutation rank spends one bit on
the parity-mismatched half of the coordinate space, which cannot occur on a physical cube.

The four coordinate radices are:

| Coordinate | Radix |
| --- | ---: |
| `cp` | 40,320 (`8!`) |
| `co` | 2,187 (`3^7`) |
| `ep` | 239,500,800 (`12!/2`) |
| `eo` | 2,048 (`2^11`) |

## Whole-cube frame

`frame` is an integer from 0 through 23. Starting with the canonical reconstructed state,
apply `x` `xTurns` times, then `z` `zTurns` times, then `y` `yTurns` times. The resulting
state is the decoded facelet orientation.

| Frames | `xTurns` | `zTurns` | `yTurns` |
| --- | ---: | ---: | --- |
| 0–3 | 0 | 0 | 0, 1, 2, 3 |
| 4–7 | 1 | 0 | 0, 1, 2, 3 |
| 8–11 | 2 | 0 | 0, 1, 2, 3 |
| 12–15 | 3 | 0 | 0, 1, 2, 3 |
| 16–19 | 0 | 1 | 0, 1, 2, 3 |
| 20–23 | 0 | 3 | 0, 1, 2, 3 |

The encoder first centre-normalises a valid input to obtain cubie coordinates, then selects the
unique table entry whose transformed canonical centres match the input. Thus `encodeState` and
`decodeState` preserve all 54 facelets exactly, including a held or whole-cube-rotated frame.
`encode`, which accepts coordinates rather than facelets, always uses frame 0.

## Payload construction

Let `CP`, `CO`, `EP`, `EO`, and `F` be the ranks above. The unsigned 70-bit payload is:

```text
P = (((((CP × 2187 + CO) × 239500800 + EP) × 2048 + EO) × 24) + F)
```

Write `P` as nine big-endian bytes and encode those bytes using the Base64URL alphabet:

```text
ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_
```

The resulting string is always 12 characters. Decoders must reject any token whose decoded
integer is at least `2^70`, has an incorrect length, or contains a character outside this
alphabet.

On decode, repeatedly divide by 24, 2,048, 239,500,800, 2,187, and 40,320 to recover the
fields in reverse order. Unrank `ep` in the parity class determined by the decoded `cp`,
reconstruct the canonical state, and apply its frame-table transform.

The legal state count with the 24 centre frames is:

```text
(8! × 3^7 × 12! × 2^11 ÷ 2) × 24 ≈ 2^69.815
```

It therefore fits within the 70-bit payload. The final division by two is the required
corner/edge permutation-parity constraint.

## Test vectors

| State | Token |
| --- | --- |
| Solved, canonical frame | `AAAAAAAAAAAA` |
| Solved after `x` | `AAAAAAAAAAAE` |
| Superflip, canonical frame | `AAAAAAAAAL_o` |
| `U`, canonical frame | `FRot3QyvoAAA` |

## Compatibility

This specification is the current unversioned Orbit64 format. Tokens from CubeLab's earlier
canonical-frame-only experimental encoder are not defined by this format and must not be treated
as interchangeable with these values.
