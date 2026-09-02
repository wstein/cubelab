# Hamilton macro programs

Hamilton macro programs are an explicit import format for enormous recursive
move constructions. They are separate from standard, Ruwix, and FMC notation.
Definitions may use `def name = expression` or `name = expression`, comments
begin with `#`, and `export name` selects the root program.

The parser retains a macro DAG instead of unfolding it. `measure` calculates
quarter-turn count, source-element count, and dependency depth with memoized
structural evaluation. References, grouped repeats, and inverted references
are measured without generating the move stream; cycles and undefined macros
produce diagnostics.

Definitions may select source elements with `name(start,end)` or `name(start)`.
The end is exclusive and indices refer to the definition's direct source nodes,
not expanded moves. `stream`, `prefix`, and `window` consume the DAG lazily, so
inspection of a short excerpt never allocates the exported program.

This foundation is intentionally execution-free. A Workbench consumer will use
the same DAG for selected-node inspection and streaming playback, so a program
such as Bruce Norskog's 3,674,160-turn circuit can be validated without
allocating millions of moves or states.
