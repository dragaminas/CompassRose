import type { ImplementationAttempt, QualityGateResult } from '../contracts/runtime/attempts.js';
import type { TaskInterfaceAnalysis } from '../contracts/runtime/taskInterfaceAnalysis.js';
import type { ParsedTaskDocument } from '../contracts/task/taskContracts.js';
import type { ReviewerOutput } from '../contracts/reviewer/reviewerContracts.js';

export function renderTaskInterfaceAnalysisMarkdown(
  analysis: TaskInterfaceAnalysis,
  task: ParsedTaskDocument,
  review: ReviewerOutput,
  implementation: ImplementationAttempt,
  qualityResults: readonly QualityGateResult[],
): string {
  return [
    `# Task Interface Analysis: ${analysis.task_id}`,
    '',
    '## Review Status',
    review.status,
    '',
    '## Summary',
    analysis.summary,
    '',
    '## Recommended Action',
    `- ${analysis.recommended_action}`,
    `- perfectible: ${analysis.perfectible ? 'yes' : 'no'}`,
    '',
    '## Implementer Limitations',
    ...(analysis.implementer_limitations.length > 0
      ? analysis.implementer_limitations.map((item) => `- ${item}`)
      : ['- None identified.']),
    '',
    '## Task Interface Adjustments',
    `- first_executable_step: ${analysis.task_interface_adjustments.first_executable_step ?? 'no change'}`,
    ...(analysis.task_interface_adjustments.minimum_progress_evidence.length > 0
      ? analysis.task_interface_adjustments.minimum_progress_evidence.map((item) => `- minimum_progress_evidence: ${item}`)
      : ['- minimum_progress_evidence: no change']),
    ...(analysis.task_interface_adjustments.context_additions.length > 0
      ? analysis.task_interface_adjustments.context_additions.map((item) => `- context_addition: ${item}`)
      : ['- context_addition: no change']),
    ...(analysis.task_interface_adjustments.scope_adjustments.length > 0
      ? analysis.task_interface_adjustments.scope_adjustments.map((item) => `- scope_adjustment: ${item}`)
      : ['- scope_adjustment: no change']),
    ...(analysis.task_interface_adjustments.acceptance_criteria_adjustments.length > 0
      ? analysis.task_interface_adjustments.acceptance_criteria_adjustments.map((item) => `- acceptance_criteria_adjustment: ${item}`)
      : ['- acceptance_criteria_adjustment: no change']),
    ...(analysis.task_interface_adjustments.quality_gate_adjustments.length > 0
      ? analysis.task_interface_adjustments.quality_gate_adjustments.map((item) => `- quality_gate_adjustment: ${item}`)
      : ['- quality_gate_adjustment: no change']),
    '',
    '## Documentation Notes',
    ...(analysis.notes_for_documentation.length > 0
      ? analysis.notes_for_documentation.map((item) => `- ${item}`)
      : ['- None.']),
    '',
    '## Review Findings Snapshot',
    ...(review.findings.length > 0
      ? review.findings.map((item) => `- [${item.severity}] ${item.message}`)
      : ['- No structured findings recorded.']),
    '',
    '## Implementation Diagnostics Snapshot',
    `- classification: ${implementation.diagnostics.classification}`,
    `- first_executable_step_status: ${implementation.diagnostics.first_executable_step_status}`,
    `- minimum_progress_evidence_status: ${implementation.diagnostics.minimum_progress_evidence_status}`,
    '',
    '## Quality Gates Snapshot',
    ...(qualityResults.length > 0
      ? qualityResults.map((item) => `- ${item.command}: ${item.status}`)
      : ['- No quality gates recorded.']),
    '',
    '## Current Task Baseline',
    `- first_executable_step: ${task.firstExecutableStep}`,
    ...task.minimumProgressEvidence.map((item) => `- minimum_progress_evidence: ${item}`),
    '',
  ].join('\n');
}
