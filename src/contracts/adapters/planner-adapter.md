# Planner Adapter Contract

## Purpose

Defines how CompassRose communicates with a Planner implementation.

A Planner Adapter turns CompassRose planner input into an external tool invocation and normalizes the result.

---

## Responsibility

The adapter is responsible for integration.

The external planner is responsible for reasoning.

The orchestrator is responsible for workflow decisions.

---

## Required Capabilities

A Planner Adapter must:

- Accept Planner Input.
- Invoke the configured planner tool or provider.
- Capture raw output.
- Parse Planner Output.
- Validate output shape.
- Return normalized Planner Output to the orchestrator.

---

## Input

```yaml
adapter_input:
  planner_input: object
  role_config:
    adapter: string
    provider: string
    model: string
    command: string | null
    endpoint: string | null
    timeout_seconds: number
```

---

## Output

```yaml
adapter_output:
  status: success | failed
  planner_output: object | null
  raw_output: string
  error: string | null
```

---

## Rules

The adapter must not:

- Modify repository files.
- Modify project documentation.
- Update project state.
- Decide whether the task should execute.
- Modify global provider configuration.

The adapter must:

- Use project-local or explicit configuration.
- Preserve raw output for audit.
- Fail clearly when output cannot be parsed.
- Avoid hidden provider assumptions.

The adapter should support repository-local canonical prompt documents such as:

- `src/contracts/planner/feature-planning-prompt.md`
- `src/contracts/planner/task-planning-prompt.md`

---

## Non-Invasive Tool Use

The adapter must not modify global settings of tools such as OpenCode, Codex CLI, Aider, or local model servers.

External tools must be invoked through:

- Project-local configuration
- Explicit profiles
- CLI flags
- User-approved commands
