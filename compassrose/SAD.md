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
│   └── Diagnostic/Autocorrection Subsystem
├── Project Analyzer
├── Intent Compiler
├── Project State Manager
├── Role Runtime
│   ├── Planner Adapter
│   ├── Implementer Adapter
│   └── Reviewer Adapter
├── Git Workspace Manager
├── Command Runner
├── Configuration Loader
└── Artifact Store
```

The Project Analyzer and Intent Compiler are the two components an empty or existing repository
needs to bootstrap into CompassRose's model (see sections 5.3/5.4); as of this writing neither has
a runtime implementation. The Diagnostic/Autocorrection Subsystem and Artifact Store below do have
substantial real implementations that predate their addition to this document -- this document
lagged the code (see ADR-0003, Documentation as UI); this revision catches it up.

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

Not yet implemented (see `docs/features/004-project-understanding/request.md`, still `request_pending`). The fresh-bootstrap-vs-existing-project signal this component needs is already settled by ADR-0046: whether `compassrose/CONFIG.md` (via `getBootstrapConfigPath`, `src/config/compassRosePaths.ts`) exists is exactly "has this repository already been set up." `npm run setup` (the bootstrap-only slice of this responsibility) creates that root's skeleton when absent; the deeper repository inspection described above remains this component's own future work.

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

Every structured call an adapter makes passes through one recording choke point before execution, which logs the exact prompt, tool, and configuration snapshot to the Artifact Store (5.14) and increments the run-wide invocation counter that the run-wide AI call budget (5.13) checks. A heartbeat runner monitors each external CLI subprocess while it runs, emitting a periodic liveness signal so a long implementer or planner invocation is distinguishable from a hung one.

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

## 5.13 Diagnostic/Autocorrection Subsystem

Not present in earlier revisions of this document, though it makes up the majority of this
project's actual runtime complexity as of this writing -- added per ADR-0003 (Documentation as
UI): an undocumented subsystem this large is itself a violation of that principle.

When a task, review, or quality gate produces a blocked/failed result the Orchestrator cannot
resolve by continuing the normal plan → implement → review cycle, this subsystem decides how to
recover without abandoning the deterministic-orchestrator principle (ADR-0007). It is layered,
deterministic-first:

- **Blocker classification.** Every blocked/failed result is classified into a closed `BlockerKind`
  taxonomy (`state_corruption`, `task_interface_gap`, `cli_mismatch`, `environment`,
  `implementation_failure`, `review_failure`, `smoke_failure`, `unknown`) and a `recoverability` tier (`auto`,
  `agent`, `human`, `terminal`). Whenever a call site already knows the cause (e.g. a structured
  implementation diagnostic, an objective quality-gate result, or a deterministic scope check), the
  kind is read directly from that fact rather than reconstructed by matching keywords in free text.
  Free-text classification remains the fallback only for calls with no structured signal to read.
- **Three outcomes, and none of them is an automatic repair.** A blocked feature is either
  corrected deterministically (`correct_state`, for stale/malformed state documents), or escalated
  to a new tracked fix (`file_blocking_fix`, for defects outside its own frame entirely), or set
  aside for a recovery conversation with a person (`block_for_conversation`). The run carries on in
  the last two cases rather than grinding on the blocked item. `correct_state` has its own
  configured iteration limit, enforced *before* any planner call is spent, and its limit-exceeded
  error routes through one shared handler that converts it into a clean stop instead of an uncaught
  crash.
- **Why there is no fourth outcome.** An earlier revision had one: a bounded "doctor recovery" task,
  planned and executed by an agent, chaining into another when it failed. Feature
  `003-doctor-command` accumulated nine of them without ever unblocking, and not one asked a person
  anything. Every ceiling built over that mechanism (two independent recovery budgets, a shared
  limit handler, a reset rule) bounded how long it would fail for, never whether it could succeed.
  It was deleted; ADR-0047 records why, and `compassrose/features/026-conversational-doctor-recovery/`
  specifies what replaced it.
- **A run-wide AI call budget.** A single counter, incremented at the same recording choke point
  every structured AI call already passes through (5.6), is checked centrally once per step, before
  any feature or fix is even inspected -- bounding total AI spend for an entire `--loop` invocation,
  not just primary task completions.
- **Cross-checked consequential decisions.** The two most consequential single-AI-vote decisions in
  this subsystem -- whether to file a new tracked fix instead of handing the blocker to a person,
  and whether to trust an approval that gates whether a diff lands -- are not trusted from a single
  response.
  Filing a fix is cross-checked by firing the choice itself (never the fix's own free-text payload)
  as several independent, fresh-context votes and requiring unanimous agreement before acting,
  escalating to a safe stop on disagreement. A review's approval is checked deterministically
  against the quality-gate facts the orchestrator already computed itself, since the reviewer's
  relay of an already-known fact has exactly one legitimate value by the time review runs.
- **Bounded historical narration.** A feature's own recovery narrative is read back as live context
  on every subsequent planning, implementation, and review call for that feature. Once accumulated
  narration is no longer live troubleshooting context, it is compacted into a single summary naming
  the task ids it covers, with full detail left to git history and the Artifact Store rather than
  duplicated in the document.

See `compassrose/ADR.md` (ADR-0031 through ADR-0041, and ADR-0047) for the specific decisions this
subsystem implements, each closing a concrete defect found by auditing this project's own real
recovery incidents while developing itself (ADR-0022, Self-Hosting Documentation Model). ADR-0047
is the one that withdraws rather than adds: it records that most of ADR-0031 through ADR-0041 were
ceilings over a mechanism that should not have existed.

---

## 5.14 Artifact Store

A repository-local, append-only record of what actually happened, rooted under
`.git/proto-compassrose/`. Distinct from the project-state documents (5.5): the Artifact Store is
the audit trail meant for humans and future diagnostic calls to inspect after the fact, while
project state is what the Orchestrator itself reads to decide the next step.

Recorded artifacts include, among others: every structured agent invocation's exact prompt and
configuration snapshot (5.6); blocker profiles at the moment a feature was blocked; recovery
lessons distilled from completed recovery attempts, read back across a feature's *entire* history
(not just its most recent attempt) so a defect recurring across otherwise-unrelated task anchors
can be surfaced as a pattern instead of only ever being visible once; and diagnostic decisions from
the subsystem in 5.13.

Not every artifact category needs pruning -- some are deliberately unbounded because their value
depends on covering a feature's whole history, not a recent window of it (see `docs/REFACTOR_PLAN.md`
item 7 for a case where pruning was considered and rejected for exactly this reason).

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
