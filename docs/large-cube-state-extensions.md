# Cube Rosetta large-cube state extensions

4×4×4 and 5×5×5 use Cube Rosetta extensions for CP/CO and Singmaster state
encoding. SSE uses native numbered part cycles. Colour-only facelets do not
identify individual same-colour centres or same-colour wing twins.

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
without inventing identities for interchangeable pieces. The Singmaster card uses
cycles over numbered sticker locations (`U1` through `B16` or `B25`); equal-
colour sticker identities are assigned deterministically in row-major order.
Setup accepts all three headers for the matching cube size.

The SSE card emits native CubeTwister / Superset ENG cycles over numbered
parts, with face-letter order preserving sticker orientation and a first-part
`+`/`-` prefix supplying any closing twist or flip. The renderer assigns
indistinguishable pieces deterministically within each orbit and leaves solved
parts fixed where possible. Marked-centre logo orientation is not represented
by colour-only facelets. Previous SSE envelopes remain accepted by Setup.

Copy/paste examples (select the matching size in Setup):

| State | 4×4 SSE | 5×5 SSE |
| --- | --- | --- |
| Solved | `(urf)` | `(urf)` |
| Centre-only | `(r1,u2,f3)` | `(r1,u2,f3) (r5,u6,f7)` |
| Wing-only | `(ur1,rf1,fu1)` | `(ur1,rf1,fu1)` |

The scramble `R U` on 4×4 exports as:

```text
(+urf) (-ufl,ulb,ubr,bdr,dfr) (ur1,br1,dr1,fr1,uf1,ul1,ub1) (ur2,br2,dr2,fr2,uf2,ul2,ub2)
```

On 5×5, append the middle-edge cycle `(ur,br,dr,fr,uf,ul,ub)`.

The 2×2×2 and 3×3×3 cards remain their existing standard CP/CO, SSE, and
Singmaster formats.
