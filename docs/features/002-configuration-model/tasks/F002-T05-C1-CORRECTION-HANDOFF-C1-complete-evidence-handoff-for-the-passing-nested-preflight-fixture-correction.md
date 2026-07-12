# Task F002-T05-C1-CORRECTION-HANDOFF-C1: Complete evidence handoff for the passing nested preflight fixture correction

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1`

## Parent Task
`F002-T05-C1-CORRECTION-HANDOFF`

## Parent Feature
`002-configuration-model`

## Goal
Re-submit the existing passing tests/main.test.ts fixture correction with a contract-conformant implementation artifact containing implementation.notes and preserved implementer context artifacts; do not broaden or redesign the implementation.

## First Executable Step
Run git diff -- tests/main.test.ts and npx vitest run tests/main.test.ts from the repository root before editing any allowed file. Preserve the existing correction diff when it is present; do not recreate or broaden it.

## Minimum Progress Evidence
- The live diff remains limited to tests/main.test.ts and the targeted test passes.
- The targeted test output explicitly demonstrates both the nested repository-root resolution behavior and the role-disabled preflight failure behavior.
- A fresh npm run typecheck and npm test result is captured with passing status.

## Handoff Evidence
- The adapter-owned implementation artifact must contain a non-empty `implementation.notes` field naming the changed file, executed commands and results, current commit/diff status, and whether an already-complete justification applies. `implementation_notes` is not an accepted undocumented alias.
- The adapter-owned implementation artifact must contain recorded `implementation_context_paths` pointing to preserved task, prompt, and runtime-context artifacts used for this attempt.
- `raw_output` is supporting evidence only and is not a substitute for `implementation.notes` or `implementation_context_paths`.
- The adapter, not the implementer or doctor, owns capture and preservation of these context artifacts; the handoff must not fabricate paths for artifacts that were not preserved.

## Review Findings
- implementation.json uses implementation_notes instead of the required implementation.notes field.
- No implementation context artifacts or implementation_context_paths were provided for this attempt.

## Scope
Allowed:
- `tests/main.test.ts`

Forbidden:
- `src/cli/main.ts`
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
- Preserve the currently passing nested fixture correction and existing source behavior.
- Do not modify src/cli/main.ts or any forbidden path.
- Preserve and verify the existing tests/main.test.ts correction diff when retrying; do not recreate it or add unrelated edits.
- Do not claim already-complete status while the existing live diff is present.
- The orchestrator handoff must record `implementation.notes` exactly as a non-empty field and must record `implementation_context_paths` for preserved task, prompt, and runtime-context artifacts.
- The orchestrator must reject a handoff that provides only `implementation_notes` or uses `raw_output` as a substitute for either required field.
- Do not classify the attempt as `context_overflow` or another unsupported diagnostic without explicit provider, timeout, or limit evidence.

## Read-Only Context Paths
- `src/cli/main.ts` — read-only source reference for the existing preflight behavior; it is not an implementation target.

## Acceptance Criteria
- The existing live diff remains limited to tests/main.test.ts and src/cli/main.ts remains unchanged.
- The implementation artifact has a non-empty `implementation.notes` field, not only `implementation_notes`, with the actual changed file, executed commands and results, current commit/diff status, and any applicable already-complete justification.
- The handoff records non-empty `implementation_context_paths` for preserved task, prompt, and runtime-context artifacts; raw output alone is insufficient.
- The required quality gates pass and their recorded statuses match fresh output.

## Quality Gates to Run
```bash
git diff --check -- tests/main.test.ts
npx vitest run tests/main.test.ts
npx vitest run tests/main.test.ts -t "returns 0 and prints preflight message when all runtime preconditions pass"
npx vitest run tests/main.test.ts -t "resolves CONFIG.md from repo root when invoked from a nested subdirectory with failing preflight"
npm run typecheck
npm test
```
