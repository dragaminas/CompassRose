# Proto CompassRose

Minimal launcher for the prototype runtime loop.

## Run

```bash
tsx proto/protoCompassRose.ts run --no-commit
```

Useful variants:

```bash
tsx proto/protoCompassRose.ts run
tsx proto/protoCompassRose.ts run --loop
```

## CLI

- `run`: execute one prototype pass.
- `run-once`: same as `run`.
- `--loop`: keep running additional passes until the prototype stops.
- `--no-commit`: do not create git commits after planning or approved review.
- `--cwd <path>`: start from a different working directory inside the repo.

## Typecheck

```bash
npx tsc -p proto/tsconfig.json
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
