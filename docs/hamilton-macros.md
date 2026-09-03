# Hamilton macro programs

Hamilton macro programs are an explicit import format for enormous recursive
move constructions. They are separate from standard, Ruwix, and FMC notation.
Definitions may use `def name = expression` or `name = expression`, comments
begin with `#`, and `export name` selects the root program.

The Workbench can import `.alg` and legacy `.orbit64` text sources. Imported
sources with no `export` declaration use their final definition as the root;
typed programs remain strict and require `export name`. The parser retains a
macro DAG instead of unfolding it. `measure` calculates
quarter-turn count, source-element count, and dependency depth with memoized
structural evaluation. References, grouped repeats, and inverted references
are measured without generating the move stream; cycles and undefined macros
produce diagnostics.

Definitions may select source elements with `name(start,end)` or `name(start)`.
The end is exclusive and indices refer to the definition's direct source nodes,
not expanded moves. `stream`, `prefix`, and `window` consume the DAG lazily, so
inspection of a short excerpt never allocates the exported program.

The Workbench presents each definition with its DAG measurement and can send a
bounded selected-node window into the existing linear playback timeline. Its
zero-based start accepts arbitrary non-negative integer offsets; playback is
deliberately capped at 500 streamed moves per preview. Thus a program such as
Bruce Norskog's 3,674,160-turn circuit can be validated and examined without
allocating millions of moves or states.

For long-running playback, **Start streaming player** owns one resumable macro
generator and feeds the viewport one move at a time. It retains only the
current cube state, generator cursor, and counters; the tape scrubber, rewind,
and jump-to-end controls are disabled because no materialized timeline exists.
