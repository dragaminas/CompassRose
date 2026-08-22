import type { RefinementFeedback } from '../contracts/runtime/attempts.js';
import type { StepDecision } from '../contracts/runtime/stepDecision.js';
import { buildConfigPath, buildDmsPath, buildFeaturesReadmePath } from '../config/compassRosePaths.js';

export function inferLikelySources(trigger: string, selectedStep: StepDecision | null, compassRoseRoot: string): string[] {
  const sources = new Set<string>();
  const normalized = trigger.toLowerCase();

  sources.add('src/contracts/runtime/operation-loop.md');

  if (selectedStep?.kind === 'plan_feature') {
    sources.add('src/contracts/planner/feature-planning-prompt.md');
    sources.add(buildFeaturesReadmePath(compassRoseRoot));
  }

  if (selectedStep?.kind === 'plan_task' || selectedStep?.kind === 'plan_subtask') {
    sources.add('src/contracts/planner/task-planning-prompt.md');
    sources.add('src/contracts/planner/output.md');
    sources.add('src/contracts/task/task.md');
  }

  if (selectedStep?.kind === 'diagnose_autocorrect') {
    sources.add('src/contracts/runtime/diagnostic-autocorrection.md');
    sources.add('src/contracts/task/state-correction-task.md');
    sources.add('src/contracts/state/feature-state.md');
  }

  if (selectedStep?.kind === 'implement_task' || selectedStep?.kind === 'implement_subtask' || selectedStep?.kind === 'correct_task') {
    sources.add('src/contracts/implementer/task-execution-prompt.md');
    sources.add('src/contracts/adapters/implementer-adapter.md');
    sources.add('src/contracts/task/task.md');
  }

  if (selectedStep?.kind === 'review_task' || selectedStep?.kind === 'review_subtask') {
    sources.add('src/contracts/reviewer/review-prompt.md');
    sources.add('src/contracts/reviewer/output.md');
    sources.add('src/contracts/task/correction-task.md');
  }

  if (normalized.includes('project configuration') || normalized.includes('configuration paths')) {
    sources.add(buildConfigPath(compassRoseRoot));
    sources.add('src/config/configReader.ts');
  }

  if (normalized.includes('git diff is empty') || normalized.includes('produced no git diff') || normalized.includes('reviewable diff')) {
    sources.add('src/contracts/adapters/implementer-adapter.md');
    sources.add('src/contracts/reviewer/input.md');
    sources.add('src/contracts/implementer/task-execution-prompt.md');
    sources.add('src/contracts/task/task.md');
  }

  if (normalized.includes('implementation notes') || normalized.includes('justification')) {
    sources.add('src/contracts/implementer/task-execution-prompt.md');
    sources.add('src/contracts/adapters/implementer-adapter.md');
    sources.add('src/contracts/reviewer/input.md');
    sources.add('src/contracts/reviewer/review-prompt.md');
    sources.add('src/contracts/runtime/operation-loop.md');
    sources.add('src/contracts/state/feature-state.md');
  }

  if (normalized.includes('blocked') || normalized.includes('blocker')) {
    sources.add('src/contracts/runtime/diagnostic-autocorrection.md');
    sources.add('src/contracts/runtime/operation-loop.md');
  }

  if (normalized.includes('implementation failed') || normalized.includes('implementation_failure')) {
    sources.add('src/contracts/state/feature-state.md');
    sources.add('src/contracts/runtime/operation-loop.md');
  }

  if (normalized.includes('section "##')) {
    sources.add('src/contracts/state/feature-state.md');
    sources.add(buildFeaturesReadmePath(compassRoseRoot));
  }

  if (normalized.includes('test_guided')) {
    sources.add('src/contracts/planner/output.md');
    sources.add('src/contracts/implementer/task-execution-prompt.md');
    sources.add('src/contracts/reviewer/review-prompt.md');
  }

  if (normalized.includes('quality gates failed')) {
    sources.add('src/contracts/task/task.md');
    sources.add('src/contracts/reviewer/input.md');
  }

  if (normalized.includes('task document')) {
    sources.add(buildDmsPath(compassRoseRoot));
    sources.add('src/contracts/task/task.md');
  }

  return [...sources];
}

export function buildObservations(trigger: string, selectedStep: StepDecision | null): string[] {
  const observations = [
    `Trigger: ${trigger}`,
    selectedStep
      ? `Selected step: ${selectedStep.kind}${selectedStep.task_id ? ` (${selectedStep.task_id})` : selectedStep.feature_id ? ` (${selectedStep.feature_id})` : ''}`
      : 'Selected step: unknown',
  ];

  if (selectedStep?.reason) {
    observations.push(`Selector reason: ${selectedStep.reason}`);
  }

  if (/git diff is empty|produced no git diff|reviewable diff/i.test(trigger)) {
    observations.push('The prototype reached a point where repository evidence was missing or not reviewable.');
  }

  if (/section "##/i.test(trigger)) {
    observations.push('A Markdown contract was not structured the way the prototype expected.');
  }

  if (/test_guided/i.test(trigger)) {
    observations.push('The execution contract and the planned task diverged on TDD policy.');
  }

  if (/blocked|blocker/i.test(trigger)) {
    observations.push('The runtime needs a blocker-specific recovery path instead of a generic stop.');
  }

  if (/implementation failed|implementation_failure/i.test(trigger)) {
    observations.push('The runtime should diagnose the failed implementation state rather than stopping on it.');
  }

  if (/implementation notes|justification/i.test(trigger)) {
    observations.push('The implementer must justify the attempt outcome before the reviewer can trust the artifact.');
  }

  return observations;
}

export function buildNextQuestions(trigger: string, selectedStep: StepDecision | null): string[] {
  const questions = [
    'Is the failure caused by a weak contract, stale documentation, or an implementation bug in the prototype?',
    'Should this condition be represented more explicitly in project or feature state?',
  ];

  if (/section "##/i.test(trigger)) {
    questions.push('Should this Markdown document gain a stricter canonical template or a machine-readable projection?');
  }

  if (/git diff is empty|produced no git diff|reviewable diff/i.test(trigger)) {
    questions.push('Should the implementer adapter preserve stronger minimum-progress evidence before review is attempted?');
    questions.push('Should the task contract make live-diff handoff and no-commit expectations explicit?');
  }

  if (/quality gates failed/i.test(trigger)) {
    questions.push('Should quality-gate failure transition rules be documented more explicitly in the runtime contract?');
  }

  if (/blocked|blocker/i.test(trigger)) {
    questions.push('Did the recorded blocker carry enough evidence for a person to recognize it without reopening the task?');
  }

  if (/implementation failed|implementation_failure/i.test(trigger)) {
    questions.push('Did the diagnosis recover a trustworthy active task anchor, or did it lose the target the failure happened on?');
  }

  if (/implementation notes|justification/i.test(trigger)) {
    questions.push('Should missing Implementation Notes fail the implementation attempt immediately so the reviewer never sees an ambiguous artifact?');
  }

  if (selectedStep?.kind === 'plan_task') {
    questions.push('Did the planner receive enough repository-local context to produce a bounded task?');
  }

  if (selectedStep?.kind === 'plan_subtask') {
    questions.push('Did the runtime have enough context to move the active task into a concrete subtask execution pass?');
  }

  if (selectedStep?.kind === 'review_task' || selectedStep?.kind === 'review_subtask') {
    questions.push('Did the reviewer receive enough structured implementation evidence beyond the raw diff?');
  }

  if (selectedStep?.kind === 'diagnose_autocorrect') {
    questions.push('Did the diagnostic/autocorrection step choose the smallest safe recovery path instead of falling back to a generic stop?');
    questions.push('If the blocker came from a weak interface, was that hardening captured for the recovery conversation or the diagnostic stop?');
  }

  return questions;
}

export function renderRefinementFeedback(feedback: RefinementFeedback): string {
  return [
    `# Refinement Feedback: ${feedback.run_id}`,
    '',
    '## Trigger',
    feedback.trigger,
    '',
    '## Selected Step',
    feedback.selected_step
      ? `- kind: ${feedback.selected_step.kind}
- feature_id: ${feedback.selected_step.feature_id ?? 'null'}
- task_id: ${feedback.selected_step.task_id ?? 'null'}
- correction_task_id: ${feedback.selected_step.correction_task_id ?? 'null'}
- reason: ${feedback.selected_step.reason}`
      : 'No step was selected before the run stopped.',
    '',
    '## Likely Sources To Revisit',
    ...feedback.likely_sources.map((item) => `- \`${item}\``),
    '',
    '## Observations',
    ...feedback.observations.map((item) => `- ${item}`),
    '',
    '## Next Questions',
    ...feedback.next_questions.map((item) => `- ${item}`),
    '',
  ].join('\n');
}
