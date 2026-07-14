import type { CommandExecution } from '../agents/taskImplementer.js';
import type {
  DiagnosticClassification,
  ImplementationAttempt,
  ImplementationDiagnostics,
} from '../contracts/runtime/attempts.js';
import type { ParsedTaskDocument } from '../contracts/task/taskContracts.js';
import type { PlannedTask } from '../contracts/planner/plannerContracts.js';
import { implementationNotesIndicatesAlreadyComplete } from '../implementer/implementationNotes.js';

export function joinOutput(stdout: string, stderr: string): string {
  return [stdout.trim(), stderr.trim()].filter((value) => value.length > 0).join('\n\n');
}

export function summarizeCommandOutput(stdout: string, stderr: string): string {
  const combined = joinOutput(stdout, stderr).trim();
  if (combined.length === 0) {
    return 'No output.';
  }

  const lines = combined.split('\n');
  const clipped = lines.slice(-12).join('\n');
  return clipped.length > 1200 ? `${clipped.slice(0, 1200)}...` : clipped;
}

export function summarizeText(text: string, limit: number): string {
  if (text.trim().length === 0) {
    return 'No output.';
  }

  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function outputShowsCommittedReviewableDiff(rawOutput: string): boolean {
  return /^\$ .*git\s+.*commit/m.test(rawOutput)
    || /^\[[^\]]+\s+[0-9a-f]{7,}\]/m.test(rawOutput)
    || /evidence committed:\s*[0-9a-f]{7,}/i.test(rawOutput);
}

export function classifyImplementation(
  commandResult: CommandExecution,
  rawOutput: string,
  hasDiff: boolean,
  implementationNotes: string | null,
  headBefore: string | null = null,
  headAfter: string | null = null,
  fallbackDiff: string | null = null,
): DiagnosticClassification {
  const normalized = rawOutput.toLowerCase();
  const headChanged = Boolean(headBefore && headAfter && headBefore !== headAfter);
  const hasFallbackDiff = Boolean(fallbackDiff && fallbackDiff.trim().length > 0);
  const alreadyComplete = implementationNotesIndicatesAlreadyComplete(implementationNotes);

  if (!hasDiff && commandResult.ok && ((headChanged && hasFallbackDiff) || outputShowsCommittedReviewableDiff(rawOutput))) {
    return 'reviewable_diff_lost';
  }

  if (commandResult.ok && !hasDiff && alreadyComplete) {
    return 'already_complete';
  }

  if (/context|token|too (large|long)|window/i.test(normalized)) {
    return 'context_overflow';
  }

  if (/permission|approval|allow access|not permitted|denied/i.test(normalized)) {
    return 'permission_prompt';
  }

  if (/refus|cannot comply|policy/i.test(normalized)) {
    return 'tool_refusal';
  }

  if (/provider|endpoint|network|connection|rate limit|429|500|502|503|504|unavailable/i.test(normalized)) {
    return 'provider_failure';
  }

  if (commandResult.ok && !implementationNotes) {
    return 'missing_implementation_notes';
  }

  if (!hasDiff && commandResult.ok) {
    return 'model_passivity';
  }

  if (/tty|interactive|terminal ui|render/i.test(normalized)) {
    return 'ui_cli_behavior';
  }

  return 'unknown';
}

export function selectReviewableDiffForReview(
  liveDiff: string,
  implementation: Pick<ImplementationAttempt, 'diagnostics' | 'fallback_git_diff'>,
): { diff: string; source: 'live' | 'fallback' | 'none' } {
  if (liveDiff.trim().length > 0) {
    return { diff: liveDiff, source: 'live' };
  }

  if (implementation.diagnostics.classification === 'reviewable_diff_lost' && implementation.fallback_git_diff) {
    return { diff: implementation.fallback_git_diff, source: 'fallback' };
  }

  return { diff: '', source: 'none' };
}

export function buildImplementationDiagnostics(
  task: ParsedTaskDocument,
  commandResult: CommandExecution,
  changedFiles: readonly string[],
  diff: string,
  fallbackDiff: string | null,
  rawOutput: string,
  implementationNotes: string | null,
  headBefore: string | null,
  headAfter: string | null,
): ImplementationDiagnostics {
  const hasDiff = diff.trim().length > 0;
  const headChanged = Boolean(headBefore && headAfter && headBefore !== headAfter);
  const alreadyComplete = implementationNotesIndicatesAlreadyComplete(implementationNotes);
  const evidence = [
    `Task: ${task.taskId}`,
    `Changed files: ${changedFiles.length > 0 ? changedFiles.join(', ') : 'none'}`,
    `Fallback diff: ${fallbackDiff && fallbackDiff.trim().length > 0 ? 'present' : 'absent'}`,
    `Implementation notes: ${implementationNotes ? 'present' : 'absent'}`,
    `Implementation completion signal: ${alreadyComplete ? 'already_complete' : 'not_detected'}`,
    `Exit code: ${commandResult.exitCode ?? 'null'}`,
    `Signal: ${commandResult.signal ?? 'null'}`,
    `Head changed during attempt: ${headChanged ? `yes (${headBefore} -> ${headAfter})` : 'no'}`,
    `Output tail: ${summarizeText(rawOutput, 400)}`,
  ];

  return {
    classification: classifyImplementation(commandResult, rawOutput, hasDiff, implementationNotes, headBefore, headAfter, fallbackDiff),
    evidence,
    first_executable_step_status: hasDiff || rawOutput.trim().length > 0 ? 'attempted' : 'unknown',
    minimum_progress_evidence_status: hasDiff || alreadyComplete ? 'present' : 'absent',
    exit_code: commandResult.exitCode,
    signal: commandResult.signal,
    timed_out: commandResult.timedOut,
    command_invoked: commandResult.commandInvoked,
  };
}

export function buildImplementationErrorMessage(
  taskId: string,
  commandResult: CommandExecution,
  diagnostics: ImplementationDiagnostics,
  hasDiff: boolean,
  implementationNotes: string | null,
): string {
  if (!commandResult.ok && commandResult.exitCode !== null) {
    return `Implementation for ${taskId} failed with exit code ${commandResult.exitCode} (${diagnostics.classification}).`;
  }

  if (!implementationNotes) {
    return `Implementation for ${taskId} did not include the required Implementation Notes justification.`;
  }

  if (diagnostics.classification === 'reviewable_diff_lost') {
    return `Implementation for ${taskId} lost the live reviewable diff before handoff (reviewable_diff_lost).`;
  }

  if (!hasDiff) {
    return `Implementation for ${taskId} produced no git diff (${diagnostics.classification}).`;
  }

  if (diagnostics.minimum_progress_evidence_status === 'absent') {
    return `Implementation for ${taskId} did not produce minimum progress evidence.`;
  }

  return `Implementation for ${taskId} failed (${diagnostics.classification}).`;
}

export function validateTaskDeliverables(task: PlannedTask, taskLabel: string): void {
  const deliversExecutableWork = task.expected_deliverables.some((deliverable) => deliverable === 'code' || deliverable === 'tests');
  const deliversDocumentation = task.expected_deliverables.includes('documentation');

  if (task.development_policy.mode === 'documentation_first' && deliversExecutableWork) {
    throw new Error(
      `Planned ${taskLabel} ${task.task_id} must not deliver code or tests when it uses \`documentation_first\`.`,
    );
  }

  if (taskLabel === 'unblock task' && deliversDocumentation) {
    throw new Error(`Planned unblock task ${task.task_id} must not deliver documentation.`);
  }

  if (taskLabel === 'unblock task' && task.development_policy.mode !== 'test_guided') {
    throw new Error(`Planned unblock task ${task.task_id} must use \`test_guided\`.`);
  }

  if (deliversExecutableWork && task.development_policy.mode !== 'test_guided') {
    throw new Error(`Planned ${taskLabel} ${task.task_id} must use \`test_guided\` when it delivers code or tests.`);
  }
}
