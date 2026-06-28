# Reviewer Input Contract

TypeScript contract: `src/contracts/reviewer/reviewerContracts.ts`.

## Purpose

Defines the information provided to a Reviewer role.

The Reviewer validates whether an implementation satisfies the task.

---

## Responsibility

The Reviewer compares intent, diff, and validation results.

The Reviewer does not implement fixes.

---

## Input Sources

Required inputs:

- Task
- Git diff
- Build output, if available
- Test output, if available
- Quality gate results
- Relevant feature definition
- Relevant feature architecture
- Relevant feature state
- Project configuration

Optional inputs:

- Reviewable-diff handoff details from the task, when available
- Implementation notes from the attempt artifact, when available
- Implementation context artifacts that record the exact prompt and runtime snapshot sent to the implementer
- Implementation diagnostics
- Fallback committed diff evidence when the live worktree diff was lost before handoff
- Previous review result
- User review instructions

When reviewable-diff handoff details are present, the Reviewer should compare the observed implementation against the exact required changed files before deciding whether a missing diff means the task was already satisfied or the task context was too restrictive.
When implementation notes are present, the Reviewer should treat them as implementer-reported context, not as proof that the task is complete.
If implementation notes are missing, the Reviewer should treat that omission as an execution defect and surface it explicitly in the review result.
When implementation context artifacts are present, the Reviewer should inspect them before rejecting the attempt so context restrictions can be diagnosed explicitly.
If the live worktree diff is missing and CompassRose provides a fallback committed diff for diagnosis, the Reviewer should treat that fallback as evidence of attempted work, not as a valid handoff that can be approved silently.

---

## Required Shape

```yaml
reviewer_input:
  run_id: string
  task:
    task_id: string
    feature_id: string
    title: string
    objective: string
    first_executable_step: string
    minimum_progress_evidence:
      - string
    acceptance_criteria:
      - string
    scope:
      allowed_paths:
        - string
      forbidden_paths:
        - string
    constraints:
      - string
    reviewable_diff_handoff:
      require_live_diff: boolean
      allow_git_commit_before_handoff: boolean
      required_changed_files:
        - string

  implementation:
    changed_files:
      - string
    git_diff: string
    fallback_changed_files:
      - string
    fallback_git_diff: string | null
    notes: string | null
    implementation_context_paths:
      - string
    diagnostics:
      classification: context_overflow | provider_failure | permission_prompt | reviewable_diff_lost | already_complete | tool_refusal | missing_implementation_notes | model_passivity | ui_cli_behavior | unknown
      evidence:
        - string
      first_executable_step_status: attempted | not_attempted | unknown
      minimum_progress_evidence_status: present | absent | unknown
      exit_code: number | null
      signal: string | null
      timed_out: boolean
      command_invoked: string | null

  validation:
    quality_gates:
      - name: string
        command: string
        status: passed | failed | skipped
        output_summary: string

  feature_context:
    feature_source: string
    architecture_source: string
    state_source: string

  review_policy:
    require_tests: boolean
    allow_unrelated_changes: boolean
    allow_architectural_changes: boolean
```

---

## Rules

The Reviewer must:

- Check acceptance criteria.
- Check scope boundaries.
- Check quality gate results.
- Check the reviewable-diff handoff details before treating a missing diff as a failure.
- Consider implementation diagnostics when the diff is empty or incomplete.
- Consider minimum progress evidence before treating an implementation attempt as reviewable.
- Inspect the implementation context artifacts before rejecting the attempt so context restrictions can be diagnosed explicitly.
- Identify unrelated changes.
- Identify architectural violations.
- Return a structured result.
- Produce a correction task when changes are required.

The Reviewer must not:

- Modify files.
- Run implementation commands.
- Approve changes that fail mandatory quality gates.
- Ignore forbidden path changes.
- Expand task scope.

---

## Output

The Reviewer must return a document conforming to:

```text
src/contracts/reviewer/output.md
```
