# Task 003: Tighten TypeScript Foundation Settings

## Task ID
`F001-T03`

## Parent Feature
`001-project-identity-and-foundation`

## Goal
Remove browser- and React-specific compiler assumptions from `tsconfig.json` and keep the project aligned with a Node CLI foundation.

## Trace
- Roadmap objective: Foundation
- Feature goal: Keep the source and contracts roots stable while TypeScript settings reflect a CLI project layout.
- State gap: `tsconfig.json` still includes `jsx: react-jsx` even though CompassRose is a CLI-first TypeScript project.

## Context
- `tsconfig.json` defines the build root and output convention.
- `src/cli/main.ts` and `src/contracts/` depend on Node-oriented TypeScript settings.
- Later foundation features should inherit a clean CLI-oriented compiler configuration.

## Scope
Allowed:
- `tsconfig.json`

Forbidden:
- `package.json`
- `src/`
- `docs/`
- dependency manifests

## Out of Scope
- CLI behavior
- Package metadata
- Documentation edits
- New compiler plugins
- Any runtime implementation

## Constraints
- Preserve `rootDir`, `outDir`, strictness, and module settings that already support the CLI.
- Do not introduce browser or React assumptions.
- Keep the config portable across Linux and Windows.

## Development Policy
- `implementation_first`

## Expected Changes
- Remove JSX-specific compiler settings that do not belong in a CLI project.
- Keep the TypeScript build configured for `src/` input and `dist/` output.
- Leave the config ready for later foundation features to consume.

## Expected Deliverables
- `code`

## Acceptance Criteria
- `tsconfig.json` no longer advertises React or JSX support.
- The config still points at `src` and `dist` as the compile root and output root.
- No unrelated compiler options are changed.

## Files Likely Affected
- `tsconfig.json`

## Quality Gates to Run
```bash
node -e "const fs=require('fs');const text=fs.readFileSync('tsconfig.json','utf8');if(/\"jsx\"\\s*:/.test(text))process.exit(1);if(!/\"rootDir\"\\s*:\\s*\"src\"/.test(text)||!/\"outDir\"\\s*:\\s*\"dist\"/.test(text))process.exit(1)"
git diff --check
```

## Review Notes
- The reviewer should confirm the file no longer implies a React/browser runtime while remaining valid for the Node CLI target.

## Completion Criteria
- `tsconfig.json` matches the CLI-first foundation and still preserves the source/output layout.
