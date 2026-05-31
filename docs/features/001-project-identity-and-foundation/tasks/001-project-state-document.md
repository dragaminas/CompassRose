# Task 001: Create Project State Document

## Task ID
`F001-T01`

## Parent Feature
`001-project-identity-and-foundation`

## Goal
Add the repository's project state document so later features can read current reality from `docs/compassrose/PROJECT_STATE.md`.

## Trace
- Roadmap objective: Foundation
- Feature goal: Establish a stable repository foundation for later CompassRose features.
- State gap: `docs/compassrose/PROJECT_STATE.md` is referenced by `CONFIG.md` and `DMS.md` but does not exist yet.

## Context
- `docs/DMS.md` defines `PROJECT_STATE.md` as CompassRose-owned, human-reviewable, and reality-based.
- `docs/compassrose/CONFIG.md` already points at the path.
- `docs/features/004-project-understanding/request.md` will depend on this file.

## Scope
Allowed:
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `package.json`
- `tsconfig.json`
- `src/`
- `docs/features/`
- `docs/README.md`
- `docs/ROADMAP.md`
- `docs/SAD.md`
- `docs/ADR.md`
- `docs/UX.md`

## Out of Scope
- Orchestration logic
- State machine implementation
- Config parsing
- Feature execution tasks
- Package metadata changes
- TypeScript configuration changes
- Any docs outside the project-state file

## Constraints
- Describe current reality, not intended future state.
- Keep the document human-reviewable and repository-local.
- Do not add workflow automation.
- Preserve the CompassRose-owned nature of the file.

## Development Policy
- `documentation_first`

## Expected Changes
- Create the initial project-state document structure.
- Record current reality, implemented items, pending items, known gaps, blocked items if any, last approved change, and next planning hint.

## Expected Deliverables
- `documentation`

## Acceptance Criteria
- `docs/compassrose/PROJECT_STATE.md` exists.
- The document states implementation is not started.
- The document records current reality and known gaps without inventing progress.
- The document includes a next planning hint for later features.

## Files Likely Affected
- `docs/compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
test -f docs/compassrose/PROJECT_STATE.md
rg -n "^# State: Project Identity and Foundation|^## Status|^## Current Reality|^## Implemented|^## Pending|^## Blocked|^## Last Approved Change|^## Known Gaps|^## Next Planning Hint" docs/compassrose/PROJECT_STATE.md
git diff --check
```

## Review Notes
- The reviewer should reject any wording that describes future behavior as already implemented or turns the state file into a roadmap.

## Completion Criteria
- The file exists, reflects current reality, and can be used by later features as the project-state source of truth.
