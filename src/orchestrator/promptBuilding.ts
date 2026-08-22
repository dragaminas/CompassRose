import type { DoctorRecoveryTaskMetadata, ParsedTaskDocument, StateCorrectionTask } from '../contracts/task/taskContracts.js';
import { renderManifestForPrompt } from './contextManifest.js';
import type { ContextManifest } from './contextManifest.js';

export function buildImplementerPrompt(
  task: ParsedTaskDocument,
  correction: boolean,
  stateCorrection: StateCorrectionTask | null,
  recoveryLessonLines: readonly string[] = [],
  /**
   * 027-bounded-work-item-context: when present, the prompt's `Read only:` block is rendered from
   * the manifest and from nothing else. This function has no authority to include anything the
   * manifest does not name -- which is the property that makes a run reproducible from it.
   */
  manifest: ContextManifest | null = null,
): string {
  const role = stateCorrection ? 'state repair task' : 'subtask';
  const requiredDiffLine = task.reviewableDiffHandoff.requireLiveDiff
    ? (task.reviewableDiffHandoff.requiredChangedFiles.length > 0
        ? `- At handoff, leave the live worktree diff visible and limited to: ${task.reviewableDiffHandoff.requiredChangedFiles.map((item) => `\`${item}\``).join(', ')}.`
        : '- Leave the live worktree diff visible for handoff so CompassRose can capture the reviewable change directly.')
    : '- The task contract allows a non-live-diff handoff, but you still need to preserve the required repository evidence.';
  return [
      'Act as the CompassRose Implementer.',
      '',
      `Execute ${role} \`${task.taskId}\` for feature \`${task.featureId}\`.`,
      '',
    'Read only:',
    ...(manifest
      ? renderManifestForPrompt(manifest)
      : [
          '- `src/contracts/implementer/task-execution-prompt.md`',
          ...(stateCorrection ? ['- `src/contracts/task/state-correction-task.md`'] : []),
          `- \`${task.path}\``,
          ...task.likelyAffectedFiles.map((item) => `- \`${item}\``),
        ]),
    '',
    'Instructions:',
    `- Start with: ${task.firstExecutableStep}`,
    '- Follow TDD when the task changes code: add or update the smallest failing test first, then make it pass.',
    stateCorrection
      ? '- This task repairs repository state; keep the change documentation-only unless the task explicitly allows code edits.'
      : '- Use the declared development policy for the task.',
    ...recoveryLessonLines,
    stateCorrection
      ? '- Preserve the restored task pointer and keep the correction narrowly focused on canonical state.'
      : '- Keep the change minimal and avoid unrelated refactors.',
    '- Stay within the allowed paths listed in the task.',
    '- Do not modify forbidden paths.',
    requiredDiffLine,
    !task.reviewableDiffHandoff.requireLiveDiff || task.reviewableDiffHandoff.allowGitCommitBeforeHandoff
      ? '- The task contract explicitly allows clearing the live diff before handoff if you still preserve the required evidence.'
      : '- Do not run `git commit` or otherwise clear the live worktree diff before handoff; CompassRose captures reviewable evidence from the live diff.',
    '- Continue until there is repository evidence beyond read-only exploration.',
    `- Follow \`${task.developmentPolicy}\`.`,
    '- Keep the change minimal and provider-independent.',
    '- If the task or any recovery-lesson context above references a mechanism, manifest, validator, or field that is not in the contracts you were told to read, report that as a task-interface defect in your notes; do not fabricate placeholder files or evidence to satisfy it.',
    '- End every attempt with a short `## Implementation Notes` section written in your own final reply text, not only inside an edited file; the runtime reads it from what you say, not from a diff.',
    '- If you changed repository files, justify the change briefly and cite the evidence.',
    '- If you made no repository changes because the task already appears satisfied, start the notes with the line `Status: already_complete` and cite the repository evidence that already satisfies it; the runtime relies on that exact line to tell a satisfied task apart from a stalled one.',
    '- If you made no repository changes because you are blocked, explain why and cite the evidence; do not use the `Status: already_complete` line unless the requested behavior genuinely already exists.',
    '- Keep implementation notes brief and separate from product documentation.',
    '- Do not claim approval.',
  ].join('\n');
}

export function buildDoctorRecoveryPrompt(
  task: ParsedTaskDocument,
  doctorRecovery: DoctorRecoveryTaskMetadata,
  recoveryLessonLines: readonly string[] = [],
): string {
  return [
    'Act as the CompassRose Doctor.',
    '',
    `Execute doctor recovery task \`${task.taskId}\` for feature \`${task.featureId}\`.`,
    '',
    'Read only:',
    '- `src/contracts/runtime/doctor-recovery-execution-prompt.md`',
    '- `src/contracts/task/doctor-recovery-task.md`',
    `- \`${task.path}\``,
    ...task.likelyAffectedFiles.map((item) => `- \`${item}\``),
    '',
    'Recovery context:',
    `- blocker_kind: ${doctorRecovery.blocker.kind}`,
    `- blocker_signature: ${doctorRecovery.blocker.signature}`,
    `- restoration_lifecycle_state: ${doctorRecovery.restoration_target.lifecycle_state}`,
    `- restoration_active_task: ${doctorRecovery.restoration_target.active_task}`,
    ...doctorRecovery.blocker.evidence.map((item) => `- blocker_evidence: ${item}`),
    '',
    'Instructions:',
    `- Start with: ${task.firstExecutableStep}`,
    '- Follow `src/contracts/runtime/doctor-recovery-execution-prompt.md`.',
    '- Keep the recovery bounded to the blocker and restoration target.',
    '- Preserve task lineage and blocker evidence.',
    '- You may touch docs, state, src, and tests only when they are required by the recorded recovery scope.',
    '- Do not widen into unrelated backlog work.',
    '- Do not run `git commit`; leave the recovery diff available for the runtime handoff.',
    '- Treat `quality_gates.before_review` as doctor re-entry gates.',
    '- If the task or any recovery-lesson context below references a mechanism, manifest, validator, or field that is not in the contracts you were told to read, report that as a task-interface defect in your notes; do not fabricate placeholder artifacts or files to satisfy it.',
    ...recoveryLessonLines,
    `- Follow \`${task.developmentPolicy}\`.`,
    '- End every attempt with a short `## Implementation Notes` section written in your own final reply text, not only inside an edited file; the runtime reads it from what you say, not from a diff.',
    '- If you changed repository files, justify the recovery briefly and cite the blocker evidence.',
    '- If you made no repository changes because the restoration target already holds, start the notes with the line `Status: already_complete` and cite the evidence; the runtime relies on that exact line to tell an already-satisfied recovery apart from one that could not proceed.',
    '- If you made no repository changes because the recovery could not proceed, explain why; do not use the `Status: already_complete` line unless the restoration target genuinely already holds.',
  ].join('\n');
}
