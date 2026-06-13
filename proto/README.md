# Proto CompassRose

Minimal launcher for the prototype runtime loop.

## Run

```bash
npm run proto -- run --no-commit
```

Useful variants:

```bash
npm run proto:run
npm run proto:loop
npm run proto -- run
```

## CLI

- `run`: execute one prototype pass.
- `run-once`: same as `run`.
- `--loop`: keep running additional passes until the prototype stops.
- `--no-commit`: do not create git commits after planning or approved review.
- `--cwd <path>`: start from a different working directory inside the repo.

## Typecheck

```bash
npm run proto:typecheck
```

## Diagnostics

Prototype artifacts are written under `.git/proto-compassrose/`:

- `latest-run.json`
- `latest-refinement.md`
- `latest-refinement.json`
- `task-interface-analysis/`
- `runs/`
- `refinement/`

If the script fails, start by checking `latest-refinement.md` and the matching run summary in `runs/`.
