# Task 002: Normalize Package Metadata and Entrypoint

## Task ID
`F001-T02`

## Parent Feature
`001-project-identity-and-foundation`

## Goal
Align `package.json` with the CLI-first TypeScript identity of CompassRose and remove misleading library defaults.

## Trace
- Roadmap objective: Foundation
- Feature goal: Establish a stable CLI-first TypeScript package identity.
- State gap: `package.json` has an empty description and a default `main` value that points to `index.js` instead of the built CLI entrypoint.

## Context
- `docs/compassrose/CONFIG.md` already identifies CompassRose as a CLI-first TypeScript project.
- `src/cli/main.ts` is the intended CLI entrypoint for the package.
- The package is expected to remain an npm CLI package, not a library package.

## Scope
Allowed:
- `package.json`
- `tests/package-metadata.test.js`

Forbidden:
- `src/`
- `tsconfig.json`
- `docs/`
- `package-lock.json`
- global tool configuration

## Out of Scope
- Runtime behavior changes
- CLI command parsing
- Orchestration logic
- Dependency additions
- TypeScript compiler changes
- Documentation edits

## Constraints
- Keep the CLI entrypoint consistent with `bin`.
- Do not introduce provider-specific or OS-specific configuration.
- Do not change runtime behavior.
- If required to satisfy the configured quality gates, add only the minimal package-metadata smoke test baseline.

## Development Policy
- `implementation_first`

## Expected Changes
- Give the package a meaningful description.
- Remove or align the misleading default `main` value.
- Keep `bin`, scripts, and package metadata coherent with the built CLI entrypoint.

## Expected Deliverables
- `code`

## Acceptance Criteria
- `package.json` clearly identifies CompassRose as a CLI-first TypeScript project.
- `bin.compassrose` and `main` are not contradictory.
- Existing npm scripts remain intact and cross-platform.

## Files Likely Affected
- `package.json`
- `tests/package-metadata.test.js`

## Quality Gates to Run
```bash
npm test
npm run typecheck
npm run build
git diff --check
```

## Review Notes
- The reviewer should verify that the change updates metadata only and does not introduce unrelated package churn.

## Implementation Note
- The initial test baseline is required because Vitest fails when no test files exist.

## Completion Criteria
- The package metadata and CLI entrypoint are consistent with the repository's CLI-first identity.
