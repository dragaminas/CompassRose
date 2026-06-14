# Reviewer Input Contract

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

- Implementation notes
- Implementation diagnostics
- Previous review result
- User review instructions

When implementation notes are present, the Reviewer should treat them as implementer-reported context, not as proof that the task is complete.

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

  implementation:
    changed_files:
      - string
    git_diff: string
    notes: string | null
    diagnostics:
      classification: context_overflow | provider_failure | permission_prompt | tool_refusal | model_passivity | ui_cli_behavior | unknown
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
- Consider implementation diagnostics when the diff is empty or incomplete.
- Consider minimum progress evidence before treating an implementation attempt as reviewable.
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
