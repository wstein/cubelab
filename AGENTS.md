# CubeLab agent guidance

## Purpose and sources of truth

CubeLab is an independently developed, static, browser-local cube studio:
state conversion, algorithm editing/playback, Academy solvers, timer and smart cubes.
Start with [README.md](README.md) and [architecture.md](architecture.md).
Keep implemented behavior, planned migrations and proven solver guarantees distinct.
This file guides work; it does not approve a feature, migration or release.

## Repository map and stack

- `src/State/`: Cube Rosetta canonical facelets, codecs, piece reduction and validation.
- `src/Move/`: notation AST/parser, execution, transformations and compatibility.
- `src/Solver/`: existing solver methods, coordinates and table interfaces.
- `src/Render/`: cube geometry; `src/client/cube-gl.ts`: native WebGL viewport.
- `src/client/`: TypeScript/Vanilla DOM state, playback, Academy, timer and workers.
- `src/client/smart-cube/`: UI adapters, not Bluetooth packet/protocol ownership.
- `src/Components/`, `src/pages/`, `src/styles/`: Astro shell, pages and styling.
- `public/`: static resources, including versioned solver tables in `public/solver/`.
- `test/`: Vitest unit/integration tests; `e2e/`: Playwright browser regressions.
- `docs/`: feature contracts and plans; `scripts/`: maintenance/generation utilities.

ReScript 12.3.1 implements domain/solver code; TypeScript and Astro handle the UI.
Size support is feature-specific; rendering support does not prove solver completeness.
ReScript emits adjacent `.res.mjs` ES modules; regenerate rather than hand-edit them.
The current renderer is native WebGL, not Three.js or React. Preserve render-on-demand
behavior and the persistent viewport contract in [3d-viewport.md](docs/3d-viewport.md).
The [Three.js migration plan](docs/three-renderer-migration.md) is not completed work.

## Cross-project ownership

[PuzlWerk exists](https://github.com/wstein/puzlwerk). It will own shared ReScript cube
mechanics, state models, coordinates, orientation/symmetry and reusable solver
integration through versioned APIs. Do not describe it as an uncreated repository
or claim a proposed package/API is already released or consumed by CubeLab.
CubeLab keeps its studio, Academy, timer, device workflows and application UI.
Cubacle remains a separate optional Rust search provider behind a checked adapter;
do not introduce a Rust project in PuzlWerk or silently rename repository ownership.
CubeAssembler remains the scanning/assembly application; it is not the CubeLab UI.
Consult [Cubistry #21](https://github.com/wstein/cubistry/issues/21), then the current
[PuzlWerk #5](https://github.com/wstein/puzlwerk/issues/5) and
[PuzlWerk #6](https://github.com/wstein/puzlwerk/issues/6) for the gated handoff.

Current gates and their boundaries (see Cubistry #21):

1. The shared 2×2 solver transfer (PuzlWerk #5) and Cubistry's consuming integration
   (#23) closed on 2026-10-28; full 2×2 MVP acceptance remains tracked by
   Cubistry #18/#21.
2. A separately user-approved, bounded 3×3 picture/calendar pilot: PuzlWerk #21,
   merged on 2026-10-29, adds a center-aware 3×3 picture provider toward PuzlWerk
   #6 (3×3 Supercube center orientation), which remains open. CubeLab #27 (for
   #26) is still a Draft under review; Cubistry #67/#70 are tracked separately.
   The pilot is not general permission to replace CubeLab's working systems,
   migrate the CubeLab application or expand the solver scope.
3. Cubistry #21 retains CubeAssembler migration as M2 and CubeLab migration as M3.
   The comparative priority of the 3×3 pilot and those full migrations has not
   been explicitly settled; do not call the older sequence superseded. Each
   implementation/migration phase still needs explicit human approval.

Keep other migrations separate. Do not remove, relocate or replace working CubeLab
mechanics, codecs, rendering or solver features without an approved replacement,
migration plan, license review, compatibility tests and rollback path.
Necessary fixes remain allowed within their authorized scope. Before expanding a
shared subsystem, check PuzlWerk ownership and track the migration rather than
creating a second permanent engine. Coordinate changes through the relevant issues;
a documentation PR does not authorize cross-repository edits or new dependencies.

## State, solver and rendering contracts

Keep notation parsing, canonical state execution, solving and rendering separate.
Rendering consumes validated state; it must not reparse notation or mutate physics.
Color-only facelets cannot preserve every printed sticker identity or up direction.
Separate physical pose, optical symmetry, camera frame and whole-cube rotation.
Replay solver answers from the actual input and verify the intended complete goal.
Do not infer exact-front or partial-display optimality from ordinary color solving.
The [2×2 table](docs/optimal-2x2-solver.md) is rotation-canonical: its classical HTM
bound does not automatically apply to fixed-frame printed displays. Count a quarter
or half face turn as one HTM move; state the metric and goal of any length claim.
Do not regenerate tables, add search algorithms or expand supported sizes without scope.
Keep expensive solving in the existing worker boundary; do not block the UI thread.
Preserve [state validation](docs/state-validation.md), codec round trips and source spans.
For device changes follow [smart-cube ownership](src/client/smart-cube/README.md):
transport owns GATT/packets; Regrip core owns orientation; CubeLab adapts normalized
session events. Do not apply a displayed regrip twice to logical state.
Keep input, replay and device data browser-local; do not add telemetry/server storage.

## Development and human approval

Read the issue, relevant feature contracts and existing tests before editing.
State acceptance criteria; keep implementation within the approved scope.
Ask for explicit approval before each new implementation/migration phase or expansion.
Use a dedicated feature branch/worktree; coordinate shared branches before rebasing.
Preserve working behavior and add a focused regression for an actual bug or feature.
Open/update the requested Draft PR with scope, commands/results, risks and dependencies.
Obtain an independent review; the author fixes findings and the reviewer rechecks.
Human approval is required to mark Ready, merge, deploy or publish; never auto-merge.
Use Rebase and Merge for approved PRs; no squash merely to reduce commit count.
Do not create another PR when asked to update an existing one.

## Git history and atomic commits

- Keep the history of protected branches strictly linear. Prefer **Rebase and Merge** over Squash and Merge; do not introduce merge commits.
- Use small, focused, **atomic Conventional Commits**. Each commit should represent one coherent, independently understandable change, with its relevant tests or documentation when applicable.
- Preserve meaningful individual commits; do not squash merely to reduce the commit count. Clean up only redundant fixups or incomplete intermediate commits when needed.
- Do not rewrite shared or protected branch history, force-push a shared branch, change branch protection, mark PRs ready, or merge without the required human approval. Coordinate any necessary feature-branch history rewrite with collaborators.
- For stacked PRs, preserve their dependencies and avoid duplicated commits; verify the resulting diffs and relevant checks after rebasing.

## Commands and validation

Use the committed `package-lock.json` with `npm ci`; do not refresh dependencies casually.
Pages CI selects Node.js 24. Bun is also needed by generation scripts and the current
Playwright preview command (`bunx astro preview`); do not imply browser tests need no Bun.
Use `npm run dev` for Astro, `npm run res:dev` for a separate ReScript watch process,
and `npm run preview` for the production build. Do not invent a combined watcher.
Run the applicable existing commands and report any failures or unavailable checks:

```sh
npm run format:check
npm run lint
npm test
npm run build
npx playwright install chromium
PLAYWRIGHT_PORT=4322 npm run test:browser
```

`format:check` checks ReScript formatting; `lint` also compiles it. `npm test` compiles
ReScript and runs the suites selected by `vitest.config.ts`, not Playwright.
`test:browser` builds first and uses `playwright.config.mjs`; use a free port because
that config can reuse an existing server. Never test another checkout accidentally.
For domain changes cover move/inverse replay, parity/twist rules, codecs and frames;
for UI changes cover playback, timer, accessibility, small screens and viewport behavior.
For smart cubes run replay/contract tests; do not claim hardware/firmware validation
without a real-device smoke test. See the matrix and release gates in architecture.md.
Pages CI runs install, tests and build on main. The CI workflow runs tests, build and
the Playwright browser tests on pull requests; it does not run `format:check` or `lint`,
which currently fail on existing files. Check the actual check runs of a PR rather than assuming.
For documentation-only changes verify links, commands and `git diff --check`; disclose
which repository checks actually ran. Do not invent a Markdown-lint script.

## Documentation, knowledge and provenance

Use README.md, architecture.md and linked `docs/` contracts as CubeLab's knowledge base;
there is no implied new knowledge-vault or ADR directory to scaffold here.
Update the relevant contract when behavior changes; link instead of duplicating it.
Keep examples reproducible and distinguish facts, proposals, limitations and approvals.
Shared decisions belong in [PuzlWerk's knowledge base](https://github.com/wstein/puzlwerk/tree/main/docs/knowledge-base)
and ADR process; proposed decisions are not accepted merely because an agent cites them.
Preserve upstream revisions, licenses, table versions and checksums when reusing code.
Retain [LICENSE](LICENSE) and [NOTICE](NOTICE), including third-party solver notices.
Do not rewrite established contracts silently or turn future plans into current guarantees.

## PuzlWerk naming conventions

- Display/branding: **PuzlWerk**. Technical identifiers, paths, directory names and imports always use lowercase `puzlwerk`.
- GitHub repository: `wstein/puzlwerk`. npm scope: `@puzlwerk/*`; a scope name does not imply a published package or authorize a new dependency.
- Apply exact-case, context-aware edits to active references; never use global case-insensitive replacements.
- Preserve historical ADR wording, immutable snapshots, source URLs/revisions/hashes, quotations and license/copyright notices. Classify old-name occurrences as historical, active or uncertain; report uncertain cases for review instead of silently changing them.
- Naming-only work does not authorize a solver/application change, package publication or migration. Preserve existing `@cubistry/*` packages.
