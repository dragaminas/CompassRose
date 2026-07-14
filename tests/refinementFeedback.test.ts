import { describe, expect, test } from 'vitest';
import {
  buildNextQuestions,
  buildObservations,
  inferLikelySources,
  renderRefinementFeedback,
} from '../src/orchestrator/refinementFeedback.js';
import type { RefinementFeedback } from '../src/contracts/runtime/attempts.js';

describe('inferLikelySources', () => {
  test('always includes the operation-loop contract', () => {
    expect(inferLikelySources('anything', null)).toContain('src/contracts/runtime/operation-loop.md');
  });

  test('adds planner sources for a plan_task step', () => {
    const sources = inferLikelySources('x', { kind: 'plan_task', feature_id: '001', task_id: null, correction_task_id: null, reason: 'r' });
    expect(sources).toContain('src/contracts/planner/task-planning-prompt.md');
  });

  test('adds git-diff related sources when the trigger mentions a lost reviewable diff', () => {
    const sources = inferLikelySources('produced no git diff', null);
    expect(sources).toContain('src/contracts/implementer/task-execution-prompt.md');
    expect(sources).toContain('src/contracts/reviewer/input.md');
  });

  test('deduplicates sources added by multiple matching rules', () => {
    const sources = inferLikelySources('produced no git diff and implementation notes missing', null);
    expect(sources.filter((s) => s === 'src/contracts/implementer/task-execution-prompt.md')).toHaveLength(1);
  });
});

describe('buildObservations', () => {
  test('always states the trigger and selected step', () => {
    const observations = buildObservations('some trigger', null);
    expect(observations[0]).toBe('Trigger: some trigger');
    expect(observations[1]).toBe('Selected step: unknown');
  });

  test('includes the selector reason when present', () => {
    const observations = buildObservations('x', { kind: 'plan_task', feature_id: '001', task_id: null, correction_task_id: null, reason: 'because' });
    expect(observations).toContain('Selector reason: because');
  });

  test('adds a blocker-specific observation when the trigger mentions a blocker', () => {
    const observations = buildObservations('the feature is blocked', null);
    expect(observations).toContain('The runtime needs a blocker-specific recovery path instead of a generic stop.');
  });
});

describe('buildNextQuestions', () => {
  test('always includes the two baseline questions', () => {
    const questions = buildNextQuestions('x', null);
    expect(questions[0]).toMatch(/weak contract/);
    expect(questions[1]).toMatch(/project or feature state/);
  });

  test('adds a review-specific question for a review step', () => {
    const questions = buildNextQuestions('x', { kind: 'review_task', feature_id: '001', task_id: 'F001-T01', correction_task_id: null, reason: 'r' });
    expect(questions).toContain('Did the reviewer receive enough structured implementation evidence beyond the raw diff?');
  });
});

describe('renderRefinementFeedback', () => {
  test('renders all sections, including a null selected step', () => {
    const feedback: RefinementFeedback = {
      run_id: 'run-1',
      trigger: 'quality gates failed',
      selected_step: null,
      likely_sources: ['src/contracts/task/task.md'],
      observations: ['obs 1'],
      next_questions: ['question 1'],
    };

    const markdown = renderRefinementFeedback(feedback);
    expect(markdown).toContain('# Refinement Feedback: run-1');
    expect(markdown).toContain('No step was selected before the run stopped.');
    expect(markdown).toContain('- `src/contracts/task/task.md`');
    expect(markdown).toContain('- obs 1');
    expect(markdown).toContain('- question 1');
  });

  test('renders the selected step details when present', () => {
    const feedback: RefinementFeedback = {
      run_id: 'run-1',
      trigger: 'x',
      selected_step: { kind: 'plan_task', feature_id: '001', task_id: null, correction_task_id: null, reason: 'because' },
      likely_sources: [],
      observations: [],
      next_questions: [],
    };

    const markdown = renderRefinementFeedback(feedback);
    expect(markdown).toContain('- kind: plan_task');
    expect(markdown).toContain('- reason: because');
  });
});
