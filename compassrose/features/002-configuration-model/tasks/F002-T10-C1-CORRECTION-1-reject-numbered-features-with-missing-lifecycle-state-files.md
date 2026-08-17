# Task F002-T10-C1-CORRECTION-1: Reject numbered features with missing lifecycle state files

## Task ID
`F002-T10-C1-CORRECTION-1`

## Parent Task
`F002-T10-C1`

## Parent Feature
`002-configuration-model`

## Goal
Stop silently skipping a numbered feature directory that lacks state.md when request_pending does not apply; report malformed lifecycle data before selecting another feature or emitting the no-selectable-feature message.

## First Executable Step
Edit tests/main.test.ts to add a failing main([]) fixture using the existing temporary Git workspace pattern for a numbered feature with feature.md but no state.md and no request.md; assert exit code 1, the runtime feature-selection malformed-lifecycle diagnostic, and no success message.

## Minimum Progress Evidence
- tests/main.test.ts contains an executable missing-state/no-request fixture with assertions for non-zero exit, runtime feature-selection diagnostics, and absence of a success message.
- src/cli/main.ts handles a missing state.md without request_pending conditions by returning the existing runtime feature-selection malformed-lifecycle diagnostic.
- npx vitest run tests/main.test.ts passes.

## Review Findings
- src/cli/main.ts continues when state.md is missing and request.md is absent, silently skipping malformed numbered features.
- tests/main.test.ts does not cover the missing state.md/no request.md branch required by the task's test_guided policy.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `src/config/`
- `src/doctor/`
- `src/contracts/`
- `docs/`
- `Any other source or test path not listed in allowed_paths`

## Constraints
- Preserve request_pending derivation when request.md exists and one or more of feature.md, architecture.md, or state.md is missing.
- Preserve git_policy preflight before feature inventory and the existing unknown-lifecycle validation.
- Preserve the deterministic no-selectable-feature message and existing doctor, preflight, and happy-path behavior.
- Do not execute tasks, invoke roles or adapters, mutate feature state, or add provider-specific behavior.
- Do not modify documentation, contract files, or runtime state bookkeeping.

## Acceptance Criteria
- A numbered feature with no state.md and no request.md exits 1 with a runtime feature-selection malformed-lifecycle diagnostic and does not emit a feature-selection success or no-selectable-feature message.
- The existing request_pending derivation test continues to pass when request.md exists and formalized files are missing.
- The existing all-completed, completed-then-formalized, main([]) preflight, and main(['doctor']) regression coverage continues to pass.
- Only src/cli/main.ts and tests/main.test.ts are changed.

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts
npm run typecheck
npm test
git diff --check
```
