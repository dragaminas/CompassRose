# Reviewer Adapter Contract

## Purpose

Defines how CompassRose communicates with a Reviewer.

The Reviewer Adapter invokes a review-capable tool or model and normalizes the result.

---

## Responsibility

The adapter passes task, diff, and validation context to the configured reviewer.

The adapter parses the review result.

The adapter does not update project state.

---

## Required Capabilities

A Reviewer Adapter must:

- Accept Reviewer Input.
- Invoke the configured reviewer.
- Capture raw output.
- Parse Reviewer Output.
- Validate output shape.
- Return normalized Reviewer Output to the orchestrator.

---

## Input

```yaml
adapter_input:
  reviewer_input: object
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
  reviewer_output: object | null
  raw_output: string
  error: string | null
```

---

## Rules

The adapter must not:

- Modify files.
- Apply fixes.
- Merge changes.
- Update project state.
- Modify global external tool configuration.

The adapter must:

- Preserve raw output for audit.
- Validate structured reviewer output.
- Fail clearly when output is invalid.
- Preserve provider independence.

---

## Review Result

The normalized result must conform to:

```text
src/contracts/reviewer/output.md
```
