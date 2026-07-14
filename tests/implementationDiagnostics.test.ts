import { describe, expect, test } from 'vitest';
import {
  buildImplementationDiagnostics,
  buildImplementationErrorMessage,
  classifyImplementation,
  joinOutput,
  outputShowsCommittedReviewableDiff,
  selectReviewableDiffForReview,
  summarizeCommandOutput,
  summarizeText,
  validateTaskDeliverables,
} from '../src/orchestrator/implementationDiagnostics.js';
import type { CommandExecution } from '../src/agents/taskImplementer.js';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';
import type { PlannedTask } from '../src/contracts/planner/plannerContracts.js';

function buildResult(overrides: Partial<CommandExecution> = {}): CommandExecution {
  return {
    ok: true,
    stdout: '',
    stderr: '',
    exitCode: 0,
    signal: null,
    timedOut: false,
    commandInvoked: 'codex exec',
    ...overrides,
  };
}

describe('classifyImplementation', () => {
  test('classifies a clean success with a diff as unknown-free (falls through when notes present and diff present)', () => {
    expect(classifyImplementation(buildResult(), 'did some work', true, 'Status: changes_made')).toBe('unknown');
  });

  test('classifies context-overflow language', () => {
    expect(classifyImplementation(buildResult(), 'the context window is too large', false, null)).toBe('context_overflow');
  });

  test('classifies permission-prompt language', () => {
    expect(classifyImplementation(buildResult(), 'permission denied', false, null)).toBe('permission_prompt');
  });

  test('classifies tool refusal language', () => {
    expect(classifyImplementation(buildResult(), 'I cannot comply with this request', false, null)).toBe('tool_refusal');
  });

  test('classifies provider failure language', () => {
    expect(classifyImplementation(buildResult(), 'upstream returned 503', false, null)).toBe('provider_failure');
  });

  test('classifies missing implementation notes when the command succeeded without notes', () => {
    expect(classifyImplementation(buildResult(), 'did some work', true, null)).toBe('missing_implementation_notes');
  });

  test('classifies model passivity when the command succeeded with notes but produced no diff', () => {
    expect(classifyImplementation(buildResult(), 'looked around', false, 'Status: nothing to do')).toBe('model_passivity');
  });

  test('classifies already_complete when ok, no diff, and notes say already complete', () => {
    expect(classifyImplementation(buildResult(), 'already done', false, 'Status: already_complete\nEvidence: x')).toBe('already_complete');
  });

  test('classifies reviewable_diff_lost when the head moved but the live diff is empty', () => {
    const result = classifyImplementation(
      buildResult(),
      'committed the change',
      false,
      'Status: changes_made',
      'abc123',
      'def456',
      'diff --git a/x b/x',
    );
    expect(result).toBe('reviewable_diff_lost');
  });
});

describe('outputShowsCommittedReviewableDiff', () => {
  test('detects a shell git commit invocation line', () => {
    expect(outputShowsCommittedReviewableDiff('$ git commit -m "done"')).toBe(true);
  });

  test('detects a git commit summary bracket line', () => {
    expect(outputShowsCommittedReviewableDiff('[main 1a2b3c4] fix bug')).toBe(true);
  });

  test('detects an explicit evidence-committed marker', () => {
    expect(outputShowsCommittedReviewableDiff('evidence committed: 1a2b3c4')).toBe(true);
  });

  test('returns false for plain output', () => {
    expect(outputShowsCommittedReviewableDiff('just some regular output')).toBe(false);
  });
});

describe('selectReviewableDiffForReview', () => {
  test('prefers the live diff when non-empty', () => {
    const result = selectReviewableDiffForReview('diff --git a b', {
      diagnostics: { classification: 'unknown' } as never,
      fallback_git_diff: null,
    });
    expect(result).toEqual({ diff: 'diff --git a b', source: 'live' });
  });

  test('falls back to the fallback diff when the live diff is empty and classification is reviewable_diff_lost', () => {
    const result = selectReviewableDiffForReview('', {
      diagnostics: { classification: 'reviewable_diff_lost' } as never,
      fallback_git_diff: 'diff --git fallback',
    });
    expect(result).toEqual({ diff: 'diff --git fallback', source: 'fallback' });
  });

  test('returns none when there is neither a live nor an applicable fallback diff', () => {
    const result = selectReviewableDiffForReview('', {
      diagnostics: { classification: 'unknown' } as never,
      fallback_git_diff: null,
    });
    expect(result).toEqual({ diff: '', source: 'none' });
  });
});

describe('buildImplementationErrorMessage', () => {
  const task: ParsedTaskDocument = {} as never;

  test('reports a non-zero exit code first', () => {
    const message = buildImplementationErrorMessage(
      'F001-T01',
      buildResult({ ok: false, exitCode: 1 }),
      { classification: 'unknown' } as never,
      false,
      null,
    );
    expect(message).toBe('Implementation for F001-T01 failed with exit code 1 (unknown).');
  });

  test('reports missing implementation notes when the command otherwise succeeded', () => {
    const message = buildImplementationErrorMessage('F001-T01', buildResult(), { classification: 'missing_implementation_notes' } as never, true, null);
    expect(message).toBe('Implementation for F001-T01 did not include the required Implementation Notes justification.');
  });

  test('reports a lost reviewable diff', () => {
    const message = buildImplementationErrorMessage(
      'F001-T01',
      buildResult(),
      { classification: 'reviewable_diff_lost' } as never,
      false,
      'Status: changes_made',
    );
    expect(message).toBe('Implementation for F001-T01 lost the live reviewable diff before handoff (reviewable_diff_lost).');
  });

  test('reports no git diff produced', () => {
    const message = buildImplementationErrorMessage(
      'F001-T01',
      buildResult(),
      { classification: 'model_passivity' } as never,
      false,
      'Status: changes_made',
    );
    expect(message).toBe('Implementation for F001-T01 produced no git diff (model_passivity).');
  });

  void task;
});

describe('validateTaskDeliverables', () => {
  function buildTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
    return {
      task_id: 'F001-T01',
      feature_id: '001-widgets',
      title: 't',
      objective: 'o',
      first_executable_step: 's',
      minimum_progress_evidence: [],
      trace: { roadmap_objective: 'x', feature_goal: 'y', state_gap: 'z' },
      context: { summary: '', relevant_paths: [], relevant_modules: [] },
      scope: { allowed_paths: [], forbidden_paths: [] },
      constraints: [],
      development_policy: { mode: 'test_guided' },
      quality_gates: { before_review: [] },
      acceptance_criteria: [],
      expected_deliverables: ['code'],
      ...overrides,
    };
  }

  test('throws when a documentation_first task delivers code or tests', () => {
    const task = buildTask({ development_policy: { mode: 'documentation_first' }, expected_deliverables: ['code'] });
    expect(() => validateTaskDeliverables(task, 'task')).toThrow(/must not deliver code or tests/);
  });

  test('throws when an unblock task delivers documentation', () => {
    const task = buildTask({ expected_deliverables: ['documentation'], development_policy: { mode: 'test_guided' } });
    expect(() => validateTaskDeliverables(task, 'unblock task')).toThrow(/must not deliver documentation/);
  });

  test('throws when code/tests delivery does not use test_guided', () => {
    const task = buildTask({ expected_deliverables: ['code'], development_policy: { mode: 'implementation_first' } });
    expect(() => validateTaskDeliverables(task, 'task')).toThrow(/must use `test_guided`/);
  });

  test('passes for a well-formed test_guided task delivering code', () => {
    const task = buildTask({ expected_deliverables: ['code'], development_policy: { mode: 'test_guided' } });
    expect(() => validateTaskDeliverables(task, 'task')).not.toThrow();
  });
});

describe('joinOutput / summarizeCommandOutput / summarizeText', () => {
  test('joinOutput trims and joins non-empty stdout/stderr with a blank line', () => {
    expect(joinOutput('  out  ', '  err  ')).toBe('out\n\nerr');
    expect(joinOutput('out', '')).toBe('out');
    expect(joinOutput('', '')).toBe('');
  });

  test('summarizeCommandOutput reports "No output." when both streams are empty', () => {
    expect(summarizeCommandOutput('', '')).toBe('No output.');
  });

  test('summarizeCommandOutput clips to the last 12 lines', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const result = summarizeCommandOutput(lines.join('\n'), '');
    expect(result.split('\n')).toHaveLength(12);
    expect(result).toContain('line 19');
    expect(result).not.toContain('line 7\n');
  });

  test('summarizeText truncates text past the limit with an ellipsis', () => {
    expect(summarizeText('abcdef', 3)).toBe('abc...');
    expect(summarizeText('ab', 3)).toBe('ab');
    expect(summarizeText('   ', 3)).toBe('No output.');
  });
});

describe('buildImplementationDiagnostics', () => {
  test('reports evidence lines and delegates classification', () => {
    const task = { taskId: 'F001-T01' } as ParsedTaskDocument;
    const diagnostics = buildImplementationDiagnostics(
      task,
      buildResult(),
      ['src/widgets.ts'],
      'diff --git a b',
      null,
      'did the work',
      'Status: changes_made',
      'abc',
      'abc',
    );

    expect(diagnostics.evidence).toContain('Task: F001-T01');
    expect(diagnostics.evidence).toContain('Changed files: src/widgets.ts');
    expect(diagnostics.first_executable_step_status).toBe('attempted');
    expect(diagnostics.minimum_progress_evidence_status).toBe('present');
  });
});
