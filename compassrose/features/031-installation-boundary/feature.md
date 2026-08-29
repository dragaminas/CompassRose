# Feature: Installation Boundary

## Purpose

Make the difference between *where CompassRose is installed* and *the repository it is pointed at*
real in the code, so first contact with a repository that is not this one works without anyone
hand-copying anything into it.

## Scope

In scope:

- resolving CompassRose's own contracts against the installation, at every point that reads them
  and at the point a prompt names one to an agent
- removing `documentation.contracts_root` from the configuration model
- a `doctor` check over the installation instead of over the target
- `--cwd` on every command, and making it effective where it was already advertised
- `setup` leaving a repository the next command can run in
- `setup` writing what detection already read into the `CONFIG.md` it generates
- making the package linkable and installable (`bin`, `files`, a shebang, an entry-point guard that
  survives a symlink)

Out of scope:

- publishing to a registry. Linkable is what a validation run needs; published is a separate
  decision about a name, a license and a release process.
- the remaining self-hosting leaks recorded under `027` and `030`. They are the same family and are
  tracked where they were found.

## User-Facing Behavior

- `compassrose setup --cwd <path>` bootstraps a repository the shell is not standing in, writes a
  `CONFIG.md` seeded from what that repository states about itself, and commits exactly the files it
  created.
- `compassrose doctor --cwd <path>` reports readiness for that repository, including whether the
  installation its contracts come from is intact.
- `compassrose run --cwd <path>` and the interactive session work against it with no CompassRose
  files inside the target's source tree.
- A gate with one obvious script is filled in. A gate with several candidates is left empty with the
  candidates named in a comment.

## Acceptance Criteria

- `ContractRegistry` and manifest reads resolve `src/contracts/...` against the installation root.
- A prompt handed to an adapter names a contract by a path the agent can open from the target
  repository, and is byte-identical to today's when CompassRose runs against itself.
- `documentation.contracts_root` is neither required nor read; a `CONFIG.md` that still declares it
  loads unchanged.
- `doctor` reports a `contracts` check that fails when the installation has no contracts directory.
- `setup`, `doctor` and the session accept `--cwd`; `feature-validation` and `acknowledge-blocker`
  honor the one they already advertised.
- After `setup`, `git status --porcelain` is empty, and the user's own uncommitted work is still
  uncommitted.
- The generated `CONFIG.md` names the project what its manifest names it.
- `doctor` reports `Status: OK` on a repository containing no CompassRose contracts.
- The code inventory for a foreign repository contains that repository's code and none of
  CompassRose's.

## Implementation Outline

1. `src/config/installationPaths.ts`: the installation root, the contract-path predicate, the
   resolver, and the prompt localizer.
2. Point `ContractRegistry` and `readEntry` at it.
3. Localize contract references at the adapter boundary.
4. Remove `contracts_root` from the config model and the `paths` check; add the `contracts` check.
5. `--cwd` across the CLI surface.
6. `setup`: seed the config from detected facts, commit what it created.
7. Packaging: `bin` shebang, `files`, `prepare`, and an entry-point guard that resolves symlinks.
