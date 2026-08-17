# CompassRose Architecture Decision Record

This document contains accepted architectural decisions.

The purpose of this document is to record decisions, not discussions.

---

## ADR-0001

### Title

Implementation Language

### Status

Accepted

### Decision

CompassRose shall be implemented in TypeScript.

---

## ADR-0002

### Title

CLI First

### Status

Accepted

### Decision

The CLI is the primary product.

All future interfaces shall be built on top of the CLI.

---

## ADR-0003

### Title

Documentation as User Interface

### Status

Accepted

### Decision

Documentation is the primary user interface.

The CLI is the execution interface.

---

## ADR-0004

### Title

Repository as Source of Truth

### Status

Accepted

### Decision

The repository is the authoritative representation of project reality.

---

## ADR-0005

### Title

Roadmap Driven Development

### Status

Accepted

### Decision

Users define outcomes.

CompassRose generates tasks.

---

## ADR-0006

### Title

Feature-Centric Documentation

### Status

Accepted

### Decision

Project knowledge shall be organized around features.

Features are the primary planning unit.

Tasks are temporary execution artifacts.

---

## ADR-0007

### Title

Deterministic Orchestrator

### Status

Accepted

### Decision

The orchestrator contains no AI.

All workflow transitions are deterministic.

---

## ADR-0008

### Title

Configurable AI Roles

### Status

Accepted

### Decision

Planner, Implementer and Reviewer are configurable roles.

They are not tied to specific providers or models.

---

## ADR-0009

### Title

Provider Agnostic Architecture

### Status

Accepted

### Decision

CompassRose shall support local and remote models.

CompassRose shall not depend on any single AI provider.

---

## ADR-0010

### Title

Adapter-Based Integration

### Status

Accepted

### Decision

CompassRose communicates with external tools through adapters.

Providers and adapters are independent concerns.

---

## ADR-0011

### Title

Git as Contract

### Status

Accepted

### Decision

Git diffs are the contract between implementation and review.

---

## ADR-0012

### Title

Generate One Task at a Time

### Status

Accepted

### Decision

CompassRose generates the next task only.

Long-lived executable task lists are not the primary planning mechanism.

---

## ADR-0013

### Title

Project State Over Task History

### Status

Accepted

### Decision

Planning is based on current project state.

Planning is not based on historical task definitions.

---

## ADR-0014

### Title

Human Editable Intent

### Status

Accepted

### Decision

Users must be able to modify roadmap, feature definitions and architectural documents directly.

---

## ADR-0015

### Title

Progressive Autonomy

### Status

Accepted

### Decision

CompassRose may increase automation over time, but approval gates remain explicit and auditable.

---

## ADR-0016

### Title

Feature-Level Outline With One Active Task

### Status

Accepted

### Decision

A feature may define implementation deliverables and a high-level implementation outline.

CompassRose still generates one active task at a time.

The outline provides continuity.
The task contract provides the execution boundary.

---

## ADR-0017

### Title

Reviewer Returns Structured Correction Tasks

### Status

Accepted

### Decision

Reviewer output shall include a structured status and, when changes are required, a correction task that conforms to the canonical correction-task contract.

### Status

Accepted

### Decision

CompassRose supports Manual, Assisted and Autonomous execution modes.

---

## ADR-0016

### Title

Plain Language Adoption

### Status

Accepted

### Decision

Users are not required to author CompassRose-specific documents before adoption.

CompassRose translates intent into structured project knowledge.

---

## ADR-0017

### Title

Language Agnostic Operation

### Status

Accepted

### Decision

CompassRose supports repositories regardless of implementation language.

The product itself is implemented in TypeScript.

---

## ADR-0018

### Title

Repository-Local State

### Status

Accepted

### Decision

CompassRose state shall be stored inside the repository whenever possible.

---

## ADR-0019

### Title

Small Task Bias

### Status

Accepted

### Decision

CompassRose prefers small, atomic and independently reviewable tasks.

---

## ADR-0020

### Title

Explainable Planning

### Status

Accepted

### Decision

Every generated task must be traceable to a roadmap objective and a feature.

## ADR-0021

### Title

Cross-Platform Runtime

### Status

Accepted

### Decision

CompassRose shall run on Linux and Windows.

Platform-specific behavior must be isolated behind adapters or utilities.

Shell commands, paths, process execution and file operations must not assume a Unix-only environment.

## ADR-0022

### Title

Self-Hosting Documentation Model

### Status

Accepted

### Decision

CompassRose shall use CompassRose principles to organize its own development.

Its roadmap, features, architecture, state and planning artifacts shall be managed using CompassRose conventions whenever practical.

## ADR-0023

### Title

Project-Scoped Configuration

### Status

Accepted

### Decision

CompassRose shall support repository-local configuration.

Project configuration is versioned with the repository.

User configuration remains external.

## ADR-0024

### Title

Configurable Development Policy

### Status

Accepted

### Decision

CompassRose shall not mandate TDD.

Development policy is configurable per project and may be overridden per feature.

## ADR-0024

### Title

Configurable Development Policy

### Status

Accepted

### Decision

CompassRose shall not mandate TDD.

Development policy is configurable per project and may be overridden per feature.

## ADR-0025

### Title

Non-Invasive Tool Integration

### Status

Accepted

### Decision

CompassRose shall not modify global configuration of external tools.

External tools must be invoked through explicit project-local configuration, isolated profiles, or user-approved commands.

## ADR-0026

### Title

Hierarchical Configuration

### Status

Accepted

### Decision

CompassRose configuration is hierarchical.

More specific scopes override less specific scopes.

Precedence order:

Task
> Feature
> Project
> User
> CompassRose Defaults

## ADR-0027

### Title

Feature-Owned Configuration

### Status

Accepted

### Decision

Features may define local configuration.

Feature configuration affects only the owning feature.

Feature configuration must not modify project-wide behavior.

## ADR-0028

### Title

Contract-First Development

### Status

Accepted

### Decision

Internal system contracts shall be defined before their implementation.

Type definitions and code structures shall derive from documented contracts.

## ADR-0029

### Title

Configurable Review Policy

### Status

Accepted

### Decision

CompassRose shall support required, optional and disabled review modes.

Skipped reviews must be explicitly recorded.

Quality gates are independent from AI review.

## ADR-0030

### Title

Quality Gates Before Acceptance

### Status

Accepted

### Decision

CompassRose shall support non-AI quality gates before accepting implementation output.

AI review may be disabled.

Quality gates remain independently configurable.

## ADR-0031

### Title

Structured Evidence Over Re-Derivation

### Status

Accepted

### Decision

When one component already computes a fact needed by another, that fact shall be passed through a typed field.

A consumer shall not re-derive a fact by parsing another component's human-readable summary or prose output.

## ADR-0032

### Title

Bounded-Retry Reset Conditions

### Status

Accepted

### Decision

A bounded-retry or attempt counter shall reset only when the specific condition it exists to bound is verified resolved.

It shall never reset on a nearby proxy, such as a bounded operation's own internal step succeeding.

## ADR-0033

### Title

Limit-Aware Bounded Operations

### Status

Accepted

### Decision

Code that decides which bounded operation to attempt next shall check that operation's own limit before proposing it, not rely solely on catching a limit-reached error afterward.

Every call site capable of throwing a limit-reached error shall route through a single shared handler that converts it into a clean stop, rather than an ad hoc try/catch at each call site.

## ADR-0034

### Title

Explicit Scope Declaration

### Status

Accepted

### Decision

Every bounded operation in CompassRose -- a decision input, a retry or correction limit, a disposable test fixture, a context handed to a role -- shall define its scope by an explicit, positive declaration of what belongs, fixed before the operation runs.

Ambient scope inherited by default and narrowed afterward by exclusion, by a nearby proxy signal, or by re-deriving a fact from another component's rendered output is not an acceptable substitute for that declaration.

ADR-0031, ADR-0032, ADR-0033, and ADR-0035 are specific instances of this decision, not independent rules.

## ADR-0035

### Title

Explicit Inclusion Over Post-Hoc Exclusion for Shared-State Clones

### Status

Accepted

### Decision

A disposable execution context derived from shared or live state (for example, an e2e test clone of the repository) shall be constructed by declaring the exact set of entries it depends on, and shall contain nothing else.

It shall not be constructed by copying the full source state and removing entries later found to cause contamination.

This is an instance of ADR-0034.

## ADR-0036

### Title

Deterministic Ensembles for Ambiguous Classification

### Status

Accepted

### Decision

When a classification decision has no structured signal to resolve it and would otherwise be guessed from free text by a single fragile heuristic, the orchestrator may resolve it deterministically by firing a fixed number of independent, fresh-context classification calls against the same declared, minimal input, and requiring unanimous agreement.

The orchestrator, not a model, decides when this ensemble fires and how its votes are combined. Disagreement among votes shall not be resolved by majority or by trusting any single vote; it shall be reported and force escalation to human recoverability.

This is CompassRose's local, deterministically-triggered substitute for a hosted subagent's fresh-context verification: the isolation between votes comes from declaring no shared history between calls, not from session or thread infrastructure.

## ADR-0037

### Title

Bounded Recovery History

### Status

Accepted

### Decision

A feature's own "Recovery History" narration, and the project-wide equivalent, shall not grow without bound. Once a feature reaches a point that proves its accumulated recovery narration is no longer live troubleshooting context, that narration shall be compacted into a single summary referencing the recovery task ids it covers, with full detail left to git history and the artifact store rather than duplicated in the document.

This applies because a feature's own state documents are read as context on every future doctor-recovery planning and execution call; unbounded narration growth is unbounded, unbudgeted context growth on every subsequent call for as long as the feature keeps needing them.

This is an instance of ADR-0034.

## ADR-0038

### Title

Ensemble-Gated Systemic Blocker Filing

### Status

Accepted

### Decision

The choice between planning a bounded doctor recovery and filing a new systemic fix shall not be trusted from a single AI vote. It shall be cross-checked by the same deterministic ensemble mechanism as ADR-0036: independent, fresh-context votes on the choice itself, requiring unanimous agreement before either outcome is acted on, with disagreement escalating to a safe stop rather than trusting any single vote.

The ensemble shall vote only on the choice itself, never on the free-text content of a systemic fix's own payload (title, evidence summary, scope note). Voting on free text would relocate the prose-guessing problem ADR-0031 exists to prevent, one level up, since independently-generated prose has no meaningful notion of "agreement" to check. Once the choice is confirmed by unanimous vote, a single further call may generate that payload; a response that contradicts the confirmed choice is treated as untrustworthy, never silently accepted over the ensemble's consensus.

This is an instance of ADR-0034 and a second instance of ADR-0036.

## ADR-0039

### Title

Verified Reviewer Relay of Quality Gate Facts

### Status

Accepted

### Decision

An `approved` review shall not be trusted when the reviewer's own relay of the quality-gate results it was handed contradicts the deterministic result the orchestrator already computed. The orchestrator shall compare the reviewer's reported `quality_gate_check` against ground truth and, on any mismatch, treat the review as `blocked` rather than landing the diff.

This is a deterministic check, not an ensemble: by the point a task reaches review, quality gates have already run and none failed, so ground truth has exactly one legitimate value at this call site. Any deviation the reviewer reports is proof of a relay error, not an alternate reading of ambiguous data, so no second AI opinion is needed to catch it.

This is an instance of ADR-0031 and ADR-0034.

## ADR-0040

### Title

Feature-Lifetime Doctor-Recovery Budget

### Status

Accepted

### Decision

The per-blocker-signature doctor-recovery counter (`doctor_recovery_attempts`, bounded by `max_recovery_iterations`) shall not be the only bound on doctor-recovery cycles. It resets on genuine forward progress by design (ADR-0032), so a feature that keeps hitting new, different blockers over its life can otherwise accumulate an unlimited total.

A separate counter (`doctor_recovery_lifetime_count`) shall track every doctor-recovery cycle a feature accumulates across its entire life and shall never reset. It is bounded by an independent, optional configuration limit (`limits.max_lifetime_recovery_cycles`) that defaults to unbounded when omitted, so an existing project configuration is unaffected until it opts in.

This is an instance of ADR-0034.

## ADR-0041

### Title

Run-Wide AI Call Budget

### Status

Accepted

### Decision

`max_tasks_per_run` shall not be the only bound on how much a `--loop` invocation can spend: it counts only primary task completions, not doctor-recovery, correction, planning, or classification-ensemble calls, so a run could cycle through many such calls without that counter ever noticing.

A run-wide budget on total structured AI calls (`limits.max_ai_calls_per_run`, optional, defaulting to unbounded) shall be checked centrally, once per step, before any feature or fix is even inspected -- reusing the count every call already produces by passing through the single existing choke point (`recordAgentInvocationContext`), rather than adding a new counter or per-call-site plumbing.

This is CompassRose's local, deterministically-checked equivalent of a task budget: the ceiling is declared up front and enforced by the harness, not by any individual call site.

This is an instance of ADR-0034.

## ADR-0042

### Title

Non-Negative Limit Fields Must Preserve An Explicit Zero

### Status

Accepted

### Decision

Every `limits.*` config field is validated as a non-negative integer (`requireNonNegativeInteger`/`optionalNonNegativeInteger` in `src/config/configReader.ts`), which treats `0` as a legitimate, distinct, meaningful value ("disable this entirely") -- not as a proxy for "unset." The runtime read side (`readPositiveInteger`, used by every one of these fields in the orchestrator's constructor) required `value > 0`, silently collapsing an explicitly configured `0` into "unset," which then defaulted to unbounded via `?? Number.POSITIVE_INFINITY` -- the exact inverse of the configured intent, for every `limits.*` field, not only the two (`max_lifetime_recovery_cycles`, `max_ai_calls_per_run`) added by ADR-0040/ADR-0041.

The runtime shall read every `limits.*` field with `readNonNegativeInteger` (accepts `0`), matching the validator's own semantics, so an explicit `0` always means what the config author wrote, never "unbounded."

Separately, the YAML-like config parser (`src/config/configReader.ts`) parses a key written with no inline value and no nested block (e.g. `max_ai_calls_per_run:` with nothing after the colon) to an explicit `null`, not a missing key. `optionalNonNegativeInteger` shall treat that `null` the same as "absent" -- the author's intent ("leave this unset") is identical either way, and a config author should not need to know the parser's internal representation to get the behavior they wrote.

This is an instance of ADR-0034.

## ADR-0043

### Title

Validated Optional Policy Sections Must Not Be Re-Clobbered By Their Raw Parse

### Status

Accepted

### Decision

`validateProjectConfiguration` (`src/config/configReader.ts`) builds a catch-all `extraConfigurationFields` object by copying every key of the raw parsed YAML except the four originally-required top-level sections (`project`, `adapters`, `commands`, `documentation`), intending only to pass through genuinely unrecognized top-level keys untouched. It then merges that object over the fully-validated configuration via `Object.assign(validated, extraConfigurationFields)` -- but every *optional* policy section (`limits`, `quality_gates`, `review_policy`, `development_policy`, `execution`, `roles`, `git_policy`) is also a key of the raw parsed YAML, so its validated, normalized form was being unconditionally overwritten by its own raw, unvalidated parse.

This was invisible for every field checked by the existing test suite, because raw and validated happen to be identical for any well-formed value (e.g. the literal integer `50` parses and validates to the same `50`). It only diverges for a field whose validated form differs from its raw parse -- discovered via ADR-0042's optional-integer fields, where a key with no inline value parses to `null` but validates to `undefined`/omitted.

The exclusion set for `extraConfigurationFields` shall include every key that was already validated into `optionalPolicySections`, not only the four required section names, so a validated section can never be re-overwritten by its own raw parse.

This is an instance of ADR-0034: the pass-through mechanism must declare exactly which keys it is allowed to touch, rather than assuming "the four required sections" was ever the complete set of keys another part of the same function had already claimed.

## ADR-0044

### Title

A Doctor-Recovery-Failure Stop Must Persist The Same Blocker It Diagnoses

### Status

Accepted

### Decision

`stopAfterDoctorRecoveryFailure` builds a fully correct blocker (kind, recoverability, evidence) for its diagnostic artifact directly from the *original* blocker (`doctorRecovery.blocker`) that the recovery was attempting to resolve -- deliberately not re-deriving it from the recovery's own re-entry-gate-failure `reason` text, which describes the recovery attempt's failure, not the original blocker's nature (ADR-0031). The call three lines earlier that *persists* the feature's blocked state (previously `recordBlockedFeature(featureId, reason, taskId)`, with no explicit kind) still went through the unfixed path, regexing that same misleading `reason` text via `classifyBlockerKind` -- so the persisted "Blocked By" section (and everything downstream that reads it, including the next `diagnoseAndAutocorrect` cycle) could see a different, wrong kind and recoverability than the diagnostic artifact sitting right next to it, potentially routing a terminal/human-only blocker back into another automatic doctor-recovery attempt.

The blocker shall be built once, from the original blocker's own known fields, and both persisted and used in the diagnostic artifact -- one source of truth, not two independently-reconstructed guesses that happen to usually agree.

This is an instance of ADR-0031/ADR-0034, and a completion of the same fix class ADR-0031 already applied elsewhere: fixing a diagnostic artifact's classification while leaving the adjacent persisted-state classification on the old, regex-guessing path defeats the purpose of the fix for anything that reads persisted state instead of the artifact.

## ADR-0045

### Title

Reviewer Quality-Gate Relay Trustworthiness Must Not Assume One Specific Status For Zero Gates

### Status

Accepted

### Decision

`verifyReviewerQualityGateRelay` (ADR-0039) computed its expected `quality_gate_check.status` for zero configured quality gates as exactly `skipped`, and downgraded any other status -- including `passed` -- to a distrusted, blocked review. The reviewer contract (`src/contracts/reviewer/output.md`) documents `skipped` for gates explicitly waived by policy, not specifically for "no gates were configured at all"; a reviewer reporting `passed` for zero applicable gates ("nothing failed") is an equally truthful relay of the same ground truth, not a misrelay.

The relay check shall accept either `passed` or `skipped` as trustworthy when zero quality gates ran, and only `passed` when gates ran and none failed -- matching what the contract actually commits the reviewer to, not a stricter reading invented after the fact.

This is an instance of ADR-0034: a deterministic check must be built from what its input's own declared contract actually promises, not from an assumption about phrasing the contract never made.

## ADR-0046

### Title

CompassRose's Own Documentation Lives Isolated From The Target Repository's docs/

### Status

Accepted

### Decision

CompassRose's own operational documents (`CONFIG.md`, `PROJECT_STATE.md`, `ADR.md`, `SAD.md`, `ROADMAP.md`, `DMS.md`, `REFACTOR_PLAN.md`, `templates/`, `features/`, `fixes/`) previously lived scattered directly inside the target repository's own `docs/` folder (`docs/compassrose/CONFIG.md`, `docs/ADR.md`, `docs/features/`, and siblings). Pointing CompassRose at a real, pre-existing project collided with whatever documentation conventions that project already had under its own `docs/` -- the opposite of the bounded-scope law (ADR-0034) applied one level up, at the whole tool's footprint rather than a single operation's.

CompassRose's own documents shall live under one isolated root, `compassrose/`, at the repository root -- sibling to, not nested inside, the target repository's own `docs/` (which is preserved as-is for the target project's own use, per `project.documentation_root`). The root is resolved through one canonical module (`src/config/compassRosePaths.ts`), itself driven by an optional `documentation.compassrose_root` config field (default `'compassrose'`), so no call site re-derives or hardcodes the location independently. `CONFIG.md`'s own path is the one location that can never be config-driven (the bootstrap chicken-and-egg problem: config must be found before it can be read) and stays a single hardcoded constant instead of being duplicated across call sites.

This also settles the fresh-bootstrap-vs-existing-project signal the not-yet-built "Flow 0" (`npm run setup`, SAD.md 5.3's Project Analyzer) needs: the bootstrap config path's existence is exactly that check.

This is an instance of ADR-0034, applied to the tool's own footprint rather than a single bounded operation.
