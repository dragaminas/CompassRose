import { describe, expect, test } from 'vitest';
import { renderTaskInterfaceAnalysisMarkdown } from '../src/orchestrator/taskInterfaceRendering.js';
import type { TaskInterfaceAnalysis } from '../src/contracts/runtime/taskInterfaceAnalysis.js';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { ReviewerOutput } from '../src/contracts/reviewer/reviewerContracts.js';
import type { ImplementationAttempt, QualityGateResult } from '../src/contracts/runtime/attempts.js';

function buildAnalysis(overrides: Partial<TaskInterfaceAnalysis> = {}): TaskInterfaceAnalysis {
  return {
    task_id: 'F001-T01',
    review_status: 'changes_required',
    summary: 'Task interface was too broad.',
    recommended_action: 'tighten_task_interface',
    perfectible: true,
    implementer_limitations: [],
    task_interface_adjustments: {
      first_executable_step: null,
      minimum_progress_evidence: [],
      context_additions: [],
      scope_adjustments: [],
      acceptance_criteria_adjustments: [],
      quality_gate_adjustments: [],
    },
    notes_for_documentation: [],
    ...overrides,
  };
}

describe('renderTaskInterfaceAnalysisMarkdown', () => {
  test('renders "no change"/"None" fallbacks when lists are empty', () => {
    const markdown = renderTaskInterfaceAnalysisMarkdown(
      buildAnalysis(),
      { taskId: 'F001-T01', firstExecutableStep: 'Do the thing.', minimumProgressEvidence: [] } as ParsedTaskDocument,
      {
        task_id: 'F001-T01',
        status: 'changes_required',
        summary: 's',
        acceptance: { criteria: [] },
        findings: [],
        scope_check: { status: 'passed', unrelated_changes: [] },
        quality_gate_check: { status: 'passed', failed_gates: [] },
        correction_task: null,
        project_state_update_hint: null,
      } as ReviewerOutput,
      {
        status: 'success',
        changed_files: [],
        git_diff: '',
        fallback_changed_files: [],
        fallback_git_diff: null,
        raw_output: '',
        implementation_notes: null,
        diagnostics: { classification: 'unknown', first_executable_step_status: 'attempted', minimum_progress_evidence_status: 'present' } as never,
        error: null,
      } as ImplementationAttempt,
      [],
    );

    expect(markdown).toContain('# Task Interface Analysis: F001-T01');
    expect(markdown).toContain('- None identified.');
    expect(markdown).toContain('- minimum_progress_evidence: no change');
    expect(markdown).toContain('- None.');
    expect(markdown).toContain('- No structured findings recorded.');
    expect(markdown).toContain('- No quality gates recorded.');
  });

  test('renders populated lists and quality gate results', () => {
    const analysis = buildAnalysis({
      implementer_limitations: ['gave up early'],
      notes_for_documentation: ['worth documenting'],
      task_interface_adjustments: {
        first_executable_step: 'Be more specific.',
        minimum_progress_evidence: ['add X'],
        context_additions: ['add Y'],
        scope_adjustments: ['narrow to Z'],
        acceptance_criteria_adjustments: ['require W'],
        quality_gate_adjustments: ['add lint'],
      },
    });

    const review: ReviewerOutput = {
      task_id: 'F001-T01',
      status: 'changes_required',
      summary: 's',
      acceptance: { criteria: [] },
      findings: [{ severity: 'error', message: 'missing edge case', path: null, related_acceptance_criterion: null }],
      scope_check: { status: 'passed', unrelated_changes: [] },
      quality_gate_check: { status: 'passed', failed_gates: [] },
      correction_task: null,
      project_state_update_hint: null,
    };

    const qualityResults: QualityGateResult[] = [
      { name: 'tests', command: 'npm test', status: 'passed', output_summary: 'ok' },
    ];

    const markdown = renderTaskInterfaceAnalysisMarkdown(
      analysis,
      { taskId: 'F001-T01', firstExecutableStep: 'Do the thing.', minimumProgressEvidence: ['e1'] } as ParsedTaskDocument,
      review,
      {
        status: 'success',
        changed_files: [],
        git_diff: '',
        fallback_changed_files: [],
        fallback_git_diff: null,
        raw_output: '',
        implementation_notes: null,
        diagnostics: { classification: 'unknown', first_executable_step_status: 'attempted', minimum_progress_evidence_status: 'present' } as never,
        error: null,
      } as ImplementationAttempt,
      qualityResults,
    );

    expect(markdown).toContain('- gave up early');
    expect(markdown).toContain('- first_executable_step: Be more specific.');
    expect(markdown).toContain('- minimum_progress_evidence: add X');
    expect(markdown).toContain('- [error] missing edge case');
    expect(markdown).toContain('- npm test: passed');
    expect(markdown).toContain('- minimum_progress_evidence: e1');
  });
});
