# Task F002-T09-C1-CORRECTION-1: Fix Git fixture cleanup in tracked-worktree tests

## Task ID
`F002-T09-C1-CORRECTION-1`

## Parent Task
`F002-T09-C1`

## Parent Feature
`002-configuration-model`

## Goal
Correct the two Git setup failure paths in tests/main.test.ts so the temporary workspace is cleaned using the existing root and rmSync mechanism, then the original setup error is surfaced without an undefined reference.

## First Executable Step
In tests/main.test.ts, update the catch blocks for git init and git commit inside createTempGitWorkspace to clean up root with the existing rmSync API before throwing the setup error.

## Minimum Progress Evidence
- tests/main.test.ts contains no undefined workspace reference inside createTempGitWorkspace.
- The git init and git commit failure paths still throw after cleaning the temporary root.
- npx vitest run tests/main.test.ts and npm run typecheck complete successfully.

## Review Findings
- Fix the undefined workspace.dispose() reference at tests/main.test.ts:360.
- Fix the undefined workspace.dispose() reference at tests/main.test.ts:373.
- Restore a trustworthy passing typecheck gate for the handed-off implementation.

## Scope
Allowed:
- `tests/main.test.ts`

Forbidden:
- `src/cli/main.ts`
- `docs/compassrose/CONFIG.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/`
- `src/config/`
- `src/doctor/`
- `src/contracts/`
- `proto/`
- `global external-tool configuration files`

## Constraints
- Keep the existing src/cli/main.ts worktree-check implementation unchanged.
- Use the existing Git status behavior and real temporary Git repository mechanism.
- Preserve the untracked dirty rejection and explicit allow-dirty success cases.
- Do not modify documentation, contracts, provider configuration, or global tool settings.

## Acceptance Criteria
- Both Git setup failure paths in createTempGitWorkspace clean the temporary root through the existing rmSync mechanism and then throw.
- tests/main.test.ts compiles successfully under npm run typecheck.
- The tracked, untracked, and explicitly allowed dirty-worktree tests remain present and pass.

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts
npm run typecheck
npm test
git diff --check
```
