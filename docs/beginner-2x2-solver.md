# 2×2 Beginner / Ortega Academy

The 2×2 Academy teaches a replay-verified three-phase route:

1. Build the first layer.
2. Orient the last-layer corners.
3. Permute the last-layer corners (PBL).

A 2×2 has no fixed centres. Its final goal is therefore six monochrome faces,
not one particular URFDLB orientation. Each generated phase must satisfy its
own corner-state invariant before the next phase begins; an HTM-optimal finish
may be shown separately, but is never relabelled as these teaching phases.

The planner's candidate route is replayed phase-by-phase. A route is rejected
if phase 1 has not fixed the D-layer corners, phase 2 has not oriented all U-layer
corners while preserving that layer, or phase 3 does not leave every face monochrome.
