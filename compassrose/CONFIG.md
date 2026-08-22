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

For the MVP, the only configuration scope that must be accepted at runtime is the project-level contract documented in this file.

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
  # This project's OWN documentation root (not CompassRose's -- see documentation.compassrose_root
  # below). Doctor only validates that this path exists; a project with no separate documentation
  # of its own can leave it as an otherwise-empty placeholder directory.
  documentation_root: docs
  source_root: src

execution:
  mode: interactive
  task_generation: one_task_at_a_time
  repository_is_source_of_truth: true
  planner_uses_repository_state: true
  orchestrator_uses_ai: false
  runtime_contract: src/contracts/runtime/operation-loop.md
  feature_state_contract: src/contracts/state/feature-state.md

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

smoke:
  command: "npm run doctor"
  expect:
    exit_code: 0
    stdout_contains: "Status: OK"
  timeout_seconds: 60

git_policy:
  require_clean_worktree_before_task: true
  review_target: git_diff
  allow_dirty_worktree: false
  branch_per_task: optional
  commit_after_task: manual

limits:
  max_tasks_per_run: 50
  max_retries_per_task: 1
  max_review_iterations: 1
  max_recovery_iterations: 3
  stop_on_quality_gate_failure: true
  stop_on_review_failure: true
  # Optional; unlike every field above, omitting it means unbounded. max_recovery_iterations
  # bounds attempts against the SAME blocker signature and resets on genuine forward progress;
  # this bounds the sum of every doctor-recovery cycle across the feature's entire life and
  # never resets.
  max_lifetime_recovery_cycles: 10
  # Optional; unlike every field above except max_lifetime_recovery_cycles, omitting it means
  # unbounded. max_tasks_per_run only counts primary task completions; this bounds every
  # structured AI call in a `--loop` run -- planning, review, doctor recovery, classification
  # ensembles, all of it -- checked once per step, centrally, rather than at each call site.
  max_ai_calls_per_run: 200

platform:
  shell:
    linux: bash
    windows: powershell
  line_endings: preserve

documentation:
  # Optional; defaults to 'compassrose' when omitted. Root for every CompassRose-owned document
  # below (this file, PROJECT_STATE.md, ADR.md, SAD.md, ROADMAP.md, DMS.md, features/, fixes/,
  # templates/) -- isolated from this project's own docs/ tree so CompassRose never restructures
  # a target project's pre-existing documentation. See src/config/compassRosePaths.ts.
  compassrose_root: compassrose
  roadmap: compassrose/ROADMAP.md
  project_state: compassrose/PROJECT_STATE.md
  config: compassrose/CONFIG.md
  features_root: compassrose/features
  feature_request_file: request.md
  feature_files:
    - feature.md
    - architecture.md
    - state.md
  fixes_root: compassrose/fixes
  fix_request_file: request.md
  fix_files:
    - fix.md
    - state.md
  role_prompt_files:
    feature_planning: src/contracts/planner/feature-planning-prompt.md
    task_planning: src/contracts/planner/task-planning-prompt.md
    fix_planning: src/contracts/planner/fix-planning-prompt.md
    task_execution: src/contracts/implementer/task-execution-prompt.md
    review: src/contracts/reviewer/review-prompt.md
    correction_task: src/contracts/reviewer/correction-task-prompt.md
  templates_root: compassrose/templates
  contracts_root: src/contracts
  state_contract: src/contracts/state/feature-state.md
  runtime_operation: src/contracts/runtime/operation-loop.md
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

The runtime contract and feature state contract constrain how `execution.mode`, `review_policy`, `quality_gates`, and `limits` are applied during orchestration.

---

## Configuration boundary

This file is the policy surface for the current repository.

Configuration may tune:

- execution mode and limits
- enabled roles and adapters
- command wiring
- review policy
- quality-gate policy

Configuration must not redefine:

- lifecycle states
- deterministic loop order
- blocker, correction, or unblock semantics
- required task and review artifact fields

Those invariants belong to the repository contracts under `src/contracts/`.

If CompassRose discovers through diagnosis/autocorrection that the repository needs a different policy, it should prefer changing this configuration surface.

If it discovers that the invariant workflow itself is wrong or incomplete, it should treat that as contract/interface work instead of a config-only repair.

---

## Doctor MVP configuration contract

The YAML block above remains the canonical project-level configuration example, but the first implementation of `compassrose doctor` must validate only the minimum project contract listed below.

Required top-level sections for the MVP:

```text
- project
- adapters
- commands
- documentation
```

Required fields inside that MVP contract:

```text
- project.name
- project.supported_platforms
- project.documentation_root
- adapters.external_cli.type
- commands.typecheck
- commands.tests
- commands.lint
- commands.build
- documentation.roadmap
- documentation.project_state
- documentation.config
- documentation.contracts_root
```

MVP-specific interpretation rules:

```text
- Only the project-level contract in this file is validated by the MVP.
- Task, Feature, and User overrides remain documented architecture, but are not read or validated yet.
- Future-facing sections outside the required subset may stay documented here, but Doctor must not require them for the first implementation.
- `adapters.external_cli.type` must be `external_cli`.
- `project.supported_platforms` must list the current platform.
- The paths named by `project.documentation_root`, `documentation.roadmap`, `documentation.project_state`, `documentation.config`, and `documentation.contracts_root` must exist inside the repository.
```

### Command presence semantics

For the MVP, `commands.typecheck`, `commands.tests`, `commands.lint`, and `commands.build` are always required keys in the contract.

The distinction between missing and intentionally empty commands is:

```text
- missing key: invalid configuration for Doctor
- present with empty string: valid, intentionally not configured for this project
- present with non-empty string: valid, configured command
```

The MVP Doctor check only validates that these keys are present and that each value is either an empty string or a non-empty shell command string. It does not execute the commands and does not infer provider-specific behavior from them.

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
- read project-local CompassRose prompt contracts
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
- the MVP-required sections and fields listed above exist
- the required documentation paths exist
- the current platform is supported
- the current directory is inside a git repository
- the required command keys are present and each command value is either intentionally empty or a non-empty string
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
