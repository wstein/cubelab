# NISS helper

CubeLab provides a deliberately small, state-verified Normal/Inverse Scramble
Switch helper for 3×3 Fewest Moves practice. It does not attempt to manage an entire FMC
attempt or infer where a competitor switched sides.

## Convention

For a current scramble `S`, enter moves recorded on the normal side as `N` and moves
recorded on the inverse side as `I`. The helper constructs the candidate

```text
N · I⁻¹
```

and then applies `S · N · I⁻¹` to a solved cube using the same fixed-frame executor as
the converter. The candidate is exposed as a verified solution only if the resulting
facelet state is exactly solved. This replay check is normative; the displayed formula
alone is never treated as proof that the side assignment or ordering is correct.

The inverse-scramble display is produced by structured AST inversion rather than string
reversal. Groups, commutators, conjugates, rotations, ranges, and turn amounts therefore
retain their mathematical meaning.

## Scope and limits

- The helper is visible only for 3×3, matching WCA FMC practice.
- Normal- and inverse-side fields use modern SiGN parsing.
- The current scramble retains its selected source dialect while it is parsed.
- A successful result reports the expanded move count and can be loaded into the main
  algorithm editor and tape player.
- A failed replay leaves the candidate unloaded and explains that its side assignment
  or order must be corrected.
