# Request: Installation Boundary

CompassRose has only ever run against this repository. The e2e harness clones `HEAD`, so nothing
has ever exercised it anywhere else, and the leaks recorded under `027` and `030` — planner manifest
entries naming this repository's layout, a smoke gate hardcoding `src/orchestrator/` — are what that
absence looks like from the inside.

Pointing it at a small repository that was not this one and walking first contact turned up four
things, in the order they stop you:

- `doctor` fails on its second check with `src/contracts does not exist`, exit code 1. `setup`
  writes fifteen files and none of them are contracts, while the `CONFIG.md` it generates declares
  `contracts_root: src/contracts` for `doctor` to verify.
- copying the contracts in to get past that is worse than the failure. `/proyecto` then describes
  CompassRose to itself: eight groups of `src/contracts/*` and the project's own source file
  nowhere in the list.
- `setup` leaves fifteen untracked files, and the next step it prints refuses to start on a dirty
  worktree. The first instruction the product gives you does not work.
- `setup` and `doctor` take no `--cwd`. The two commands that advertise it parse it and then
  overwrite it with the process's own directory. So the only way to point CompassRose at another
  repository is to stand inside it — which requires it to already be installed there.

And one thing that is not a failure so much as a waste: `setup` reads the repository, writes every
detected fact into `PROJECT_FACTS.md`, and then generates a `CONFIG.md` saying `name: my-project`
with four empty command slots over a project that declares its name and its scripts.

The common cause is that the installation and the target have always been the same directory, so
nothing ever had to tell them apart.
