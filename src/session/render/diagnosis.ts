/**
 * How a recovery diagnosis reads in the terminal (026-conversational-doctor-recovery).
 *
 * The shape carries the design: each hypothesis states what might be wrong, the evidence in the
 * repository that supports it, and — set apart — the one question the human can answer that the
 * repository cannot. A reader should be able to see at a glance which parts the machine worked out
 * and which part is being asked of them.
 */
import { RECOVERY_EXIT_LABELS, type RecoveryDiagnosis, type RecoveryExit } from '../../contracts/runtime/recoveryDiagnosis.js';

export function renderDiagnosis(diagnosis: RecoveryDiagnosis): string[] {
  const lines: string[] = ['', `  ${diagnosis.hypotheses.length} things could be going on:`, ''];

  diagnosis.hypotheses.forEach((hypothesis, index) => {
    lines.push(`  ${index + 1}. ${hypothesis.summary}`);
    for (const evidence of hypothesis.evidence) {
      lines.push(`     · ${evidence}`);
    }
    lines.push(`     → ${hypothesis.discriminating_question}`);
    lines.push('');
  });

  return lines;
}

export function renderExitMenu(exits: readonly RecoveryExit[]): string[] {
  return [
    '  What do you want to do?',
    '',
    ...exits.map((exit, index) => `    ${index + 1}. ${RECOVERY_EXIT_LABELS[exit]}`),
    '',
  ];
}

export function renderInvalidationWarning(itemId: string, invalidated: readonly string[]): string[] {
  if (invalidated.length === 0) {
    return [
      '',
      `  Correcting ${itemId}'s specification. No planned work is outstanding, so nothing is superseded.`,
      '',
    ];
  }

  return [
    '',
    `  Correcting ${itemId}'s specification supersedes planned work:`,
    ...invalidated.map((item) => `    - ${item}`),
    '',
    '  Nothing is deleted from git; the history of what was tried is kept. But this work will not',
    '  be resumed, and the feature goes back to being specified with you from its corrected form.',
    '',
  ];
}
