/**
 * The interactive session: CompassRose's primary interface (`023-terminal-session`).
 *
 * One prompt. Free-form input is conversation and changes nothing. A line resolved by
 * `parseCommandLine` is a state transition, and it is the only thing that can be. The model is
 * never asked what the user meant.
 *
 * ## The live view
 *
 * `CompassRoseOrchestrator.run()` is fully synchronous -- every adapter call goes through
 * `spawnSync` -- so a process executing it can neither animate anything nor read a keypress until
 * it finishes. `/run` therefore executes the loop in a child process and watches it from here,
 * where the event loop is free: see `src/session/runSupervisor.ts` for the supervision, and
 * `src/runtime/runChannel.ts` for why the two halves talk through files rather than IPC.
 *
 * What `esc` does is worth stating precisely, because half of it is still bounded by the
 * synchronous loop: one press requests a controlled stop, which the run notices at its next
 * checkpoint, so a long implementer call finishes first. A second press terminates the process
 * tree immediately, agent CLI included, which can leave the worktree mid-write -- which is exactly
 * why it takes a second, deliberate press.
 */
import { createInterface } from 'node:readline';
import { considerDimension, takeDecision } from '../cli/specificationTurn.js';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { getBootstrapConfigPath } from '../config/compassRosePaths.js';
import { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import { parseRunArguments } from '../cli/runOptions.js';
import { runSetupCli } from '../cli/setup.js';
import { createTerminalWriter, type TerminalWriter } from './terminalWriter.js';
import { renderSessionHeader } from './render/header.js';
import { renderCompetencyProfile } from './render/coverage.js';
import { renderDecision, renderProposedDimension } from './render/decision.js';
import {
  COMPETENCY_AXES,
  COMPETENCY_AXIS_LABELS,
  DEFAULT_COMPETENCY_PROFILE,
} from '../contracts/brainstormer/competency.js';
import type {
  CompetencyAxis,
  CompetencyOwner,
  SessionCompetencyProfile,
} from '../contracts/brainstormer/competency.js';
import {
  renderCompletedStep,
  renderRunHeader,
  renderRunningStep,
  renderRunSummary,
  type ProgressStep,
} from './render/progress.js';
import { superviseRun } from './runSupervisor.js';
import { parseCommandLine, type SessionContext, type SessionState } from './commands.js';
import type {
  BrainstormTurnRecord,
  RecordedDecision,
  StructuredDecision,
} from '../contracts/brainstormer/brainstormerContracts.js';

/**
 * Returned by `ask` when stdin has reached EOF.
 *
 * Anything that interprets an answer has to recognize it: taken as a literal reply it looks like
 * an answer nobody gave, which is how a truncated session ended up recording a competency profile
 * the human never declared. The leading control character keeps it unreachable by typing.
 */
const END_OF_INPUT = '\u0000end-of-input';

export interface SessionOptions {
  readonly argv?: readonly string[];
  readonly cwd?: string;
  readonly stderr?: (message: string) => void;
}

/** Maps a runtime step kind to the short verb the progress view shows. */
const STEP_LABEL: Readonly<Record<string, string>> = {
  plan_feature: 'specify',
  plan_task: 'plan',
  plan_fix: 'plan fix',
  plan_fix_task: 'plan',
  plan_subtask: 'plan',
  correct_state: 'repair',
  diagnose_autocorrect: 'diagnose',
  implement_task: 'implement',
  implement_subtask: 'implement',
  review_task: 'review',
  review_subtask: 'review',
  correct_task: 'correct',
  stop: 'stop',
  blocked: 'blocked',
};

function labelFor(kind: string): string {
  return STEP_LABEL[kind] ?? kind;
}

function detailFor(taskId: string | null, summary: string): string {
  const firstLine = summary.split('\n')[0]?.trim() ?? '';
  const clipped = firstLine.length > 58 ? `${firstLine.slice(0, 58)}...` : firstLine;
  return [taskId, clipped].filter((part) => part && part.length > 0).join(' · ');
}

export async function runSessionCli(options: SessionOptions = {}): Promise<number> {
  const stderr = options.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
  const cwd = options.cwd ?? process.cwd();

  const gitRoot = findGitRepositoryRoot(cwd);
  if (gitRoot === null) {
    stderr(`runtime preflight: git repository: ${cwd} is not inside a git repository.`);
    return 1;
  }

  const writer = createTerminalWriter();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // `rl.question` never resolves once stdin reaches EOF -- a piped or redirected session would hang
  // forever instead of ending. Resolving with the sentinel lets the prompt loop treat end-of-input
  // as "the human left", which is what it is.
  let inputClosed = false;
  rl.on('close', () => {
    inputClosed = true;
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolveAnswer) => {
      if (inputClosed) {
        resolveAnswer(END_OF_INPUT);
        return;
      }

      const onClose = (): void => resolveAnswer(END_OF_INPUT);
      rl.once('close', onClose);
      rl.question(question, (answer) => {
        rl.off('close', onClose);
        resolveAnswer(answer);
      });
    });

  try {
    if (!existsSync(getBootstrapConfigPath(gitRoot))) {
      writer.append(['', 'CompassRose is not initialized here yet. Initializing...', '']);
      const setupExitCode = runSetupCli([], {
        cwd: gitRoot,
        stdout: (message) => writer.append([message]),
        stderr,
      });
      if (setupExitCode !== 0) {
        return setupExitCode;
      }
    }

    let runOptions;
    try {
      runOptions = parseRunArguments(options.argv ?? [], gitRoot);
    } catch (error) {
      stderr(error instanceof Error ? error.message : String(error));
      return 1;
    }

    const orchestrator = new CompassRoseOrchestrator({ ...runOptions, cwd: gitRoot, loop: true });

    const state: SessionState = {
      transcript: [],
      segment: [],
      proposedTitle: null,
      focusItemId: null,
      author: resolveAuthor(),
      competency: DEFAULT_COMPETENCY_PROFILE,
      decisions: [],
      exit: false,
    };

    const items = orchestrator.describeWorkItems();
    writer.append(
      renderSessionHeader({
        projectName: orchestrator.projectName(),
        completedIds: items.completed,
        inProgressIds: items.inProgress,
        blockedIds: items.blocked,
        awaitingValidationIds: items.awaitingValidation,
        pendingSpecificationIds: items.pendingSpecification,
      }),
    );

    const context: SessionContext = {
      orchestrator,
      writer,
      ask,
      state,
      runLoop: (target) => runLoop(orchestrator, writer, gitRoot, target),
    };

    // 024-specification-flow: what is already pending comes before any new idea, in a fixed order --
    // items nobody has specified first, then items nobody has validated. This is the stage the old
    // `brainstorm` command could not see at all, so a repository could accumulate unspecified
    // requests that no flow ever surfaced.
    const pendingSpecification = orchestrator.listWorkItemsPendingSpecification();
    const awaitingValidation = orchestrator.listFeaturesAwaitingValidation();

    if (pendingSpecification.length > 0 || awaitingValidation.length > 0) {
      state.competency = await declareCompetencyProfile(ask, writer);
    }

    if (pendingSpecification.length > 0) {
      writer.append([
        `  ${pendingSpecification.length} item${pendingSpecification.length === 1 ? '' : 's'} ${pendingSpecification.length === 1 ? 'has' : 'have'} never been specified with anyone:`,
        ...pendingSpecification.map((item) => `    ${item.id}`),
        '',
        '  The loop will not touch them until they are. Talk one through and /crear when it is settled.',
        '',
      ]);
    }

    if (awaitingValidation.length > 0) {
      writer.append([
        `  ${awaitingValidation.length} awaiting your validation: ${awaitingValidation.map((item) => item.id).join(', ')}`,
        `  /listo <id> to walk through one.`,
        '',
      ]);
    }

    while (!state.exit) {
      const line = await ask('> ');
      if (line === END_OF_INPUT) {
        break;
      }

      const parsed = parseCommandLine(line);

      if (parsed === 'unknown-command') {
        writer.append(['', `  Unknown command. /help lists what this session can do.`, '']);
        continue;
      }

      if (parsed) {
        try {
          await parsed.command.run(context, parsed.args);
        } catch (error) {
          writer.append(['', `  ${error instanceof Error ? error.message : String(error)}`, '']);
        }
        continue;
      }

      if (line.trim().length === 0) {
        continue;
      }

      await converse(orchestrator, writer, ask, state, line.trim());
    }

    return 0;
  } finally {
    writer.dispose();
    rl.close();
  }
}

/**
 * Who is in this session, for attributing coverage decisions in `DIMENSIONS.md`.
 *
 * Attribution only. It says who decided something, never what they were equipped to decide -- that
 * is the competency profile, and it is deliberately never persisted.
 */
function resolveAuthor(): string {
  const fromGit = spawnSync('git', ['config', 'user.name'], { encoding: 'utf8' });
  const name = (fromGit.stdout ?? '').trim();
  return name.length > 0 ? name : 'someone';
}

/**
 * The per-session competency profile (024-specification-flow).
 *
 * Asked once, held in memory, never written anywhere. A second person opening a session in the same
 * repository declares their own and inherits nothing: storing it would quietly impose the first
 * author's competencies on everyone after them.
 */
async function declareCompetencyProfile(
  ask: (question: string) => Promise<string>,
  writer: TerminalWriter,
): Promise<SessionCompetencyProfile> {
  writer.append([
    '  Before we start: which of these do you want to decide, and which should I fill in?',
    '',
  ]);

  const profile: Record<CompetencyAxis, CompetencyOwner> = { ...DEFAULT_COMPETENCY_PROFILE };
  for (const axis of COMPETENCY_AXES) {
    writer.append([`    ${COMPETENCY_AXIS_LABELS[axis]}`]);
    const suggestion = DEFAULT_COMPETENCY_PROFILE[axis] === 'human' ? 'Y/n' : 'y/N';
    const answer = (await ask(`      you decide? (${suggestion}): `)).trim().toLowerCase();
    if (answer.length === 0 || answer === END_OF_INPUT) {
      continue;
    }
    profile[axis] = /^(y|s|si|sí|yes)$/.test(answer) ? 'human' : 'agent';
  }

  writer.append(renderCompetencyProfile(profile));
  return profile;
}

/**
 * A conversation turn. Records the exchange and prints the reply -- and touches nothing else. The
 * model's own `ready_to_draft` signal only changes what is suggested next; `/crear` remains the
 * only thing that can actually draft a feature.
 */
async function converse(
  orchestrator: CompassRoseOrchestrator,
  writer: TerminalWriter,
  ask: (question: string) => Promise<string>,
  state: SessionState,
  message: string,
): Promise<void> {
  const humanTurn: BrainstormTurnRecord = { role: 'human', text: message, recorded_at: new Date().toISOString() };
  state.transcript = [...state.transcript, humanTurn];
  state.segment = [...state.segment, humanTurn];

  const turn = orchestrator.runBrainstormTurn(state.transcript, message, state.competency);
  state.transcript = [
    ...state.transcript,
    { role: 'assistant', text: turn.reply, recorded_at: new Date().toISOString() },
  ];

  writer.append(['', ...turn.reply.split('\n').map((replyLine) => `  ${replyLine}`), '']);

  const print = (lines: readonly string[]): void => writer.append([...lines]);

  if (turn.decision) {
    await takeDecision(state, turn.decision, ask, print);
  }

  if (turn.proposed_dimension) {
    await considerDimension(orchestrator, state, turn.proposed_dimension, ask, print);
  }

  if (turn.ready_to_draft) {
    state.proposedTitle = turn.proposed_title ?? state.proposedTitle;
    writer.append([
      `  Sounds ready (proposed: "${turn.proposed_title ?? 'untitled'}"). /crear turns it into a feature.`,
      '',
    ]);
  }
}

/**
 * The automated loop, drawn as it happens.
 *
 * The loop itself runs in a child process (`superviseRun`), which is what lets this one animate the
 * frame and read keys while a step is in flight. Everything here is display: what the run *does* is
 * decided entirely by the child, exactly as it would be from a non-interactive `compassrose run`.
 */
async function runLoop(
  orchestrator: CompassRoseOrchestrator,
  writer: TerminalWriter,
  repositoryRoot: string,
  target: string | null,
): Promise<void> {
  // Validated here rather than in the child so a bad id is a sentence at the prompt instead of a
  // spawned process that exits 1.
  try {
    orchestrator.setRunTarget(target);
  } catch (error) {
    writer.append(['', `  ${error instanceof Error ? error.message : String(error)}`, '']);
    return;
  } finally {
    orchestrator.setRunTarget(null);
  }

  const stepsByItem = new Map<string, number>();
  const blockedThisRun = new Map<string, string>();
  let completedStepCount = 0;
  let currentItemId: string | null = null;
  let running: { label: string; taskId: string | null; startedAt: number } | null = null;
  let stopNotice: string | null = null;

  const completedBefore = new Set(orchestrator.describeWorkItems().completed);

  writer.append(['', '  esc to stop at the next checkpoint; esc again to stop now.', '']);

  const result = await superviseRun({
    repositoryRoot,
    target,
    events: {
      onStepStart(event) {
        if (event.itemId && event.itemId !== currentItemId) {
          currentItemId = event.itemId;
          writer.append(['', ...renderRunHeader(currentItemId)]);
        }
        running = { label: labelFor(event.kind), taskId: event.taskId, startedAt: Date.now() };
      },

      onStepEnd(event) {
        const step: ProgressStep = {
          label: labelFor(event.kind),
          detail: detailFor(event.taskId, event.summary),
          status: event.outcome === 'advanced' ? 'ok' : event.outcome === 'blocked' ? 'blocked' : 'failed',
          elapsedMs: Date.now() - (running?.startedAt ?? Date.now()),
        };
        completedStepCount += 1;
        if (event.itemId) {
          stepsByItem.set(event.itemId, (stepsByItem.get(event.itemId) ?? 0) + 1);
          if (event.outcome === 'blocked') {
            blockedThisRun.set(event.itemId, event.summary);
          }
        }
        running = null;
        writer.append([renderCompletedStep(step)]);
      },

      onTick(tick) {
        if (!running) {
          writer.setFrame(stopNotice ? ['', `  ${stopNotice}`] : []);
          return;
        }

        const frame = renderRunningStep(
          {
            label: running.label,
            detail: running.taskId ?? '',
            status: 'running',
            elapsedMs: Date.now() - running.startedAt,
          },
          tick,
        );
        writer.setFrame(stopNotice ? [...frame.slice(0, -1), `  ${stopNotice}`] : frame);
      },

      onOutput(outputLines) {
        // Routed through the writer rather than inherited: raw output landing straight on stdout
        // would print into the middle of the frame this loop is redrawing.
        writer.append(outputLines.map((line) => `    ${line}`));
      },

      onStopRequested(hard) {
        stopNotice = hard
          ? 'stopping now; the process tree is being terminated'
          : 'stop requested; finishing the step in flight';
      },
    },
  });

  writer.clearFrame();

  const items = orchestrator.describeWorkItems();

  writer.append(
    renderRunSummary({
      // Only what *this run* closed, not everything that was ever complete.
      completed: items.completed.filter((itemId) => !completedBefore.has(itemId)),
      advanced: [...stepsByItem.entries()]
        .filter(([itemId]) => !blockedThisRun.has(itemId))
        .map(([itemId, steps]) => ({ itemId, steps })),
      blocked: [...blockedThisRun.entries()].map(([itemId, reason]) => ({
        itemId,
        reason: reason.split('\n')[0]?.trim() ?? 'blocked',
      })),
      stoppedByHuman: result.exitCode === 130 || result.stopRequested,
      failure: result.exitCode === 1 ? 'the run could not continue; the output above says why' : null,
    }),
  );

  if (currentItemId === null && completedStepCount === 0 && result.exitCode === 0) {
    writer.append(['  Nothing was selectable. /status shows what each item is waiting on.', '']);
  }
}
