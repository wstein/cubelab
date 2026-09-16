# Cube Rosetta large-cube state extensions

4×4×4 and 5×5×5 do not have a universal CP/CO, SSE, or Singmaster state
encoding. Wings of the same colour pair and centres of the same colour are
interchangeable, so no external notation can assign them a portable identity.

CubeLab's copy cards use a versioned, directly pasteable envelope:

```text
Cube Rosetta CP/CO coordinates 5×5 v1
cp: …; co: …
wings: UR1:UR …
centres: U1:U …
state: UUUUU…
```

`wings` and `centres` are a readable numbered positional inventory. `state:`
is the canonical, authoritative facelet payload; it preserves every sticker
without inventing identities for interchangeable pieces. The SSE and
Singmaster large-cube cards use the same lossless envelope with their own
header. Setup accepts all three headers for the matching cube size.

The 2×2×2 and 3×3×3 cards remain their existing standard CP/CO, SSE, and
Singmaster formats.
