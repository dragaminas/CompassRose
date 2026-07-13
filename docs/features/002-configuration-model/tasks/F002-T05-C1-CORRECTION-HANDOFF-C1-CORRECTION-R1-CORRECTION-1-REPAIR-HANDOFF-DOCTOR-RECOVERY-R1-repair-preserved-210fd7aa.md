# Task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R1: Repair preserved-attempt handoff provenance and final evidence

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R1`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF`

## Parent Feature
`002-configuration-model`

## Goal
Repair the active handoff using the adapter-injected preserved-attempt manifest, distinguish inner repository-change metadata from outer adapter metadata, reconcile final quality-gate evidence, and allow runtime restoration to the fixed implementation-running anchor.

## First Executable Step
Run a manifest validator against implementation.json and the adapter-injected preserved-artifact manifest; fail before editing if the manifest is absent, incomplete, non-attempt-specific, or any exact artifact path is missing.

## Minimum Progress Evidence
- Validator output proves exactly three existing attempt-specific artifacts with task, implementer-prompt, and runtime-context roles.
- A before/after snapshot or diff of implementation.json proves the handoff was repaired, unless an independent pre-attempt snapshot proves it was already valid.
- The inner handoff explicitly records changed_files=[], git_diff=null, fallback_changed_files=[], and fallback_git_diff=null.
- implementation_notes is non-empty and repeats the exact structured artifact paths.
- Final quality-gate evidence identifies the attempt, marks the final run, records passing typecheck and test commands, and contains no unexplained contradictory failure.
- A diff-scope check proves that no source or test files were changed and that only explicitly allowed handoff, evidence, contract, or runtime-state paths changed.

## Trace
- Roadmap objective: Connect configuration validation to the doctor/runtime flow while preserving deterministic recovery and trustworthy repository state.
- Feature goal: Provide a repository-local configuration model that CompassRose can validate and use in doctor/runtime orchestration.
- State gap: The feature is quality_failed because the active handoff uses tracked contracts instead of exact preserved attempt artifacts, reports an impermissible outer diff, and contains contradictory quality-gate evidence.

## Context
- The latest repair attempt made no source or test changes but failed review. Its implementation_context_paths did not identify actual preserved attempt artifacts, its outer metadata reported a non-empty diff despite the required empty repository diff, and quality-gates evidence contradicted an earlier failing npm test. The recovery must tighten the handoff interface and deterministically repair or explicitly block on missing injected artifacts.

## Scope
Allowed:
- `implementation.json`
- `quality-gates.json`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-attach-actual-preserved-attempt-context-and-clear-repository-diff-metadata.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `Only the exact paths enumerated by implementation.json.preserved_attempt_artifact_manifest.artifacts[].path; no directory-wide search`

Forbidden:
- `src/** and tests/** except the two explicitly allowed contract files`
- `src/contracts/implementer/task-execution-prompt.md`
- `src/contracts/runtime/agent-context.md`
- `Any tracked contract or ordinary task document not explicitly identified by the preserved-attempt manifest`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/compassrose/CONFIG.md`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `Global external-tool configuration and unrelated repository paths`

## Constraints
- Execute as doctor with no_review_loop; do not create a normal reviewer iteration.
- Preserve blocker kind unknown and blocker signature unknown-quality-failed-feature-002-configuration-model-is-in-quality-failed-and-needs-diagnosis-; do not silently relabel the diagnostic.
- Use only exact adapter-injected artifact paths or a machine-readable manifest. If those artifacts are unavailable, record an explicit missing-artifact blocker and do not substitute tracked contracts.
- Keep implementation.json inner handoff metadata separate from outer adapter changed_files and git_diff metadata.
- The inner handoff must report no repository changes and no fallback diff; outer metadata may change only for explicitly allowed handoff/evidence artifacts.
- A pre-attempt snapshot is required to claim already_complete; the implementer may not prove completion solely from its rewritten artifact.
- Reconcile quality-gates.json with the final command run. Earlier failures must be explicitly superseded by a final rerun or remain a failure.
- Do not manually rewrite lifecycle state to bypass the blocker; runtime owns restoration to the fixed target after doctor gates pass.
- Do not modify feature implementation or tests; typecheck and test commands are verification gates only.
- Do not use correct_state because the observed blocker is an agent-recoverable handoff/evidence interface defect, not pure state or documentation drift.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- implementation.json contains exactly three existing paths from the exact adapter-injected preserved-attempt manifest, with explicit task, implementer-prompt, and runtime-context roles and attempt-specific provenance.
- Tracked contracts and ordinary task documents are rejected as substitutes unless the manifest explicitly identifies a path as a preserved attempt snapshot.
- implementation_notes is non-empty and repeats the exact structured paths and the repaired or independently verified status.
- The implementer provides an independent before/after handoff check, or an independent pre-attempt snapshot proving already_complete.
- Inner handoff fields are changed_files=[], git_diff=null, fallback_changed_files=[], and fallback_git_diff=null.
- Outer adapter metadata contains no source, test, or documentation changes; only explicitly allowed handoff/evidence metadata may change.
- quality-gates.json identifies the attempt, marks final_run_marker=true, records final passing typecheck and test results, and either supersedes earlier failures explicitly or records them as unresolved.
- No source or test files are changed.
- After doctor gates pass, runtime restores lifecycle_state=implementation_running with the recorded active task and clears active_correction_task and active_unblock_task.
- Recovery remains bounded and does not enter the normal review loop.

## Files Likely Affected
- `implementation.json`
- `quality-gates.json`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-attach-actual-preserved-attempt-context-and-clear-repository-diff-metadata.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync('implementation.json','utf8'));const m=x.preserved_attempt_artifact_manifest;if(!m||typeof m.attempt_id!=='string'||m.attempt_id!==x.attempt_id||!Array.isArray(m.artifacts)||m.artifacts.length!==3)process.exit(1);const roles=['task','implementer-prompt','runtime-context'];if(new Set(m.artifacts.map(a=>a.role)).size!==3||!roles.every(r=>m.artifacts.some(a=>a.role===r))||m.artifacts.some(a=>typeof a.path!=='string'||!fs.existsSync(a.path)||a.provenance!=='attempt_specific'||a.preserved_snapshot!==true))process.exit(1);if(JSON.stringify(x.implementation_context_paths)!==JSON.stringify(m.artifacts.map(a=>a.path)))process.exit(1);"
node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync('implementation.json','utf8'));const p=x.implementation_context_paths;if(!Array.isArray(p)||p.length!==3||typeof x.implementation_notes!=='string'||!p.every(v=>x.implementation_notes.includes(v))||!Array.isArray(x.changed_files)||x.changed_files.length!==0||x.git_diff!==null||!Array.isArray(x.fallback_changed_files)||x.fallback_changed_files.length!==0||x.fallback_git_diff!==null)process.exit(1);"
git diff --check -- implementation.json quality-gates.json docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-attach-actual-preserved-attempt-context-and-clear-repository-diff-metadata.md src/contracts/task/doctor-recovery-task.md src/contracts/runtime/operation-loop.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md
node -e "const cp=require('child_process');const a=new Set(['implementation.json','quality-gates.json','docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-attach-actual-preserved-attempt-context-and-clear-repository-diff-metadata.md','src/contracts/task/doctor-recovery-task.md','src/contracts/runtime/operation-loop.md','docs/features/002-configuration-model/state.md','docs/compassrose/PROJECT_STATE.md']);const d=cp.execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);if(d.some(p=>!a.has(p)))process.exit(1);"
npm run typecheck
npm test
node -e "const fs=require('fs');const q=JSON.parse(fs.readFileSync('quality-gates.json','utf8'));const required=['npm run typecheck','npm test'];if(typeof q.attempt_id!=='string'||!q.attempt_id||q.final_run_marker!==true||q.status!=='passed'||!Array.isArray(q.unexplained_failures)||q.unexplained_failures.length!==0||!Array.isArray(q.gates)||required.some(c=>!q.gates.some(g=>g.command===c&&g.status==='passed'&&g.final_run===true)))process.exit(1);"
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: unknown
- signature: unknown-quality-failed-feature-002-configuration-model-is-in-quality-failed-and-needs-diagnosis-
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF`
- active_correction_task: `none`
- active_unblock_task: `none`
