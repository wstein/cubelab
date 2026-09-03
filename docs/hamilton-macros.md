# Hamilton macro programs

Hamilton macro programs are an explicit import format for enormous recursive
move constructions. They are separate from standard, Ruwix, and FMC notation.
Definitions may use `def name = expression` or `name = expression`, comments
begin with `#` or `//` (including trailing comments), and `export name`
selects the root program.

The dialect also accepts standard bracket expressions: `[A,B]` is the
commutator `A B A' B'`, and `[A:B]` is the conjugate `A B A'`. Timed pauses
such as `@0.6s` remain lazy stream events and are honoured by the streaming
player. An expression may be supplied directly, or a final line containing a
defined name may select the root, so both forms below are valid:

```text
s100 = ([R',U]6 [F:D']@0.6s)100
s100
```

```text
([R',U]6 [F:D']@0.6s)100
```

Standalone lines after definitions form the executable root expression. This
keeps a trailing expression such as `(b a')12 b` separate from `b`'s
definition instead of accidentally appending it to that macro.

The Workbench can import `.alg` and legacy `.orbit64` text sources. Imported
sources with no `export` declaration use a final bare definition reference, or
otherwise the final definition, as the root. The parser retains a macro DAG
instead of unfolding it. `measure` calculates QTM (quarter turns), HTM
(expanded face-turn events), source-node count, and dependency depth with memoized
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

**Unfold selected node to Moves** exports a selected definition as plain
notation for the ordinary editor, preserving timed pauses. It uses the same
500-HTM materialization limit as normal tape playback.

The ordinary **Moves** editor also accepts definition-bearing macro programs.
It materializes only programs of at most 500 move events and sends that bounded
result to the normal tape player; larger programs report the limit and must use
the streaming player instead.

For long-running playback, **Start streaming player** owns one resumable macro
generator and feeds the viewport one move at a time. It retains only the
current cube state, generator cursor, and counters; the tape scrubber, rewind,
and jump-to-end controls are disabled because no materialized timeline exists.
