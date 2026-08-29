# Architecture: Installation Boundary

## Boundaries

Two roots, named apart:

- **installation root** — where CompassRose itself lives. Resolved once, in
  `src/config/installationPaths.ts`, by walking two levels up from that module, which lands on the
  package root under both `src/` (tsx) and `dist/` (built). Owns `src/contracts/`.
- **repository root** — whatever repository this run is pointed at. Owns `compassrose/`, `docs/`,
  and the project's own code.

Everything CompassRose already had was repository-relative, and for `compassrose/` that is correct
(ADR-0046). The contracts were the one thing filed on the wrong side of the line.

## The seam

`src/contracts/planner/input.md` remains a contract's **name**, unchanged at every site that refers
to one — a hundred-odd literals across `orchestrator.ts`, `refinementFeedback.ts` and
`promptBuilding.ts`, plus every comment and feature document that cites one. A name becomes a path
at exactly three places:

- `ContractRegistry`, which loads the JSON schemas. Its first constructor parameter is now
  `installationRoot`; it was called `repositoryRoot`, and the name was the defect.
- `readEntry`/`measureManifest`, which read a manifest entry's content for the budget check.
  `resolveContractOrRepositoryPath` sends contract entries to the installation and everything else
  to the target.
- `CodexCli` and `OpenCodeCli`, at the single line where an assembled prompt is written to disk for
  the agent. `localizeContractReferences` rewrites every contract reference to a path the agent —
  whose working directory is the target — can open.

The adapter is the right owner of the third because it is the one place every prompt passes
through, and because it is the only moment at which the name has to become an instruction to open a
file. It is a no-op when self-hosted, which is what makes this repository's own prompts identical
to what they were.

`ORCHESTRATOR_RUNTIME_CRITICAL_PATHS` moves with the schemas for the same reason: those are
CompassRose's own modules, and a `--loop` run should restart when *they* change, not when a file of
the same name in someone else's repository does.

## What is deliberately not done

Contracts are not copied into the target. That was the available quick fix and it is the defect: it
puts CompassRose's internals into the target's source tree, where `028-project-understanding` reads
them back as the target's own code.

`contracts_root` is not kept as an optional override. A project has nothing to say about the
internals of the tool acting on it, and an override would re-open the same hole with a config key
in front of it.

## Setup

`setup` remains deterministic — no AI call, no network. It gained two things:

- it renders `CONFIG.md` from `detectProjectFacts`, following the rule `deriveGateCandidates`
  already stated for itself: one candidate is a fact and is written, several are a judgment and are
  named in a comment with the value left empty.
- it commits the paths it created, by path, through `GitClient.commit`. Not `git add -A`: the
  repository may hold the user's own work in progress, and that is theirs.

`--no-commit` opts out and says what the consequence is.

## Packaging

`bin` points at `dist/cli/main.js`, which needs three things to actually run: a shebang (preserved
by `tsc` from `src/cli/main.ts`), a `files` list that ships `src/` — the schemas and prompt
documents are not JavaScript, so `tsc` does not emit them — and an entry-point guard that compares
real paths. `npm link` puts a symlink between `import.meta.url` and `process.argv[1]`; comparing
them directly made a linked installation start and exit 0 without running anything.
