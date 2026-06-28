# CompassRose Software Architecture Document

## 1. Purpose

CompassRose is a deterministic software development orchestration system.

Its purpose is to guide a software repository toward a roadmap by repeatedly generating, executing, reviewing, and validating small implementation tasks.

CompassRose does not try to generate a complete implementation plan upfront.

Instead, it continuously derives the next task from:

- The roadmap
- The current repository state
- The architecture model
- The configured planning and execution rules

The roadmap provides direction.
The repository provides reality.
CompassRose reconciles both through controlled iteration.

---

## 2. Architectural Principles

### 2.0 Self Application

CompassRose shall be developed using CompassRose.

The project serves as the primary reference implementation of its own methodology.

Architectural decisions, roadmap management, feature organization and project state management shall follow CompassRose conventions.

### 2.1 Deterministic Core

The CompassRose core must not depend on AI for workflow decisions.

The orchestrator is responsible for deterministic state transitions, process execution, validation, persistence, and error handling.

AI-powered tools may be used by configurable roles, but the orchestration logic itself must remain explicit and auditable.

### 2.2 CLI First

The first implementation target is a CLI application.

IDE integration, such as a VS Code extension, may be added later as a thin user interface over the CLI.

The CLI must remain the primary automation interface.

### 2.3 Repository-Centric State

CompassRose stores project knowledge inside the repository.

The repository should contain enough CompassRose metadata to allow the system to resume, audit, and continue execution.

No critical workflow state should exist only inside an external service or IDE.

### 2.4 Configurable AI Roles

Planner, Implementer, and Reviewer are roles, not hardcoded tools.

Each role must be configurable independently.

A project may choose:

- Local models for all roles
- Remote models for all roles
- A cheap model for implementation and a premium model for planning and review
- Different CLI tools per role
- The same CLI tool for all roles

CompassRose must not assume a specific provider such as OpenCode, Codex CLI, OpenAI, Anthropic, Gemini, or a local llama.cpp server.

### 2.5 Git as Contract

CompassRose uses Git as the primary contract between implementation and review.

The implementer produces a Git diff.

The reviewer evaluates the Git diff against the task, roadmap, rules, and repository state.

Approved changes are committed and reflected in project state.

### 2.6 Small Task Bias

CompassRose should prefer small, atomic, independently reviewable tasks.

Large tasks increase cost, context size, risk, and review complexity.

Feature-level planning may define deliverables and a high-level implementation outline.
Operational planning still generates only the next task.

### 2.7 Cross-Platform Operation

CompassRose must run on Linux and Windows.

The implementation must avoid OS-specific assumptions in core logic.

Platform-specific behavior must be isolated in dedicated adapters or utilities.

---

## 3. System Context

CompassRose runs inside or against a software repository.

```text
User
  ↓
CompassRose CLI
  ↓
Repository
  ↓
Configured AI Tools
  ↓
Git Diff / Review / State Update
```

External tools may include:

- OpenCode
- Codex CLI
- Aider
- Local OpenAI-compatible servers
- Custom shell commands
- Test runners
- Build tools
- Linters

CompassRose coordinates these tools but should not depend on any single one.

---

## 4. High-Level Components

```text
CompassRose
├── CLI
├── Orchestrator
├── Project Analyzer
├── Intent Compiler
├── Project State Manager
├── Role Runtime
│   ├── Planner Adapter
│   ├── Implementer Adapter
│   └── Reviewer Adapter
├── Git Workspace Manager
├── Command Runner
└── Configuration Loader
```

---

## 5. Component Responsibilities

## 5.1 CLI

The CLI is the primary user interface for the MVP.

Example commands:

```bash
compassrose init
compassrose diagnose
compassrose edit-road-map
compassrose next
compassrose run
compassrose review
compassrose status
```

Responsibilities:

- Parse commands
- Load repository context
- Invoke the orchestrator
- Display progress
- Report errors
- Support automation from scripts or CI

The CLI must be usable without an IDE.

---

## 5.2 Orchestrator

The orchestrator is the deterministic execution engine.

Responsibilities:

- Load configuration
- Load project state
- Select the current milestone
- Request a task from the planner
- Invoke the implementer
- Capture Git diff
- Run validation commands
- Invoke the reviewer
- Process reviewer status
- Update project state
- Advance or stop the workflow

The orchestrator must not generate code or perform AI reasoning itself.

---

## 5.3 Project Analyzer

The Project Analyzer builds the initial understanding of a repository.

For existing repositories, it inspects:

- Folder structure
- Languages
- Frameworks
- Package managers
- Build commands
- Test commands
- Existing documentation
- Git metadata
- Entry points
- Existing modules

For empty repositories, it produces a minimal baseline state.

Output:

```text
repository_state.yml
```

or an equivalent internal project state file.

---

## 5.4 Intent Compiler

The Intent Compiler converts human language into CompassRose-native documentation.

Input may be:

- Plain language project description
- Markdown roadmap
- Existing README
- Existing issue list
- Existing docs

Output may include:

- `roadmap.yml`
- `sad.yml`
- `planning_rules.yml`
- `execution_rules.yml`

The user should not be required to manually create CompassRose YAML files before using the system.

---

## 5.5 Project State Manager

The Project State Manager maintains the evolving state of the project.

It tracks:

- Current roadmap progress
- Implemented capabilities
- Known modules
- Created interfaces
- Approved architectural decisions
- Pending capabilities
- Last completed task
- Current milestone status

The project state is updated only after approved changes.

Project state should represent the actual repository, not an imagined future plan.

---

## 5.6 Role Runtime

The Role Runtime executes configured AI roles through adapters.

Roles:

- Planner
- Implementer
- Reviewer

Each role has:

- Provider
- Model
- Command
- Input contract
- Output contract
- Timeout
- Retry policy
- Optional cost limits
- Optional context limits

The Role Runtime normalizes communication between CompassRose and external tools. Handles ratelimits and execution pauses due to external tools temporary unavailability.

---

## 5.7 Planner Adapter

The Planner Adapter generates the next atomic task.

Input:

- Formalized feature documents
- Roadmap
- Project state
- Architecture model
- Planning rules
- Repository summary

Output:

```yaml
planner_output:
  task:
    task_id: TASK-0001
    feature_id: 023-authentication
    title: Create initial authentication service
    objective: Add the minimal authentication service required by the current milestone.
    first_executable_step: Read the existing service layout under `src/` and add the first authentication test file under `tests/auth/`.
    minimum_progress_evidence:
      - `tests/auth/` contains a new or updated authentication test.
      - `src/auth/` contains implementation code for the tested behavior.
    trace:
      roadmap_objective: Deliver the first authentication milestone.
      feature_goal: Establish the minimal authentication service.
      state_gap: No authentication service exists yet.
    context:
      summary: The repository needs the first service layer for authentication behavior.
      relevant_paths:
        - src/auth/
        - tests/auth/
      relevant_modules:
        - authentication
        - api
    scope:
      allowed_paths:
        - src/auth/
        - tests/auth/
      forbidden_paths:
        - docs/
        - src/cli/
    constraints:
      - Keep the task small.
      - Do not modify unrelated modules.
    development_policy:
      mode: test_guided
    quality_gates:
      before_review:
        - npm test
        - npm run typecheck
    acceptance_criteria:
      - Authentication service exists.
      - The service exposes login and logout methods.
      - Tests compile and pass.
    expected_deliverables:
      - code
      - tests
```

The planner must not generate a long-term executable task list by default.

It generates the next task only.

Feature planning and task planning are distinct activities:

- feature planning formalizes a user request into feature, architecture, and state documents
- task planning derives the next atomic task from those documents and repository reality

---

## 5.8 Implementer Adapter

The Implementer Adapter executes the current task.

Input:

- Task definition
- Execution rules
- Relevant repository context
- Allowed files or allowed areas
- Current branch/workspace

Output:

- Modified files
- Git diff
- Optional implementation notes

The implementer should not be trusted to decide task completion.

Task completion is determined by validation and review.

---

## 5.9 Reviewer Adapter

The Reviewer Adapter evaluates the implementation.

Input:

- Task definition
- Git diff
- Test output
- Build output
- Relevant roadmap section
- Relevant project state
- Review rules

Output:

```yaml
reviewer_output:
  task_id: TASK-0001
  status: approved
  summary: The implementation satisfies the task and all mandatory checks passed.
  acceptance:
    criteria:
      - criterion: Authentication service exists.
        status: passed
        notes: The service was added in the expected module.
  findings: []
  scope_check:
    status: passed
    unrelated_changes: []
  quality_gate_check:
    status: passed
    failed_gates: []
  correction_task: null
  project_state_update_hint: Authentication foundation is now present.
```

or:

```yaml
reviewer_output:
  task_id: TASK-0001
  status: changes_required
  summary: The core implementation is present, but error handling is incomplete.
  acceptance:
    criteria:
      - criterion: Invalid credentials return the expected error.
        status: failed
        notes: Invalid credentials currently fall through to an unhandled path.
  findings:
    - severity: error
      message: The implementation does not handle invalid credentials.
      path: src/auth/service.ts
      related_acceptance_criterion: Invalid credentials return the expected error.
  scope_check:
    status: passed
    unrelated_changes: []
  quality_gate_check:
    status: passed
    failed_gates: []
  correction_task:
    parent_task_id: TASK-0001
    correction_task_id: TASK-0001-C1
    feature_id: 023-authentication
    title: Handle invalid credentials in authentication service
    objective: Add explicit invalid credential handling without changing unrelated code.
    review_findings:
      - Invalid credential handling is missing.
    scope:
      allowed_paths:
        - src/auth/
      forbidden_paths:
        - docs/
        - src/cli/
    constraints:
      - Preserve existing success-path behavior.
    acceptance_criteria:
      - Invalid credentials return the expected error.
      - Existing tests still pass.
    quality_gates:
      before_review:
        - npm test
  project_state_update_hint: null
```

The reviewer may produce a correction task, but the orchestrator decides whether and how to execute it.

---

## 5.10 Git Workspace Manager

The Git Workspace Manager isolates and records changes.

Responsibilities:

- Ensure clean working tree before execution
- Create task branches
- Capture diffs
- Create commits
- Revert failed attempts
- Merge approved work
- Preserve audit history

CompassRose should avoid allowing AI tools to directly manage irreversible Git operations unless explicitly configured.

---

## 5.11 Command Runner

The Command Runner executes project commands.

Examples:

- Build
- Test
- Lint
- Format
- Type check

Commands are project-specific and configurable.

CompassRose should not hardcode npm, dotnet, pytest, cargo, Maven, or any other ecosystem.

---

## 5.12 Configuration Loader

Loads CompassRose configuration from the repository and user environment.

Configuration sources may include:

- Project config
- User config
- Environment variables
- CLI flags

Project config should override defaults.

CLI flags should override project config.

---

## 6. Suggested Repository Structure

```text
docs/
└── compassrose/
    ├── roadmap.yml
    ├── sad.yml
    ├── planning_rules.yml
    ├── execution_rules.yml
    ├── repository_state.yml
    └── compassrose.yml
```

This structure may evolve, but the MVP should keep all CompassRose state visible and versionable.

---

## 7. Configuration Model

CompassRose must allow role-level configuration.

Example:

```yaml
version: 1

roles:
  planner:
    adapter: opencode
    provider: openai
    model: gpt-5.5
    mode: review-grade

  implementer:
    adapter: opencode
    provider: local-openai-compatible
    model: qwen3.6-35b-a3b
    endpoint: http://127.0.0.1:8081/v1

  reviewer:
    adapter: codex-cli
    provider: openai-codex
    model: default

commands:
  build: npm run build
  test: npm test
  lint: npm run lint

git:
  branch_prefix: compassrose/
  commit_prefix: "compassrose:"

limits:
  max_files_per_task: 5
  max_review_attempts: 3
```

The exact schema is not final.

The important architectural rule is that AI roles are configured, not hardcoded.

---

## 8. Provider and Adapter Strategy

CompassRose should distinguish between providers and adapters.

### Provider

The model backend.

Examples:

- OpenAI
- Anthropic
- Gemini
- Local llama.cpp server
- Local Ollama server
- OpenAI-compatible endpoint

### Adapter

The executable interface CompassRose calls.

Examples:

- OpenCode adapter
- Codex CLI adapter
- Aider adapter
- Raw OpenAI-compatible HTTP adapter
- Custom shell adapter

This allows combinations such as:

```text
OpenCode adapter + local Qwen model
OpenCode adapter + OpenAI provider
Codex CLI adapter + ChatGPT subscription auth
Raw HTTP adapter + llama.cpp endpoint
```

The ideal MVP should support at least:

- One local OpenAI-compatible model endpoint
- One external CLI coding tool
- One review-capable provider

---

## 9. Workflow States

CompassRose uses explicit repository-local contracts for workflow state and runtime behavior:

```text
src/contracts/state/feature-state.md
src/contracts/runtime/operation-loop.md
```

The MVP needs both:

- a feature lifecycle state machine that can be read deterministically from `state.md`
- a runtime loop contract that maps lifecycle state to the next valid action

Suggested feature lifecycle:

```text
request_pending
formalization_pending
formalized
task_planning_pending
task_ready
implementation_running
implementation_failed
quality_gates_pending
quality_failed
review_pending
review_failed
correction_pending
blocked
completed
```

The orchestrator owns state transitions.

AI tools may propose results, but they do not directly mutate workflow state.

The runtime must use one lifecycle state as the primary transition key.
Narrative status text is supporting context only.

---

## 10. MVP Scope

The initial MVP should support:

- CLI only
- Existing repository diagnosis
- Empty repository initialization
- Roadmap generation from plain language
- Configurable planner, implementer, and reviewer roles
- Git diff based review
- Deterministic task loop
- Manual approval gates
- Project state updates after approved tasks

Out of scope for MVP:

- VS Code extension
- Web UI
- Parallel task execution
- Multi-agent debate
- Cloud execution
- Team permissions
- Long-running background service

---

## 11. Non-Goals

CompassRose is not:

- An IDE
- A chat assistant
- A general autonomous agent
- A replacement for software architecture
- A replacement for code review ownership
- A monolithic AI coding tool

CompassRose is a deterministic orchestration layer for AI-assisted software delivery.

---

## 12. Key Risks

### 12.1 Context Drift

Generated tasks may become stale if the repository changes.

Mitigation:

- Generate one task at a time
- Update project state after every approved change
- Base planning on repository reality

### 12.2 Overly Large Tasks

Large tasks increase failure rate and review cost.

Mitigation:

- Enforce task size limits
- Prefer atomic tasks
- Use correction tasks

### 12.3 Provider Lock-In

Hardcoding a tool or provider would weaken CompassRose.

Mitigation:

- Use adapter architecture
- Configure roles independently
- Keep the core provider-agnostic

### 12.4 Uncontrolled Git Changes

AI tools may modify unrelated files.

Mitigation:

- Use isolated branches
- Capture diffs
- Validate allowed paths
- Review before merge

### 12.5 Cost Explosion

Repeated planning and review can become expensive.

Mitigation:

- Keep roadmap lightweight
- Keep tasks small
- Use local models where possible
- Use premium models only where they add value

---

## 13. Future Extensions

Possible future additions:

- VS Code extension
- Web dashboard
- CI integration
- Multiple reviewer roles
- Risk-based model selection
- Automatic provider fallback
- Cost tracking
- Task history explorer
- Repository knowledge graph
- Multi-repository orchestration

---

## 14. Summary

CompassRose is built around a simple idea:

Do not plan the whole road.

Keep the destination clear.

Observe the terrain.

Take the next correct step.

CompassRose should remain deterministic at its core, configurable at its edges, and honest about the repository as the source of truth.
