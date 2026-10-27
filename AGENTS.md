# Agent guidelines

## Git history and atomic commits

- Keep the history of protected branches strictly linear. Prefer **Rebase and Merge** over Squash and Merge; do not introduce merge commits.
- Use small, focused, **atomic Conventional Commits**. Each commit should represent one coherent, independently understandable change, with its relevant tests or documentation when applicable.
- Preserve meaningful individual commits; do not squash merely to reduce the commit count. Clean up only redundant fixups or incomplete intermediate commits when needed.
- Do not rewrite shared or protected branch history, force-push a shared branch, change branch protection, mark PRs ready, or merge without the required human approval. Coordinate any necessary feature-branch history rewrite with collaborators.
- For stacked PRs, preserve their dependencies and avoid duplicated commits; verify the resulting diffs and relevant checks after rebasing.

