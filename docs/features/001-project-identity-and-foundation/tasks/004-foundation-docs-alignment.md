# Task 004: Align Foundation Docs With Repository Roots

## Task ID
`F001-T04`

## Parent Feature
`001-project-identity-and-foundation`

## Goal
Tighten the top-level documentation so the repository identity, docs root, source root, contracts root, and Linux/Windows support are obvious in one pass.

## Trace
- Roadmap objective: Foundation
- Feature goal: Make the repository readable as a stable CompassRose project without consulting source files.
- State gap: The top-level docs are broadly correct, but they do not yet present the foundation and root layout as a single coherent summary.

## Context
- `docs/README.md` is the first entry point for readers.
- `docs/ROADMAP.md` defines the actionable feature model.
- Both documents should reinforce the repository foundation without adding behavior.

## Scope
Allowed:
- `docs/README.md`
- `docs/ROADMAP.md`

Forbidden:
- `src/`
- `package.json`
- `tsconfig.json`
- feature request documents
- orchestration logic
- provider-specific architecture

## Out of Scope
- Runtime implementation
- Task generation logic
- Configuration parsing
- Feature formalization mechanics
- Any deeper architectural rewrite

## Constraints
- Keep the edits concise and factual.
- Do not introduce later-feature behavior or implementation details.
- Preserve existing Linux and Windows compatibility statements.

## Development Policy
- `documentation_first`

## Expected Changes
- Update the overview to state that CompassRose is a CLI-first TypeScript application.
- Make the docs/source/contracts root layout explicit for readers.
- Ensure the roadmap foundation section mentions the project-state artifact and its role in the foundation.

## Expected Deliverables
- `documentation`

## Acceptance Criteria
- A reader can identify where docs, source, and contracts live without searching the tree.
- The foundation narrative matches the project identity in feature 001.
- Linux and Windows support remain explicit and consistent.

## Files Likely Affected
- `docs/README.md`
- `docs/ROADMAP.md`

## Quality Gates to Run
```bash
rg -n "CLI-first|TypeScript|docs/|src/contracts/|PROJECT_STATE|Linux|Windows" docs/README.md docs/ROADMAP.md
git diff --check
```

## Review Notes
- The reviewer should ensure the changes stay at the documentation level and do not drift into orchestration or tooling details.

## Completion Criteria
- The top-level docs consistently present the project identity and foundation.
