# Implementer Adapter Contract

TypeScript contract: `src/contracts/adapters/implementerAdapterContracts.ts`.

## Purpose

Defines how CompassRose communicates with an Implementer.

The Implementer Adapter executes a task through an external coding tool or model.

---

## Responsibility

The adapter invokes the configured implementation tool and captures the resulting repository changes.

The adapter does not decide whether the task is complete.

---

## Required Capabilities

An Implementer Adapter must:

- Accept a Task.
- Invoke the configured implementation tool.
- Preserve working tree isolation.
- Capture changed files.
- Capture Git diff.
- Capture implementation notes for every attempt.
- Treat implementation notes as concise execution commentary for the reviewer, not as product documentation.
- If the tool does not produce implementation notes, mark the attempt as failed and preserve the omission in diagnostics.
- Return normalized implementation result.
- Treat repeated invocations for the same task as distinct attempts when the runtime allows recovery.
- Preserve enough evidence to distinguish the latest attempt from any earlier interrupted attempt.

---

## Input

```yaml
adapter_input:
  task: object
  role_config:
    adapter: string
    provider: string
    model: string
    command: string | null
    endpoint: string | null
    timeout_seconds: number
  workspace:
    repository_root: string
    branch: string
```

---

## Output

```yaml
adapter_output:
  status: success | failed
  changed_files:
    - string
  git_diff: string
  fallback_changed_files:
    - string
  fallback_git_diff: string | null
  raw_output: string
  implementation_notes: string | null
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
  error: string | null
```

---

## Diagnostic Classification

The adapter must preserve enough evidence for the runtime and user to distinguish why an implementation attempt produced no usable result.

Allowed classifications:

- `context_overflow`: the tool reported or strongly indicated a context, token, or conversation-size limit.
- `provider_failure`: the configured provider, endpoint, model, or upstream service failed before task execution could complete.
- `permission_prompt`: execution stopped because the tool needed interactive approval, credentials, or filesystem/network permission.
- `reviewable_diff_lost`: the tool appears to have created a commit or otherwise cleared the live worktree diff before CompassRose could capture the reviewable change.
- `already_complete`: the tool exited successfully, reported that the requested behavior already existed, and produced no diff because no code change was needed.
- `tool_refusal`: the tool explicitly refused the request or rejected the invocation.
- `missing_implementation_notes`: the tool produced a repository attempt without the required implementation justification.
- `model_passivity`: the tool completed without making changes, without producing minimum progress evidence, or without taking the requested first executable step, without an explicit refusal, an `already_complete` justification, or an infrastructure failure.
- `ui_cli_behavior`: the wrapper, terminal UI, CLI mode, or command invocation prevented or obscured execution.
- `unknown`: the adapter lacks enough evidence to choose a more specific classification.

The adapter must not infer intent from a missing diff.

If no code was produced, the adapter must report the observable evidence instead of assuming why a previous implementer stopped.

If the live worktree diff is empty because the tool committed or cleaned away the change before handoff, the adapter must fail the attempt, classify it as `reviewable_diff_lost`, and preserve any fallback commit diff only as diagnostic evidence.

If the tool exits successfully after only reading context, the adapter must treat absent `minimum_progress_evidence` as a failed implementation attempt and classify it as `model_passivity` unless stronger evidence supports another classification such as `already_complete`.

If the tool exits successfully but omits the required implementation notes, the adapter must treat that omission as a failed implementation attempt and classify it as `missing_implementation_notes` unless stronger evidence supports another classification.

Successful implementation attempts must include non-null implementation notes so the reviewer can see the implementer justification, including explicit `already_complete` evidence when no diff was needed.

Diagnostic evidence may include concise excerpts from raw output, process status, timeout status, command metadata, and explicit tool messages.

Diagnostic evidence must not include secrets.

---

## Rules

The adapter must not:

- Approve its own changes.
- Merge changes.
- Update project state.
- Override task scope.
- Modify global external tool configuration.

The adapter must:

- Respect allowed and forbidden paths.
- Check whether the task's `minimum_progress_evidence` is present.
- Return a Git diff.
- Preserve fallback diff evidence when the live worktree diff was lost after a commit, without treating that fallback as a successful handoff.
- Preserve raw output for audit.
- Preserve normalized diagnostics for audit.
- Keep each attempt independently reviewable when the runtime retries a partially completed implementation.
- Fail clearly if no diff is produced unless the implementation notes and observed repository state show that the requested behavior already existed and no repository change was needed.
- Remain provider-agnostic.

The adapter should support the repository-local canonical prompt document:

- `src/contracts/implementer/task-execution-prompt.md`

---

## External Tools

Possible implementers include:

- OpenCode
- Codex CLI
- Aider
- Local OpenAI-compatible models
- Custom shell commands

CompassRose must not depend on a single implementer.
