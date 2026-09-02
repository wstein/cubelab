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

This foundation is intentionally execution-free. Streaming playback and
element-indexed slices will consume the same DAG in later phases, so a program
such as Bruce Norskog's 3,674,160-turn circuit can be validated without
allocating millions of moves or states.
