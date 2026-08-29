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

## What The First Real Agent Runs Found

Pointing a built, linked installation at `taskr` -- a small Node CLI, not this repository -- and
holding a real specification conversation turned up seven defects, in the order they stopped a run.
Each is fixed; each was invisible from inside this repository for the same reason the contracts were.

- **`src/agents/heartbeatRunner.mjs` did not exist in `dist/`.** `tsc` emits `.ts` and nothing else,
  and the sidecar every agent call spawns resolved next to its own module -- `src/agents/` under
  tsx, `dist/agents/` after a build. Every agent call from a built installation died with
  `MODULE_NOT_FOUND`. Nobody had ever run from `dist`. Now addressed through
  `installationAssetPath`, the same rule as the contracts, with `tests/package-metadata.test.js`
  failing if `files` stops shipping `src`.
- **The core-runtime smoke gate leaked into the target.** `npx tsx scripts/runtimeSmokeTest.mjs
  src/cli/main.ts`, injected whenever a diff touched `src/orchestrator/`, `src/cli/` or `src/task/`
  -- this repository's layout, in logic that runs against whatever repository it is aimed at. A
  target with its own `src/cli/` would have been handed a gate invoking a script it does not have.
  Recorded under `030`'s Remaining Deliverables and closed here, not deleted: bounded to a
  self-hosted run, and the decision extracted into a pure function so both halves are assertable.
- **A prompt had two bases, and the agent resolved the wrong one.** Contracts absolute against the
  installation, everything else relative against the target. Codex resolved the relative paths
  against the base it had just learned from the absolute one and read CompassRose's own `ADR.md`,
  `SAD.md`, `ROADMAP.md` and `DMS.md` while reasoning about `taskr`. Nothing in the prompt was
  wrong; the two bases were, and reading the wrong project was the correct interpretation of what it
  had been handed.
- **Making every path absolute fixed that and cost more than it saved.** The correction to the
  correction, and it took a second full run to see it: a model writes paths in the style it was
  shown. The planner, handed absolute paths throughout, wrote absolute `allowed_paths` into the
  feature specification and then into a task document -- where `isPathAllowedByPrefix` compares them
  against repository-relative diff paths and can never match. The implementer produced correct code
  with eleven passing tests and the run refused it as out of scope. Only the contracts are absolute
  now; a contract is always an instruction to read and never a value the model gives back, while a
  target path is usually both. The remaining ambiguity is closed by a preamble that states the
  working directory and asks for output in the same style the relative paths were shown in.
- **The default gate allowlist did not admit Node's own test runner.** It carried `pytest`,
  `go test`, `cargo`, `mvn` and `dotnet`, and the first foreign project it was ever pointed at was a
  zero-dependency Node CLI -- the natural shape for a small tool -- whose planner proposed
  `node --test tests/task-store/` and was refused. Added as `node --test`, never a bare `node`: a
  prefix ends at a word boundary, so this admits the runner and still refuses `node -e "<anything>"`.
- **`compassrose brainstorm` implemented none of `024`.** It printed the agent's `reply` and dropped
  the decision it surfaced instead of taking, the dimension it proposed, the provenance section and
  the audit of the draft against its own transcript -- all four reachable only from the interactive
  session, while `brainstorm` is the other documented entry point into the same flow. Its
  architecture question was written into the transcript as prose and never reached the competency
  profile, so answering it changed nothing. The three mechanisms now live in
  `src/cli/specificationTurn.ts`, shared by both front ends the way `runValidationLoopForItem`
  already is.
- **The agent-context log line printed a walk back into the installation.** `relativePath()` against
  an absolute repository root resolved its second argument through `process.cwd()`, which is the
  repository root only when nobody passed `--cwd`. The artifacts landed where they belong; the
  message claimed they had been written into CompassRose's own tree. A display bug, and the first
  one only reachable once `--cwd` existed.

The runs that followed produced, in `taskr`, a confirmed feature and a completed task: the
brainstormer raised a product-axis decision and the human answered it, the audit found seven
commitments the draft made that nobody had chosen, the validation-weight ensemble agreed unanimously
on `architectural` citing that audit, and the implementer wrote `src/task-store/store.js` and its
tests test-first, red before green, through gates that passed and a reviewer that approved. None of
that had ever run outside this repository.

## Remaining Deliverables

- **the prompt localizer removes an ambiguity, not a capability.** A read-only agent can read the
  filesystem whether or not a prompt names a path; that boundary belongs to the external CLI's
  sandbox (ADR-0048), and nothing here confines it. What is fixed is that reading the wrong
  project is no longer the reasonable interpretation of the instructions given.
- the rewrite keys on backticks, which is how every path this codebase renders into a prompt is
  written. A path written any other way stays relative -- correct for the target, wrong for a
  contract. Nothing currently does that.
- **task and feature slugs are unbounded, and Windows is not.** A feature titled in a sentence
  produced a 105-character task filename which, under a nested `compassrose/features/<slug>/tasks/`
  path in a normally-placed repository, crossed the 260-character limit. Node wrote the file and git
  could not then delete it. Worked around in the target with `core.longpaths`, but the defect is
  CompassRose's: nothing bounds the slug it derives from a title.
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
