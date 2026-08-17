# proto/

This folder no longer holds a runtime. The orchestrator that used to live here as
`protoCompassRose.ts` is now embedded in the real application at
`src/orchestrator/orchestrator.ts`, launched via `src/cli/main.ts`. Its behavior is
specified in `src/contracts/runtime/operation-loop.md`, not in this folder.

What's left here is the end-to-end test infrastructure that exercises the real CLI as a
black box: clone the repo, mock `codex`/`opencode`, spawn `tsx src/cli/main.ts`, assert on
the resulting files and exit codes.

## Files

- `protoCompassRose.e2e.ts` — the full scenario harness. Clones this repository into a temp
  worktree, seeds a fixture state for `compassrose/features/002-configuration-model/`, writes mock
  `codex`/`opencode` executables, and spawns the real CLI against it.
- `protoCompassRose.smoke.e2e.ts` — a lighter smoke test: one control-flow pass
  (`implementer -> reviewer`) to catch wiring regressions fast.
- `tsconfig.json` — scoped typecheck config covering these two files plus `src/`.

## Running

```bash
npm run proto:e2e              # standard scenario
npm run proto:e2e:codex        # standard scenario, codex as the implementer
npm run proto:e2e:unblock      # PROTO_E2E_SCENARIO=unblock
npm run proto:smoke
npm run proto:typecheck
```

Other scenarios are selected via `PROTO_E2E_SCENARIO`, e.g.:

```bash
PROTO_E2E_SCENARIO=recoverable-review-blocked npm run proto:e2e
```

Available scenarios (see `protoCompassRose.e2e.ts` for the full list and what each one
seeds): `standard`, `unblock`, `recoverable-review-blocked`, `terminal-review-blocked`,
`interface-gap`, `state-correction-missing-active-task`, `unblock-doc-code-mismatch`.

Useful env vars: `PROTO_E2E_IMPLEMENTER` (`codex`|`opencode`), `PROTO_E2E_COMMIT=1`.

If a run fails, both harnesses print `temp workspace preserved at <path>` instead of
cleaning up — inspect that directory (cloned repo, mock scripts, call logs) to see exactly
what the CLI did.

## Where the real docs live

- Runtime/loop contract: `src/contracts/runtime/operation-loop.md`
- Orchestrator implementation: `src/orchestrator/orchestrator.ts`
- Work-item vocabulary (feature/fix/task/subtask/...): `src/contracts/runtime/work-item-taxonomy.md`
- Fix-request lifecycle: `compassrose/fixes/README.md`
