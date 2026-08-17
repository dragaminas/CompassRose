# Task F002-T05-C1-CORRECTION-HANDOFF: Repair nested preflight regression coverage and complete the handoff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF`

## Task Lineage

- previous_task_id: `F002-T05-C1`

## Parent Feature
`002-configuration-model`

## Goal
Repair the nested preflight test fixture so it reliably exercises both successful root-configuration resolution and the role-disabled failure path, while preserving the existing source behavior and recording complete implementation evidence.

## First Executable Step
Run `npx vitest run tests/main.test.ts` from the repository root to establish the baseline for the nested passing and failing preflight cases before editing either allowed file.

## Minimum Progress Evidence
- Targeted test output demonstrates separate nested success and role-disabled failure cases with the expected exit codes and diagnostics after the fixture is corrected.
- A diff is present only in `tests/main.test.ts`; `src/cli/main.ts` retains the existing repository-root lookup and preflight logic.
- Fresh typecheck and full-test output is captured with accurate exit status before handoff.
- The implementation handoff contains non-empty implementation notes, context artifacts, and explicit diff/commit status; an already-complete justification is recorded if no source change is needed.

## Trace
- Roadmap objective: Advance the configuration model into a trustworthy runtime preflight flow backed by reviewable, passing quality gates.
- Feature goal: Use the repository-local configuration as the validated project-level runtime policy without changing unrelated orchestration behavior.
- State gap: F002-T05-C1 has the requested repository-root resolution, but its nested regression fixture does not reliably disable the planner role, the mandatory test gate fails, implementation notes and context artifacts are missing, and recorded quality-gate state conflicts with fresh results.

## Context
- The existing `src/cli/main.ts` resolves `docs/compassrose/CONFIG.md` from the Git repository root for default preflight and should remain unchanged. The correction is limited to the temporary-repository fixture and assertions in `tests/main.test.ts`: make the role-disabled configuration mutation independent of fixture line endings, ensure the nested directory has no competing configuration, and preserve the existing diagnostic text. The handoff must explicitly capture implementation notes and fresh evidence instead of silently treating an empty or already-complete implementation as approved.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `src/config/`
- `src/doctor/`
- `tests/testUtils.ts`
- `tests/doctorCommand.test.ts`
- `tests/protoReviewableDiffHandoff.test.ts`
- `docs/`
- `src/contracts/`
- `proto/`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `all other repository paths`

## Constraints
- Keep the existing repository-root configuration lookup, configuration validation, runtime preflight validation, exit codes, and diagnostic wording unchanged.
- Limit source edits to `tests/main.test.ts`; `src/cli/main.ts` may be inspected but must not be modified.
- Use a temporary repository fixture with the configuration only at the repository root and invoke `main([])` from a nested directory.
- Make the role-disabled mutation reliably change `roles.planner.enabled` to `false`, including when the fixture uses CRLF line endings.
- The nested passing case must use the same valid root configuration and success behavior as the repository-root case.
- Keep `main(['doctor'])` regression behavior unchanged.
- Before handoff, capture non-empty implementation notes naming the actual changed file, commands and results, current commit/diff status, and any already-complete justification; preserve implementer context artifacts.
- Do not repair unrelated full-suite failures by expanding this task beyond the two-file scope.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The nested passing test loads the repository-root `docs/compassrose/CONFIG.md` from a nested directory with no competing nested configuration and returns exit code `0` with the existing success message and no stderr.
- The nested role-disabled test reliably disables `roles.planner.enabled`, returns exit code `1`, and preserves the existing `runtime preflight` and `roles.planner.enabled` diagnostics.
- The repository-root preflight tests and `main(['doctor'])` regression test remain behaviorally unchanged.
- `src/cli/main.ts` is unchanged; the only implementation diff is the bounded fixture/assertion correction in `tests/main.test.ts`.
- `npx vitest run tests/main.test.ts`, `npm run typecheck`, and `npm test` are freshly executed and their captured results agree with the recorded quality-gate status.
- The implementation artifact contains non-empty notes and implementer context evidence, or explicitly records an already-complete justification with current commit and diff evidence; it does not silently hand off missing output or null notes.

## Files Likely Affected
- `src/cli/main.ts`
- `tests/main.test.ts`
- `src/config/configReader.ts`
- `src/doctor/doctorCommand.ts`
- `tests/testUtils.ts`
- `tests/doctorCommand.test.ts`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts
npm run typecheck
npm test
```

## Expected Deliverables
- `tests`
