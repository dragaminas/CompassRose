import type { PlannedTask } from '../contracts/planner/plannerContracts.js';
import type {
  CorrectionTask,
  DoctorRecoveryTaskMetadata,
  StateCorrectionTask,
  UnblockTaskMetadata,
} from '../contracts/task/taskContracts.js';
import { humanCorrectionNumber, humanTaskNumber } from '../task/taskId.js';

export function bulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

export function renderTaskMarkdown(task: PlannedTask): string {
  const lineageSection = task.previous_task_id
    ? [
        '## Task Lineage',
        '',
        `- previous_task_id: \`${task.previous_task_id}\``,
        '',
      ]
    : [];

  return [
    `# Task ${humanTaskNumber(task.task_id)}: ${task.title}`,
    '',
    '## Task ID',
    `\`${task.task_id}\``,
    '',
    ...lineageSection,
    '## Parent Feature',
    `\`${task.feature_id}\``,
    '',
    '## Goal',
    task.objective,
    '',
    '## First Executable Step',
    task.first_executable_step,
    '',
    '## Minimum Progress Evidence',
    ...task.minimum_progress_evidence.map((item) => `- ${item}`),
    '',
    '## Trace',
    `- Roadmap objective: ${task.trace.roadmap_objective}`,
    `- Feature goal: ${task.trace.feature_goal}`,
    `- State gap: ${task.trace.state_gap}`,
    '',
    '## Context',
    `- ${task.context.summary}`,
    '',
    '## Scope',
    'Allowed:',
    ...task.scope.allowed_paths.map((item) => `- \`${item}\``),
    '',
    'Forbidden:',
    ...task.scope.forbidden_paths.map((item) => `- \`${item}\``),
    '',
    '## Constraints',
    ...task.constraints.map((item) => `- ${item}`),
    '',
    '## Development Policy',
    `- \`${task.development_policy.mode}\``,
    '',
    '## Acceptance Criteria',
    ...task.acceptance_criteria.map((item) => `- ${item}`),
    '',
    '## Files Likely Affected',
    ...task.context.relevant_paths.map((item) => `- \`${item}\``),
    '',
    '## Quality Gates to Run',
    '```bash',
    ...task.quality_gates.before_review,
    '```',
    '',
    '## Expected Deliverables',
    ...task.expected_deliverables.map((item) => `- \`${item}\``),
    '',
  ].join('\n');
}

export function renderCorrectionTaskMarkdown(correction: CorrectionTask): string {
  return [
    `# Task ${humanCorrectionNumber(correction.correction_task_id)}: ${correction.title}`,
    '',
    '## Task ID',
    `\`${correction.correction_task_id}\``,
    '',
    '## Parent Task',
    `\`${correction.parent_task_id}\``,
    '',
    '## Parent Feature',
    `\`${correction.feature_id}\``,
    '',
    '## Goal',
    correction.objective,
    '',
    '## First Executable Step',
    correction.first_executable_step,
    '',
    '## Minimum Progress Evidence',
    ...correction.minimum_progress_evidence.map((item) => `- ${item}`),
    '',
    '## Review Findings',
    ...correction.review_findings.map((item) => `- ${item}`),
    '',
    '## Scope',
    'Allowed:',
    ...correction.scope.allowed_paths.map((item) => `- \`${item}\``),
    '',
    'Forbidden:',
    ...correction.scope.forbidden_paths.map((item) => `- \`${item}\``),
    '',
    '## Constraints',
    ...correction.constraints.map((item) => `- ${item}`),
    '',
    '## Acceptance Criteria',
    ...correction.acceptance_criteria.map((item) => `- ${item}`),
    '',
    '## Quality Gates to Run',
    '```bash',
    ...correction.quality_gates.before_review,
    '```',
    '',
  ].join('\n');
}

export function correctionTaskToTask(correction: CorrectionTask): PlannedTask {
  return {
    task_id: correction.correction_task_id,
    feature_id: correction.feature_id,
    title: correction.title,
    objective: correction.objective,
    first_executable_step: correction.first_executable_step,
    minimum_progress_evidence: correction.minimum_progress_evidence,
    trace: {
      roadmap_objective: 'Correction',
      feature_goal: `Correction for ${correction.parent_task_id}`,
      state_gap: correction.review_findings.join(' '),
    },
    context: {
      summary: correction.review_findings.join(' '),
      relevant_paths: correction.scope.allowed_paths,
      relevant_modules: correction.scope.allowed_paths,
    },
    scope: correction.scope,
    constraints: correction.constraints,
    development_policy: {
      mode: 'test_guided',
    },
    quality_gates: correction.quality_gates,
    acceptance_criteria: correction.acceptance_criteria,
    expected_deliverables: ['code', 'tests'],
  };
}

export function stateCorrectionTaskToTask(stateCorrection: StateCorrectionTask): PlannedTask {
  return {
    task_id: stateCorrection.task_id,
    feature_id: stateCorrection.feature_id,
    title: stateCorrection.title,
    objective: stateCorrection.objective,
    first_executable_step: stateCorrection.first_executable_step,
    minimum_progress_evidence: stateCorrection.minimum_progress_evidence,
    trace: stateCorrection.trace,
    context: stateCorrection.context,
    scope: stateCorrection.scope,
    constraints: stateCorrection.constraints,
    development_policy: {
      mode: stateCorrection.development_policy.mode,
    },
    quality_gates: stateCorrection.quality_gates,
    acceptance_criteria: stateCorrection.acceptance_criteria,
    expected_deliverables: stateCorrection.expected_deliverables,
  };
}

export function renderStateCorrectionTaskMarkdown(stateCorrection: StateCorrectionTask): string {
  const task = stateCorrectionTaskToTask(stateCorrection);
  return [
    renderTaskMarkdown(task).trimEnd(),
    '',
    '## State Target',
    '',
    `- feature_state_path: \`${stateCorrection.state_target.feature_state_path}\``,
    `- project_state_path: \`${stateCorrection.state_target.project_state_path ?? 'none'}\``,
    `- contract_reference: \`${stateCorrection.state_target.contract_reference}\``,
    `- detected_issue: ${stateCorrection.state_target.detected_issue}`,
    `- restored_lifecycle_state: ${stateCorrection.state_target.restored_lifecycle_state}`,
    `- restored_active_task: \`${stateCorrection.state_target.restored_active_task}\``,
    `- restored_active_correction_task: \`${stateCorrection.state_target.restored_active_correction_task}\``,
    '',
  ].join('\n');
}

export function renderDoctorRecoveryTaskMarkdown(task: PlannedTask, doctorRecovery: DoctorRecoveryTaskMetadata): string {
  return [
    renderTaskMarkdown(task).trimEnd(),
    '',
    '## Doctor Recovery',
    '',
    `- executor_role: ${doctorRecovery.executor_role ?? 'doctor'}`,
    `- review_policy: ${doctorRecovery.review_policy ?? 'no_review_loop'}`,
    '',
    '## Blocker Context',
    '',
    `- kind: ${doctorRecovery.blocker.kind}`,
    `- signature: ${doctorRecovery.blocker.signature}`,
    `- recoverability: ${doctorRecovery.blocker.recoverability}`,
    `- observed_state: ${doctorRecovery.blocker.observed_state}`,
    ...(doctorRecovery.blocker.evidence.length > 0 ? doctorRecovery.blocker.evidence.map((item) => `- evidence: ${item}`) : ['- evidence: none']),
    '',
    '## Restoration Target',
    '',
    `- lifecycle_state: ${doctorRecovery.restoration_target.lifecycle_state}`,
    `- active_task: \`${doctorRecovery.restoration_target.active_task}\``,
    `- active_correction_task: \`${doctorRecovery.restoration_target.active_correction_task}\``,
    `- active_unblock_task: \`${doctorRecovery.restoration_target.active_unblock_task}\``,
    '',
  ].join('\n');
}

export function renderUnblockTaskMarkdown(task: PlannedTask, unblock: UnblockTaskMetadata): string {
  return renderDoctorRecoveryTaskMarkdown(task, unblock);
}
