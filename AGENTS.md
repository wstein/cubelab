# Agent guidelines

## Git history and atomic commits

- Keep the history of protected branches strictly linear. Prefer **Rebase and Merge** over Squash and Merge; do not introduce merge commits.
- Use small, focused, **atomic Conventional Commits**. Each commit should represent one coherent, independently understandable change, with its relevant tests or documentation when applicable.
- Preserve meaningful individual commits; do not squash merely to reduce the commit count. Clean up only redundant fixups or incomplete intermediate commits when needed.
- Do not rewrite shared or protected branch history, force-push a shared branch, change branch protection, mark PRs ready, or merge without the required human approval. Coordinate any necessary feature-branch history rewrite with collaborators.
- For stacked PRs, preserve their dependencies and avoid duplicated commits; verify the resulting diffs and relevant checks after rebasing.

## PuzWerk cross-project architecture

PuzWerk [already exists](https://github.com/wstein/puzwerk). Its shared ReScript
core will own cube mechanics, state models, coordinates, physical orientation
and symmetry semantics, and reusable solver integration. CubeLab remains an
independently developed application; existing functionality is not migrated by
this guidance. Consult [Cubistry #21](https://github.com/wstein/cubistry/issues/21),
[PuzWerk #5](https://github.com/wstein/puzwerk/issues/5) and
[PuzWerk #6](https://github.com/wstein/puzwerk/issues/6) before shared-core changes.

The current approved order is: complete Cubistry's 2×2 pilot; migrate the
reusable 2×2 solver into PuzWerk; migrate Cubistry to that API; then extend
PuzWerk with 3×3 Supercube center orientation. Each implementation or migration
phase requires explicit human approval. Older CubeAssembler-first/CubeLab-M3
notes are historical, not authorization for unrelated migrations.

Keep working Cube Rosetta codecs, native WebGL, solvers and application logic
until an approved replacement and regression-tested migration plan exist.
Necessary fixes remain allowed within their authorized scope; do not create a
second permanent shared engine or silently remove features/tests. Cubacle is
a separate optional Rust solver provider, not a new Rust package in PuzWerk.
CubeAssembler retains its own scanning and assembly workflows. Verify API,
license and state/codec fidelity before cross-project reuse; ordinary color
facelets do not preserve unique printed sticker identities or orientation.
