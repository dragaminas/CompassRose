import type {
  BlockerKind,
  BlockerRecoverability,
} from '../contracts/runtime/diagnosticAutocorrection.js';
import { DEFAULT_COMPASSROSE_ROOT, isUnderCompassRoseRoot } from '../config/compassRosePaths.js';
import type {
  DevelopmentPolicyMode,
  ExpectedDeliverable,
  TaskContext,
  TaskTrace,
} from '../contracts/task/workItem.js';
import type {
  ParsedTaskDocument,
  ReviewableDiffHandoff,
  StateCorrectionTask,
  StoredTaskArtifact,
} from '../contracts/task/taskContracts.js';
import { uniqueStrings } from '../shared/arrays.js';
import {
  firstExpectedChange,
  optionalSection,
  parseBulletSection,
  parseCodeBlock,
  parseLabeledBulletList,
  parsePreferredStatusValue,
  parseStatusMap,
  requireSection,
  stripTicks,
} from '../markdown/sections.js';

/**
 * Parses a task markdown document (regular task, correction task,
 * task, or state-correction task) into the structured shape the runtime operates on.
 */
export function parseTaskDocument(taskPath: string, markdown: string): ParsedTaskDocument {
  const taskId = stripTicks(requireSection(markdown, 'Task ID').trim());
  const previousTaskId = parseOptionalTaskLineage(markdown);
  const featureId = stripTicks(requireSection(markdown, 'Parent Feature').trim());
  const titleMatch = markdown.match(/^#\s+Task\s+.+?:\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? taskId;
  const objective = requireSection(markdown, 'Goal').trim();
  const firstExecutableStep = optionalSection(markdown, 'First Executable Step')?.trim()
    ?? firstExpectedChange(markdown)
    ?? `Inspect \`${taskPath}\` and start the smallest change inside the allowed scope.`;
  const minimumProgressEvidence = parseBulletSection(optionalSection(markdown, 'Minimum Progress Evidence'))
    ?? ['At least one allowed file changes in the working tree.'];
  const scope = requireSection(markdown, 'Scope');
  const allowedPaths = parseLabeledBulletList(scope, 'Allowed');
  const forbiddenPaths = parseLabeledBulletList(scope, 'Forbidden');
  const constraints = parseBulletSection(optionalSection(markdown, 'Constraints')) ?? [];
  const acceptanceCriteria = parseBulletSection(optionalSection(markdown, 'Acceptance Criteria')) ?? [];
  const qualityGates = parseCodeBlock(optionalSection(markdown, 'Quality Gates to Run')) ?? [];
  const likelyAffectedFiles = parseBulletSection(optionalSection(markdown, 'Files Likely Affected'))?.map(stripTicks) ?? allowedPaths;
  const developmentPolicy = stripTicks(parseBulletSection(optionalSection(markdown, 'Development Policy'))?.[0] ?? 'implementation_first') as DevelopmentPolicyMode;
  const trace = parseTaskTrace(markdown);
  const context = parseTaskContext(markdown, likelyAffectedFiles.map(stripTicks));
  const expectedDeliverables = parseExpectedDeliverables(markdown, allowedPaths.map(stripTicks));
  const stateCorrection = parseStateCorrectionTaskFromDocument(
    taskId,
    featureId,
    title,
    objective,
    firstExecutableStep,
    minimumProgressEvidence,
    trace,
    context,
    allowedPaths.map(stripTicks),
    forbiddenPaths.map(stripTicks),
    constraints,
    developmentPolicy,
    qualityGates,
    acceptanceCriteria,
    expectedDeliverables,
    markdown,
  );
  const reviewableDiffHandoff = inferReviewableDiffHandoff(markdown, constraints, acceptanceCriteria, qualityGates);

  return {
    taskId,
    previousTaskId,
    featureId,
    title,
    objective,
    firstExecutableStep,
    minimumProgressEvidence,
    allowedPaths: allowedPaths.map(stripTicks),
    forbiddenPaths: forbiddenPaths.map(stripTicks),
    constraints,
    acceptanceCriteria,
    qualityGates,
    developmentPolicy,
    likelyAffectedFiles,
    trace,
    context,
    expectedDeliverables,
    stateCorrection,
    reviewableDiffHandoff,
    path: taskPath,
  };
}

export function storedTaskArtifactFromDocument(taskPath: string, markdown: string): StoredTaskArtifact {
  const parsed = parseTaskDocument(taskPath, markdown);

  return {
    task: {
      task_id: parsed.taskId,
      ...(parsed.previousTaskId ? { previous_task_id: parsed.previousTaskId } : {}),
      feature_id: parsed.featureId,
      title: parsed.title,
      objective: parsed.objective,
      first_executable_step: parsed.firstExecutableStep,
      minimum_progress_evidence: parsed.minimumProgressEvidence,
      trace: parsed.trace,
      context: parsed.context,
      scope: {
        allowed_paths: parsed.allowedPaths,
        forbidden_paths: parsed.forbiddenPaths,
      },
      constraints: parsed.constraints,
      development_policy: {
        mode: parsed.developmentPolicy,
      },
      quality_gates: {
        before_review: parsed.qualityGates,
      },
      acceptance_criteria: parsed.acceptanceCriteria,
      expected_deliverables: parsed.expectedDeliverables,
    },
    ...(parsed.stateCorrection ? { state_correction: parsed.stateCorrection } : {}),
  };
}

function parseTaskTrace(markdown: string): TaskTrace {
  const traceSection = optionalSection(markdown, 'Trace');
  const traceMap = traceSection ? parseStatusMap(traceSection) : {};

  return {
    roadmap_objective: traceMap['Roadmap objective'] ?? 'Unknown',
    feature_goal: traceMap['Feature goal'] ?? 'Unknown',
    state_gap: traceMap['State gap'] ?? 'Unknown',
  };
}

function parseTaskContext(markdown: string, relevantPaths: readonly string[]): TaskContext {
  const contextSection = optionalSection(markdown, 'Context');
  const summary = parseBulletSection(contextSection)?.[0]
    ?? contextSection?.trim()
    ?? 'Context was reconstructed from the task document.';

  return {
    summary,
    relevant_paths: relevantPaths,
    relevant_modules: relevantPaths,
  };
}

function parseOptionalTaskLineage(markdown: string): string | null {
  const lineageSection = optionalSection(markdown, 'Task Lineage');
  if (!lineageSection) {
    return null;
  }

  const rawValue = parsePreferredStatusValue(lineageSection, 'previous_task_id');
  if (!rawValue) {
    return null;
  }

  const normalized = stripTicks(rawValue).trim();
  if (normalized.length === 0 || normalized === 'none') {
    return null;
  }

  return normalized;
}

function parseExpectedDeliverables(
  markdown: string,
  allowedPaths: readonly string[],
): readonly ExpectedDeliverable[] {
  const sectionItems = (parseBulletSection(optionalSection(markdown, 'Expected Deliverables')) ?? [])
    .map((item) => stripTicks(item))
    .filter(isExpectedDeliverable);

  if (sectionItems.length > 0) {
    return uniqueStrings(sectionItems) as ExpectedDeliverable[];
  }

  // A task scoped entirely to either the target repository's own docs/ tree or CompassRose's
  // own isolated compassrose/ root is documentation-only -- both are legitimately "docs" for
  // this heuristic's purpose, since a task correcting CompassRose's own tracked state (e.g.
  // compassrose/features/<id>/state.md) is no less documentation-only than one editing the
  // target project's own docs/.
  const documentationOnly = allowedPaths.length > 0
    && allowedPaths.every((item) => item.startsWith('docs/') || isUnderCompassRoseRoot(item, DEFAULT_COMPASSROSE_ROOT));
  return documentationOnly ? ['documentation'] : ['code', 'tests'];
}

function parseStateCorrectionTaskFromDocument(
  taskId: string,
  featureId: string,
  title: string,
  objective: string,
  firstExecutableStep: string,
  minimumProgressEvidence: readonly string[],
  trace: TaskTrace,
  context: TaskContext,
  allowedPaths: readonly string[],
  forbiddenPaths: readonly string[],
  constraints: readonly string[],
  developmentPolicy: DevelopmentPolicyMode,
  qualityGates: readonly string[],
  acceptanceCriteria: readonly string[],
  expectedDeliverables: readonly ExpectedDeliverable[],
  markdown: string,
): StateCorrectionTask | null {
  const stateTargetSection = optionalSection(markdown, 'State Target');
  if (!stateTargetSection) {
    return null;
  }

  const targetMap = parseStatusMap(stateTargetSection);
  const projectStatePath = stripTicks(targetMap.project_state_path ?? 'none');

  return {
    task_id: taskId,
    feature_id: featureId,
    title,
    objective,
    first_executable_step: firstExecutableStep,
    minimum_progress_evidence: minimumProgressEvidence,
    trace,
    state_target: {
      feature_state_path: stripTicks(targetMap.feature_state_path ?? ''),
      project_state_path: projectStatePath === 'none' ? null : projectStatePath,
      contract_reference: stripTicks(targetMap.contract_reference ?? ''),
      detected_issue: targetMap.detected_issue ?? '',
      restored_lifecycle_state: stripTicks(targetMap.restored_lifecycle_state ?? 'none'),
      restored_active_task: stripTicks(targetMap.restored_active_task ?? 'none'),
      restored_active_correction_task: stripTicks(targetMap.restored_active_correction_task ?? 'none'),
    },
    context,
    scope: {
      allowed_paths: allowedPaths,
      forbidden_paths: forbiddenPaths,
    },
    constraints,
    development_policy: {
      mode: developmentPolicy,
    },
    quality_gates: {
      before_review: qualityGates,
    },
    acceptance_criteria: acceptanceCriteria,
    expected_deliverables: expectedDeliverables.includes('documentation') ? ['documentation'] : ['documentation'],
  };
}

function isExpectedDeliverable(value: string): value is ExpectedDeliverable {
  return value === 'code' || value === 'tests' || value === 'documentation';
}

function parseBlockerKindValue(value: string | undefined): BlockerKind {
  switch (value) {
    case 'state_corruption':
    case 'task_interface_gap':
    case 'cli_mismatch':
    case 'environment':
    case 'implementation_failure':
    case 'review_failure':
    case 'unknown':
      return value;
    default:
      return 'unknown';
  }
}

function parseBlockerRecoverabilityValue(value: string | undefined): BlockerRecoverability {
  switch (value) {
    case 'auto':
    case 'agent':
    case 'human':
    case 'terminal':
      return value;
    default:
      return 'agent';
  }
}

export function inferReviewableDiffHandoff(
  markdown: string,
  constraints: readonly string[],
  acceptanceCriteria: readonly string[],
  qualityGates: readonly string[],
): ReviewableDiffHandoff {
  const handoffSection = optionalSection(markdown, 'Reviewable Diff Handoff');
  const handoffMap = handoffSection ? parseStatusMap(handoffSection) : {};
  const legacySubmissionSection = optionalSection(markdown, 'Submission Preservation') ?? '';
  const legacyText = [legacySubmissionSection, ...constraints, ...acceptanceCriteria, ...qualityGates].join('\n');
  const requiredChangedFiles = uniqueStrings([
    ...parseDiffPathEqualityQualityGates(qualityGates),
    ...parseExactChangedFilesFromText(legacyText),
    ...parseCsvPaths(handoffMap.required_changed_files),
  ]);

  return {
    requireLiveDiff: parseBooleanSetting(handoffMap.require_live_diff, true),
    allowGitCommitBeforeHandoff: parseBooleanSetting(handoffMap.allow_git_commit_before_handoff, false),
    requiredChangedFiles,
  };
}

function parseBooleanSetting(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = stripTicks(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === 'yes') {
    return true;
  }

  if (normalized === 'false' || normalized === 'no') {
    return false;
  }

  return fallback;
}

function parseCsvPaths(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => stripTicks(item.trim()))
    .filter((item) => item.length > 0 && item !== 'any' && item !== 'none');
}

function parseDiffPathEqualityQualityGates(qualityGates: readonly string[]): string[] {
  const paths: string[] = [];
  for (const gate of qualityGates) {
    const match = gate.match(/git diff --name-only\)"\s*=\s*"([^"\n]+)"/i);
    if (match?.[1]) {
      paths.push(match[1].trim());
    }
  }

  return uniqueStrings(paths);
}

function parseExactChangedFilesFromText(text: string): string[] {
  const paths: string[] = [];
  const exactChangedFilePattern = /exactly one changed file:\s*`([^`]+)`/gi;
  for (const match of text.matchAll(exactChangedFilePattern)) {
    if (match[1]) {
      paths.push(match[1].trim());
    }
  }

  return uniqueStrings(paths);
}
