# Task F003-DR03: Doctor recovery: reconcile Feature 003 state and blocker evidence

## Task ID
`F003-DR03`

## Task Lineage

- previous_task_id: `F003-DR02`

## Parent Feature
`003-doctor-command`

## Goal
Repair the stale recovery handoff after F003-DR02 by preserving the latest blocker evidence in the existing feature and project recovery histories, aligning the recovery narrative, and making deterministic re-entry of F003-T01 ready for the runtime.

## First Executable Step
Edit the existing Recovery History sections in docs/features/003-doctor-command/state.md and docs/compassrose/PROJECT_STATE.md to add F003-DR03 with the supplied environment blocker signature, observed state, human recoverability, and the explicit absence of concrete failed-gate or implementation-failure evidence; do not alter implementation deliverables or invent diagnostic output.

## Minimum Progress Evidence
- Both allowed state documents contain a new F003-DR03 recovery-history entry preserving the exact blocker signature and missing-evidence limitation.
- The project and feature state narratives no longer contradict the recorded recovery handoff, while F003-T01 remains the active implementation anchor.
- The resulting diff contains changes only under docs/features/003-doctor-command/state.md and docs/compassrose/PROJECT_STATE.md.

## Trace
- Roadmap objective: Project Identity and Foundation: preserve deterministic project and feature state for the runtime loop.
- Feature goal: Provide a read-only compassrose doctor command that reports repository readiness and clear diagnostics.
- State gap: Feature 003 remains quality_failed with active_task F003-T01 although F003-DR02 is recorded as passed; no concrete failed-gate output or implementation-failure evidence is preserved.

## Context
- This is one bounded doctor recovery task with executor_role=doctor and review_policy=no_review_loop. It is required because the recovery interface is stale and contradictory, not because the feature scope needs redesign. Use the existing Recovery History and state narrative sections only; the runtime owns lifecycle restoration after the recovery gates pass.

## Scope
Allowed:
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `All source and test files`
- `docs/features/003-doctor-command/feature.md`
- `docs/features/003-doctor-command/architecture.md`
- `docs/compassrose/CONFIG.md`
- `Any other docs/features path`
- `Any other docs/compassrose path`
- `Git metadata, task artifacts, manifests, validators, or generated files`

## Constraints
- Recovery metadata: executor_role=doctor; review_policy=no_review_loop.
- Blocker metadata: kind=environment; signature=environment-quality-failed-feature-003-doctor-command-is-in-quality-failed-and-needs-diagnosis-a; recoverability=human; observed_state=lifecycle=quality_failed; active_task=F003-T01; active_correction_task=none; active_unblock_task=none.
- Preserve F003-DR01 and F003-DR02 as historical evidence; add F003-DR03 rather than rewriting earlier recovery history.
- Record that no concrete failed-gate output or implementation-failure evidence is available; do not promote the advisory protoBlockerFlows.test.ts refinement to confirmed evidence.
- Use only existing Recovery History, Current Reality, Pending, Blocked, and operational-state fields; do not invent a manifest, validator, or artifact type.
- Restoration target is fixed: lifecycle_state=implementation_running; active_task=F003-T01; active_correction_task=none; active_unblock_task=none.
- The runtime, not the doctor edit, applies the restoration target after every recovery gate passes and clears active_unblock_task.
- Do not change feature implementation deliverables, implementation code, tests, configuration, architecture, or runtime behavior.
- The recovery is documentation/state-interface work, so use documentation_first and do not run the active implementation task's unmet quality gates as inherited recovery gates.
- If a git diff --exit-code command is added later, it must use an explicit pre-recovery ref before the -- pathspec separator; the gates below intentionally avoid ref-less exit-code comparisons.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The existing Recovery History sections in both allowed documents contain F003-DR03 with the exact supplied blocker signature, environment kind, human recoverability, observed quality_failed state, active F003-T01 anchor, and the absence of concrete failed-gate or implementation-failure evidence.
- F003-DR01 and F003-DR02 remain historical; no recovery result or advisory implementation-failure refinement is rewritten as confirmed evidence.
- The feature and project state narratives describe the recovery handoff consistently without claiming F003-T01 implementation is complete or changing remaining deliverables.
- After the recovery gates pass, the runtime restores exactly implementation_running with active_task F003-T01, active_correction_task none, and active_unblock_task none.
- Only the two explicitly allowed state documents are changed, and the recovery does not enter a normal review loop.

## Files Likely Affected
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/state/feature-state.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check
node -e "const fs=require('fs'); const f=fs.readFileSync('docs/features/003-doctor-command/state.md','utf8'); const p=fs.readFileSync('docs/compassrose/PROJECT_STATE.md','utf8'); const docs=[f,p]; const required=['F003-DR03','blocker kind: environment','recoverability: human','environment-quality-failed-feature-003-doctor-command-is-in-quality-failed-and-needs-diagnosis-a','No concrete failed-gate output or','implementation-failure evidence','F003-T01']; if(docs.some(s=>required.some(x=>!s.includes(x)))) process.exit(1)"
node -e "const cp=require('child_process'); const allowed=new Set(['docs/features/003-doctor-command/state.md','docs/compassrose/PROJECT_STATE.md']); const changed=cp.execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).split(String.fromCharCode(10)).map(x=>x.trim()).filter(Boolean); if(changed.some(x=>!allowed.has(x))) process.exit(1)"
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-quality-failed-a-single-doctor-recovery-task-confined-to-feature-003-can-reconc
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F003-T01; active_correction_task=none; active_unblock_task=none
- evidence: A single doctor recovery task confined to Feature 003 can reconcile the stale restoration state, preserve the missing blocker evidence, and establish executable re-entry gates for F003-T01. The documents do not establish that this specific blocker is systemic.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F003-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
