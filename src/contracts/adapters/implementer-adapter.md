# Implementer Adapter Contract

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
- Capture implementation notes if available.
- Return normalized implementation result.

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
  raw_output: string
  implementation_notes: string | null
  error: string | null
```

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
- Return a Git diff.
- Preserve raw output for audit.
- Fail clearly if no diff is produced.
- Remain provider-agnostic.

---

## External Tools

Possible implementers include:

- OpenCode
- Codex CLI
- Aider
- Local OpenAI-compatible models
- Custom shell commands

CompassRose must not depend on a single implementer.
