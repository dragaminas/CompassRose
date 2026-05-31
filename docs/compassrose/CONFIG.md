# CompassRose Project Configuration

This file defines the project-local configuration used by CompassRose.

CompassRose must read this file, validate it, and use it as the effective project-level configuration for this repository.

This document should stay compact and operational. Architectural rationale belongs in `SAD.md`, `ADR.md`, `DMS.md`, `UX.md`, and `README.md`.

---

## Configuration precedence

```text
Task
> Feature
> Project
> User
> CompassRose Defaults
```

For the MVP, CompassRose only needs to support project-level configuration from this file.

---

## MVP scope

For the MVP, CompassRose supports only one generic external CLI adapter.

Provider-specific adapters are out of scope.

CompassRose delegates provider and model selection to the external tool configured by the user.

CompassRose must not modify global configuration from tools such as Codex CLI, OpenCode, Aider, Ollama, OpenAI, Anthropic, Gemini, or similar systems.

---

## Configuration

```yaml
project:
  name: compassrose
  type: cli
  language: typescript
  package_manager: npm
  supported_platforms:
    - linux
    - windows
  documentation_root: docs
  source_root: src

execution:
  mode: interactive
  task_generation: one_task_at_a_time
  repository_is_source_of_truth: true
  planner_uses_repository_state: true
  orchestrator_uses_ai: false

roles:
  planner:
    enabled: true
    adapter: external_cli

  implementer:
    enabled: true
    adapter: external_cli

  reviewer:
    enabled: true
    adapter: external_cli

adapters:
  external_cli:
    type: external_cli
    command: ""
    args: []
    stdin: false
    input_file_argument: ""
    output_file: ""

development_policy:
  default: implementation_first

review_policy:
  mode: required
  record_skipped_review: true

quality_gates:
  enabled: true
  required:
    - typecheck
    - tests
  optional:
    - lint
    - build

commands:
  typecheck: "npm run typecheck"
  tests: "npm test"
  lint: "npm run lint"
  build: "npm run build"

git_policy:
  require_clean_worktree_before_task: true
  review_target: git_diff
  allow_dirty_worktree: false
  branch_per_task: optional
  commit_after_task: manual

limits:
  max_tasks_per_run: 1
  max_retries_per_task: 1
  max_review_iterations: 1
  stop_on_quality_gate_failure: true
  stop_on_review_failure: true

platform:
  shell:
    linux: bash
    windows: powershell
  line_endings: preserve

documentation:
  roadmap: docs/ROADMAP.md
  project_state: docs/compassrose/PROJECT_STATE.md
  config: docs/compassrose/CONFIG.md
  features_root: docs/features
  feature_request_file: request.md
  feature_files:
    - feature.md
    - architecture.md
    - state.md
  templates_root: docs/templates
  contracts_root: src/contracts
```

---

## Allowed values

```yaml
execution.mode:
  - interactive
  - semi_automatic
  - automatic

development_policy.default:
  - test_guided
  - implementation_first
  - documentation_first
  - strict_tdd

review_policy.mode:
  - required
  - optional
  - disabled

git_policy.review_target:
  - git_diff

git_policy.branch_per_task:
  - required
  - optional
  - disabled

git_policy.commit_after_task:
  - automatic
  - manual
  - disabled

adapters.external_cli.type:
  - external_cli
```

---

## Review skip record

When `review_policy.mode` is `optional`, skipped reviews must be recorded explicitly.

```yaml
review_skip_record:
  task_id: ""
  reason: ""
  skipped_by: ""
  timestamp: ""
```

Skipping review is allowed, but it must not be invisible.

---

## Quality gate override

Quality gates are independent from AI review.

A task may override quality gates only when the reason is documented.

```yaml
quality_gate_override:
  task_id: ""
  disabled_gates:
    - tests
  reason: ""
```

---

## External tool isolation

CompassRose may call external tools through the configured external CLI adapter.

CompassRose must not silently modify global user configuration files, including but not limited to:

```text
~/.config/*
~/.codex/*
~/.opencode/*
~/.aider*
%APPDATA%/*
```

Allowed behavior:

```text
- read project-local CompassRose configuration
- generate project-local task files
- generate project-local review files
- call external tools using configured commands
- pass temporary or project-local input files to external tools
```

Forbidden behavior:

```text
- silently change global provider configuration
- silently change global model configuration
- silently overwrite user settings of external AI tools
- assume that one external tool is the default CompassRose backend
```

---

## Doctor MVP

The first real CLI command should be:

```bash
compassrose doctor
```

For the MVP, `compassrose doctor` must validate:

```text
- CONFIG.md exists
- the YAML configuration block can be parsed
- required sections exist
- required documentation paths exist
- the current platform is supported
- the current directory is inside a git repository
- configured commands exist or are intentionally empty
```

Expected successful output:

```text
CompassRose Doctor

Config file: found
Project name: compassrose
Platform: supported
Git repository: found
Documentation root: found
Roadmap: found
Project state: found
Contracts root: found

Status: OK
```
