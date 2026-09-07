# 2×2 Petrus-inspired Academy

This Academy is a small, block-building route inspired by Petrus and 2×2
Roux-square practice. It is not presented as a canonical Petrus method: a
2×2 has only corner cubies and no fixed centres or edge pieces.

For each setup, CubeLab scores four equivalent lower-back teaching frames,
chooses the strongest one deterministically, and locks it for all three
phases. The frame never changes mid-lesson.

1. **First square / block** — solve a two-corner square in the selected
   Academy-relative LBD view.
2. **Back pair** — preserve that square and solve the adjacent back-corner
   pair.
3. **Finish** — solve the remaining corner relation. Any monochrome global
   orientation is accepted because the puzzle has no fixed centres.

The worker plans each stage separately, replays every boundary, and rejects a
route when a named phase goal is not actually reached. The final phase uses
the table-backed exact 2×2 solver only after the first two contracts hold.
