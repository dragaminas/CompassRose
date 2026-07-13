# Task 006: Expose the remaining documented runtime policy in the configuration loader

## Task ID
`F002-T06`

## Parent Feature
`002-configuration-model`

## Goal
Extend the project configuration loader with typed, validated development, review, quality-gate, and runtime-limit policy data so the deterministic runtime can consume the full documented project configuration.

## First Executable Step
Add failing Vitest cases in tests/configReader.test.ts for canonical values and invalid development_policy, review_policy, quality_gates, and limits fields. Before handoff, report the runtime-captured `changed_files`, `git_diff`, and raw or normalized implementation diagnostics for the implementation attempt, and end the final response with a non-empty `## Implementation Notes` section that justifies the bounded change and records any remaining risk.

## Minimum Progress Evidence
- tests/configReader.test.ts contains executable coverage for the newly supported policy sections.
- src/config/configTypes.ts exposes typed interfaces for development_policy, review_policy, quality_gates, and limits.
- readProjectConfiguration() returns those typed sections for the canonical CONFIG.md and reports field-specific ConfigurationIssue values for malformed inputs.
- The implementation handoff reports the runtime-supported `changed_files`, `git_diff`, and raw or normalized implementation diagnostics for the attempt, and the final response contains a non-empty `## Implementation Notes` section with the implementation or already-satisfied evidence and any remaining risk.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The loader currently types execution, roles, and git_policy, but the documented development_policy, review_policy, quality_gates, and limits remain only untyped configuration properties, leaving the runtime without a complete validated policy model.

## Context
- The canonical project configuration documents all required policy sections, and the loader already validates several runtime-precondition sections. This task completes the remaining typed loader boundary without implementing orchestration or changing the configuration document.

## Scope
Allowed:
- `src/config/configTypes.ts`
- `src/config/configReader.ts`
- `tests/configReader.test.ts`

Forbidden:
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/`
- `src/cli/main.ts`
- `src/doctor/`
- `tests/main.test.ts`
- `tests/doctorCommand.test.ts`
- `proto/`

## Constraints
- Treat docs/compassrose/CONFIG.md as the canonical source of keys and documented allowed values.
- Validate development_policy.default and review_policy.mode against the existing documented enums.
- Validate booleans, string arrays, and non-negative integer limit fields with field-specific ConfigurationIssue results.
- Preserve the existing intentional-empty command semantics and all current loader behavior.
- Do not implement configuration precedence, provider-specific adapters, global-tool mutation, CLI orchestration, or Doctor behavior in this task.
- Do not add recovery manifests, fallback handoff fields, or artifacts not defined by the supplied contracts.

## Development Policy
- `test_guided`

## Acceptance Criteria
- ProjectConfiguration exposes typed development_policy.default, review_policy.mode and record_skipped_review, quality_gates.enabled/required/optional, and all documented limits fields.
- readProjectConfiguration() succeeds on the canonical docs/compassrose/CONFIG.md and preserves the existing typed execution, roles, git_policy, adapter, command, and documentation values.
- Missing sections, unsupported enum values, wrong primitive types, non-string quality-gate entries, and invalid limit values produce field-specific ConfigurationIssue results.
- Existing config-reader tests and the canonical configuration loading behavior remain passing without changes to docs/compassrose/CONFIG.md.
- Only the three allowed paths contain implementation or test changes.
- The implementation handoff reports only the runtime-supported `changed_files`, `git_diff`, and raw or normalized implementation diagnostics, and the final response ends with a non-empty `## Implementation Notes` justification; no fallback fields, context-path fields, manifests, or separate handoff artifacts are required.

## Files Likely Affected
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/runtime/operation-loop.md`
- `src/config/configTypes.ts`
- `src/config/configReader.ts`
- `tests/configReader.test.ts`

## Quality Gates to Run
```bash
npx vitest run tests/configReader.test.ts
npm run typecheck
npm test
git diff --check -- src/config/configTypes.ts src/config/configReader.ts tests/configReader.test.ts
```

## Expected Deliverables
- `code`
- `tests`
