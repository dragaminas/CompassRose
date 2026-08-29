# State: Installation Boundary

## Lifecycle State

implementation_running

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- last_implementation_result: succeeded
- last_quality_gate_result: passed
- last_review_result: not_run
- validation: confirmed

## Current Reality

Specified after the user asked what would remain before building a test program with CompassRose as
the validation, and then named the four items to attack. The four were found empirically, by
creating a small repository that was not this one and walking first contact until each one stopped
the walk.

The common cause turned out to be one distinction nothing had ever needed to make: the installation
and the target have always been the same directory. `ContractRegistry` resolved schemas against the
target; the starter `CONFIG.md` declared `contracts_root: src/contracts` for `doctor` to verify;
the runtime-critical watch list named CompassRose's own modules under the target's root. All three
agreed, and all three were wrong for the same reason.

Recorded as ADR-0049.

## Implemented Deliverables

- `src/config/installationPaths.ts`: the installation root, `isSelfHosted`, `isContractPath`,
  `resolveContractOrRepositoryPath`, and `localizeContractReferences`.
- `ContractRegistry`'s first parameter renamed `installationRoot` and resolved there, along with
  `ORCHESTRATOR_RUNTIME_CRITICAL_PATHS`. The signature is unchanged, so the registry's own tests
  still point it at a fixture root.
- contract manifest entries resolved to the installation in `readEntry`, which `measureManifest`
  and therefore the budget check go through.
- prompts localized at the adapter boundary, in `CodexCli.runStructured`, `CodexCli.run` and
  `OpenCodeCli.run` — the one line each writes the assembled prompt to disk.
- `documentation.contracts_root` removed from the required keys, the type, the starter config and
  the `paths` doctor check. A `CONFIG.md` that still declares it loads; the key is ignored.
- the `contracts` doctor check, over the installation. `fail`, not `info`: every structured call in
  the loop reads a schema from there.
- `--cwd` on `setup`, `doctor` and the interactive session, through a new `parseWorkspaceArguments`
  that accepts only the two flags those commands actually have.
- `--cwd` made effective in `feature-validation` and `acknowledge-blocker`, which parsed it and then
  discarded it by resolving the git root from the process's own directory.
- `setup` commits the paths it created, through `GitClient.commit`, with `--no-commit` to opt out.
- `setup` renders `CONFIG.md` from `detectProjectFacts`: name, source root, documentation root, and
  each gate whose script is unambiguous. Ambiguous gates stay empty with the candidates named.
- a `name` project fact (`package.json`, `Cargo.toml`, `pyproject.toml`, falling back to the
  repository directory name), carrying provenance like every other fact, shown by `/proyecto`.
- packaging: a shebang on `src/cli/main.ts`, `files` shipping `dist`, `src` and the templates,
  `prepare: npm run build`, and an entry-point guard that compares `realpathSync` so a linked
  installation runs instead of silently exiting 0.
- `tests/installationPaths.test.ts` (7) and `tests/setupBootstrap.test.ts` (8), the latter against
  real git repositories that are not this one.

## Verified Against A Foreign Repository

`npm link`, then, from a directory outside both repositories:

- `compassrose setup --cwd <widget>` — 15 files, committed, worktree clean.
- `compassrose doctor --cwd <widget>` — `Status: OK`, `PASS contracts` naming the installation.
- `compassrose run --cwd <widget>` — `Next step: stop`, `No non-completed feature or fix remains.`
- the code inventory is `src, 1 module`: the target's own file, and nothing of CompassRose's.
- the generated `CONFIG.md` reads `name: widget`, `typecheck: "npm run typecheck"`,
  `tests: "npm run test"`, `build: "npm run build"`.

## Remaining Deliverables

- **no agent has been called against a foreign repository.** Everything verified above is
  deterministic: bootstrap, readiness, the scheduler's decision to stop. A real specification
  conversation and a full plan → implement → gate → review cycle are what the validation program is
  for, and none of it has run yet.
- `tests/testUtils.ts`'s `copyContractsIntoWorkspace` is called by about thirty tests and is no
  longer needed by the registry it existed for. It still runs, still copies CompassRose's contracts
  into every fixture workspace, and removing the calls is a mechanical change with enough surface
  to deserve its own pass rather than riding along here.
- `proto/`'s e2e harness syncs contracts into its cloned scenario workspaces for the same reason and
  is untouched, as is its dependence on cloning `HEAD`.
- the default gate allowlist does not include `node -e`, so a foreign project gets the strict bound
  while this repository declares the escape hatch. Whether the default is calibrated is something
  only a real run against a foreign project answers.
- `--cwd` is threaded through the CLI; `brainstorm` still takes none.

## Outline Progress

- 1. `src/config/installationPaths.ts`: complete
- 2. Point `ContractRegistry` and `readEntry` at it: complete
- 3. Localize contract references at the adapter boundary: complete
- 4. Remove `contracts_root`; add the `contracts` check: complete
- 5. `--cwd` across the CLI surface: complete
- 6. `setup`: seed from facts, commit what it created: complete
- 7. Packaging: shebang, `files`, `prepare`, symlink-safe entry guard: complete

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none

## Last Approved Change

The installation/target distinction, `--cwd` across the CLI, and a `setup` that leaves a usable
repository seeded from what it read.

## Known Gaps

- See Remaining Deliverables. The one that matters is that no agent call has crossed this boundary
  yet: what is verified is that CompassRose *starts* correctly somewhere else, not that it *works*
  there.

## Next Planning Hint

Run a real specification conversation and one full loop against a repository that is not this one.
That is the validation program, and it is now the only thing standing between here and knowing
whether the loop works anywhere but home.
