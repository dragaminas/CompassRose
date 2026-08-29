/**
 * The session's entire vocabulary of state changes, in one table.
 *
 * This registry is the determinism boundary described in `023-terminal-session`'s architecture: a
 * line starting with `/` is looked up here and nowhere else, and anything not in this table changes
 * nothing. The model is never asked what the user meant. Adding a capability to the session means
 * adding a row; there is no other way in.
 *
 * The bare-keyword aliases (`crear`, `listo`, `terminado`) are the ones `brainstorm.ts` and
 * `validationLoop.ts` already established as literal, orchestrator-owned transitions (ADR-0007).
 * They keep working unchanged.
 */
import { formatDoctorReport, runDoctor } from '../doctor/doctorCommand.js';
import { runValidationLoopForItem } from '../cli/validationLoop.js';
import { renderFailureView } from './render/failure.js';
import { renderDiagnosis, renderExitMenu, renderInvalidationWarning } from './render/diagnosis.js';
import { renderCoverageReport } from './render/coverage.js';
import {
  MAX_RECOVERY_RETRIES,
  availableExits,
  orderedExitsFor,
  type RecoveryExit,
} from '../contracts/runtime/recoveryDiagnosis.js';
import type { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import type { TerminalWriter } from './terminalWriter.js';
import { recordProvenanceAndCoverage as recordProvenanceAndCoverageFor } from '../cli/specificationTurn.js';
import type { BrainstormTurnRecord } from '../contracts/brainstormer/brainstormerContracts.js';
import type { SessionCompetencyProfile } from '../contracts/brainstormer/competency.js';
import type { RecordedDecision } from '../contracts/brainstormer/brainstormerContracts.js';

export interface SessionState {
  /** The whole session's conversation, carried into drafting. */
  transcript: BrainstormTurnRecord[];
  /** Just the turns belonging to the idea currently under discussion; reset on each draft. */
  segment: BrainstormTurnRecord[];
  proposedTitle: string | null;
  /** The work item the conversation is currently about, if any. */
  focusItemId: string | null;
  /** Who is in this session, for attributing coverage decisions. Never a competency claim. */
  author: string;
  /** Who decides what, for this session only. Never written to the repository. */
  competency: SessionCompetencyProfile;
  /**
   * Decisions taken while specifying the idea under discussion, with who gave each one.
   *
   * Unlike the profile, these *are* written -- into the drafted specification's provenance
   * section. The profile is a fact about a person and must not outlive the session; a decision is
   * a fact about the document and has to.
   */
  decisions: RecordedDecision[];
  exit: boolean;
}

export interface SessionContext {
  readonly orchestrator: CompassRoseOrchestrator;
  readonly writer: TerminalWriter;
  readonly ask: (question: string) => Promise<string>;
  readonly state: SessionState;
  /** Runs the automated loop with live progress; owned by the session runtime. */
  readonly runLoop: (target: string | null) => Promise<void>;
}

export interface SessionCommand {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly usage: string;
  readonly summary: string;
  readonly run: (context: SessionContext, args: readonly string[]) => void | Promise<void>;
}

function print(context: SessionContext, lines: readonly string[]): void {
  context.writer.append(lines);
}

function resolveTargetId(context: SessionContext, args: readonly string[], candidates: readonly string[]): string | null {
  if (args.length > 0) {
    return args[0] ?? null;
  }
  if (context.state.focusItemId) {
    return context.state.focusItemId;
  }
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

const helpCommand: SessionCommand = {
  name: 'help',
  aliases: ['?'],
  usage: '/help',
  summary: 'list what this session can do',
  run(context) {
    const rows = SESSION_COMMANDS.map((command) => `  ${command.usage.padEnd(24)} ${command.summary}`);
    print(context, ['', ...rows, '', '  Anything not starting with / is conversation and changes nothing.', '']);
  },
};

const statusCommand: SessionCommand = {
  name: 'status',
  aliases: [],
  usage: '/status',
  summary: 'what every work item is waiting on',
  run(context) {
    const items = context.orchestrator.describeWorkItems();
    const section = (label: string, ids: readonly string[]): string[] =>
      ids.length === 0 ? [] : [`  ${label}`, ...ids.map((id) => `    ${id}`)];

    print(context, [
      '',
      ...section('complete', items.completed),
      ...section('in progress', items.inProgress),
      ...section('blocked', items.blocked),
      ...section('awaiting your validation', items.awaitingValidation),
      ...section('pending specification', items.pendingSpecification),
      '',
    ]);
  },
};

const doctorCommand: SessionCommand = {
  name: 'doctor',
  aliases: [],
  usage: '/doctor',
  summary: 'read-only readiness diagnostics',
  run(context) {
    const report = runDoctor({ cwd: process.cwd() });
    print(context, ['', ...formatDoctorReport(report).split('\n').map((line) => `  ${line}`), '']);
  },
};

const runCommand: SessionCommand = {
  name: 'run',
  aliases: [],
  usage: '/run [id]',
  summary: 'start the automated loop, optionally on one item',
  async run(context, args) {
    await context.runLoop(args[0] ?? null);
  },
};

const unblockCommand: SessionCommand = {
  name: 'desbloquear',
  aliases: ['unblock'],
  usage: '/desbloquear [id]',
  summary: 'work through a blocked item together',
  async run(context, args) {
    const blocked = context.orchestrator.listHumanBlockedWorkItems();
    if (blocked.length === 0) {
      print(context, ['', '  Nothing is blocked waiting on you.', '']);
      return;
    }

    const targetId = resolveTargetId(context, args, blocked.map((item) => item.id));
    if (!targetId) {
      print(context, [
        '',
        '  More than one item is blocked. Name the one you mean:',
        ...blocked.map((item) => `    /desbloquear ${item.id}`),
        '',
      ]);
      return;
    }

    const card = context.orchestrator.listBlockedWorkItems().find((item) => item.itemId === targetId);
    if (!card) {
      print(context, ['', `  ${targetId} is not currently blocked.`, '']);
      return;
    }

    context.state.focusItemId = targetId;
    print(context, renderFailureView({ card, explanation: null }));

    let diagnosis;
    try {
      diagnosis = context.orchestrator.diagnoseBlockage(targetId);
    } catch (error) {
      // A diagnosis that cannot be produced must not cost the human their way out: the four exits
      // are still reachable, they just arrive without hypotheses to order them.
      print(context, ['', `  I could not work up a diagnosis: ${error instanceof Error ? error.message : String(error)}`, '']);
      await offerExits(context, targetId, ['retry', 'correct_specification', 'open_fix', 'resolve_by_hand']);
      return;
    }

    print(context, renderDiagnosis(diagnosis));
    await offerExits(context, targetId, orderedExitsFor(diagnosis));
  },
};

/**
 * The four exits are the four places a root cause can be, and they are offered as a closed set:
 * the ordering comes from the agent's leading hypothesis, but every exit stays reachable no matter
 * what it believes. Only a literal human choice selects one.
 */
async function offerExits(
  context: SessionContext,
  itemId: string,
  offered: readonly RecoveryExit[],
): Promise<void> {
  // The conversation's own ceiling. Retry is the only exit that can be taken again and again
  // against the same blocker -- it puts the item back in the queue, the run blocks it on the same
  // thing, and the same menu comes back. After three, what the agent was told is not the problem.
  const retriesTaken = context.orchestrator.recoveryRetriesTaken(itemId);
  const exits = availableExits(offered, retriesTaken);
  if (exits.length < offered.length) {
    print(context, [
      '',
      `  Retried ${retriesTaken} times on this blocker already, so I am not offering it a fourth.`,
      '  If three different accounts did not resolve it, the root cause is somewhere the other',
      '  exits point.',
    ]);
  }

  print(context, renderExitMenu(exits));

  const answer = (await context.ask('  Number, or anything else to leave it blocked: ')).trim();
  const index = Number.parseInt(answer, 10) - 1;
  const chosen = Number.isInteger(index) && index >= 0 && index < exits.length ? exits[index] : null;

  if (!chosen) {
    print(context, ['', `  ${itemId} stays blocked. /desbloquear ${itemId} picks this up where we left off.`, '']);
    return;
  }

  if (chosen === 'retry') {
    const humanContext = (await context.ask('  What should the next attempt know that it did not? ')).trim();
    if (humanContext.length === 0) {
      print(context, ['', `  Nothing recorded, so nothing would reach the retry. ${itemId} stays blocked.`, '']);
      return;
    }

    context.orchestrator.retryWithContext(itemId, humanContext);
    const remaining = MAX_RECOVERY_RETRIES - (retriesTaken + 1);
    print(context, [
      '',
      `  Recorded, and ${itemId} is back in the queue. /run picks it up.`,
      ...(remaining > 0
        ? [`  ${remaining} retr${remaining === 1 ? 'y' : 'ies'} left on this blocker before I stop offering it.`]
        : ['  That was the last retry I will offer on this blocker.']),
      '',
    ]);
    return;
  }

  if (chosen === 'correct_specification') {
    print(context, renderInvalidationWarning(itemId, context.orchestrator.invalidatedWorkFor(itemId)));

    // The only exit that destroys planned work, and the only one behind an explicit confirmation.
    const confirmation = (await context.ask('  Type "listo" to confirm, anything else to cancel: ')).trim();
    if (confirmation.toLowerCase() !== 'listo') {
      print(context, ['', `  Cancelled. ${itemId} stays blocked.`, '']);
      return;
    }

    const reason = (await context.ask('  What was wrong with the specification? ')).trim();
    if (reason.length === 0) {
      print(context, ['', '  Invalidating work without recording why is not something I will do. Cancelled.', '']);
      return;
    }

    context.orchestrator.correctSpecification(itemId, reason);
    print(context, [
      '',
      `  ${itemId} is back to pending specification, with what was superseded recorded and why.`,
      `  Talk it through with me and /crear when it is settled.`,
      '',
    ]);
    return;
  }

  if (chosen === 'open_fix') {
    const title = (await context.ask('  In a few words, what is broken? ')).trim();
    if (title.length === 0) {
      print(context, ['', `  Nothing to file. ${itemId} stays blocked.`, '']);
      return;
    }

    const description = (await context.ask('  And what should whoever picks it up know? ')).trim();
    if (description.length === 0) {
      print(context, ['', '  A title alone is not a fix anyone can work from. Cancelled.', '']);
      return;
    }

    const fixId = context.orchestrator.openFixFromConversation(itemId, title, description);
    print(context, [
      '',
      `  Filed \`${fixId}\`, and ${itemId} now waits on it.`,
      `  You do not have to come back here: when \`${fixId}\` completes, ${itemId} resumes by itself.`,
      `  Talk \`${fixId}\` through with me and /crear when it is settled.`,
      '',
    ]);
    return;
  }

  const confirmation = (await context.ask(`  Type "listo" once you have resolved it, to resume ${itemId}: `)).trim();
  if (confirmation.toLowerCase() !== 'listo') {
    print(context, ['', `  ${itemId} stays blocked.`, '']);
    return;
  }

  context.orchestrator.acknowledgeBlocker(itemId);
  print(context, ['', `  ${itemId} is unblocked and back in the queue.`, '']);
}

/**
 * The two things about a repository that no file states: what it is for, and which of its declared
 * scripts are actually gates (028-project-understanding).
 *
 * Behind an explicit sub-command rather than run on every `/proyecto`, because inference costs a
 * call and produces something a human then has to check. Detection is free and automatic; guessing
 * is neither.
 */
async function inferAndOffer(context: SessionContext): Promise<void> {
  print(context, ['', '  Working out what this repository does not say about itself...', '']);

  const { inference } = context.orchestrator.inferProjectGaps();
  const lines: string[] = [];

  lines.push(
    inference.purpose
      ? `  What I think this project is for: ${inference.purpose}`
      : '  I could not tell what this project is for from what it says about itself.',
  );

  if (inference.gate_commands.length > 0) {
    lines.push(
      '',
      '  Scripts that look like gates a change should pass:',
      ...inference.gate_commands.map((command) => `    ${command}`),
    );
  }

  lines.push(
    '',
    inference.start_command
      ? `  And the one that looks like it starts the application: ${inference.start_command}`
      : '  Nothing here looks like a command that starts an application.',
    '',
    '  All of that is a guess, marked as one. It changes nothing on its own: the gate and start',
    '  commands are for you to put in CONFIG.md if you agree, and /proyecto confirmar promotes a',
    '  guess to a fact once you have checked it.',
    '',
  );

  print(context, lines);
}

/**
 * Promotes a guess to a fact, on a human's word.
 *
 * The only operation that raises a fact's provenance -- ADR-0007's rule applied to knowledge rather
 * than to lifecycle. Everything unconfirmed is offered, including facts *detected* from a file:
 * detection can be wrong about a repository that has two package managers or a vestigial config,
 * and only a person can say which one is real.
 */
async function confirmFacts(context: SessionContext): Promise<void> {
  const unconfirmed = context.orchestrator.unconfirmedProjectFacts();
  if (unconfirmed.length === 0) {
    print(context, ['', '  Everything recorded about this repository has already been confirmed.', '']);
    return;
  }

  print(context, [
    '',
    '  Nobody has vouched for these yet:',
    ...unconfirmed.map((entry, index) => `    ${index + 1}. ${entry.field.padEnd(20)} ${entry.value}  (${entry.kind})`),
    '',
  ]);

  const answer = (await context.ask('  Numbers to confirm, comma-separated, or anything else to leave them: ')).trim();
  const chosen = answer
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10) - 1)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < unconfirmed.length);

  if (chosen.length === 0) {
    print(context, ['  Left as they were.', '']);
    return;
  }

  for (const index of chosen) {
    context.orchestrator.confirmProjectFact(unconfirmed[index]!.field, context.state.author);
  }

  print(context, [
    `  Confirmed: ${chosen.map((index) => unconfirmed[index]!.field).join(', ')}.`,
    '  A later detection can no longer overwrite them; a contradiction gets reported instead.',
    '',
  ]);
}

const createCommand: SessionCommand = {
  name: 'crear',
  aliases: ['create'],
  usage: '/crear [id]',
  summary: 'settle the idea under discussion, or an existing request, into a specification',
  async run(context, args) {
    // Two shapes, because a specification session has two starting points: a request folder that
    // already exists and has never been specified with anyone, or an idea that exists only in the
    // conversation. Both end the same way -- a drafted specification entering validation.
    const pending = context.orchestrator.listWorkItemsPendingSpecification();
    const namedExisting = args[0] && pending.some((item) => item.id === args[0]) ? args[0] : null;
    const impliedExisting = args.length === 0 && pending.length === 1 && context.state.segment.length === 0
      ? pending[0]!.id
      : null;
    const existingId = namedExisting ?? impliedExisting;

    if (existingId) {
      context.orchestrator.specifyExistingRequest(existingId);
      context.state.focusItemId = existingId;
      await recordProvenanceAndCoverage(context, existingId);
      print(context, ['', `  ${existingId} is specified. Let's validate it.`, '']);
      await validateItem(context, existingId);
      return;
    }

    if (context.state.segment.length === 0) {
      print(context, [
        '',
        pending.length > 0
          ? `  Tell me the idea first, or name one of the pending requests: ${pending.map((item) => item.id).join(', ')}`
          : '  Tell me the idea first, then /crear.',
        '',
      ]);
      return;
    }

    const title = context.state.proposedTitle ?? context.state.segment[0]!.text.slice(0, 80);
    const { featureId } = context.orchestrator.draftBrainstormedFeature(
      [...context.state.transcript.filter((turn) => !context.state.segment.includes(turn)), ...context.state.segment],
      title,
    );

    context.state.segment = [];
    context.state.proposedTitle = null;
    context.state.focusItemId = featureId;
    await recordProvenanceAndCoverage(context, featureId);
    print(context, ['', `  ${featureId} drafted. Let's validate it.`, '']);

    await validateItem(context, featureId);
  },
};

/**
 * The session's transport, wrapped around the shared implementation in
 * `src/cli/specificationTurn.ts` -- which `compassrose brainstorm` uses too, so both entry points
 * into the specification flow write provenance and run the audit rather than only this one.
 */
function recordProvenanceAndCoverage(context: SessionContext, itemId: string): Promise<void> {
  return recordProvenanceAndCoverageFor(
    context.orchestrator,
    context.state,
    itemId,
    context.ask,
    (lines) => print(context, lines),
  );
}

const readyCommand: SessionCommand = {
  name: 'listo',
  aliases: ['ready'],
  usage: '/listo [id]',
  summary: 'validate a drafted feature or fix',
  async run(context, args) {
    const pending = context.orchestrator.listFeaturesAwaitingValidation();
    if (pending.length === 0) {
      print(context, ['', '  Nothing is awaiting validation.', '']);
      return;
    }

    const targetId = resolveTargetId(context, args, pending.map((item) => item.id));
    if (!targetId) {
      print(context, [
        '',
        '  More than one item is awaiting validation. Name the one you mean:',
        ...pending.map((item) => `    /listo ${item.id}`),
        '',
      ]);
      return;
    }

    await validateItem(context, targetId);
  },
};

const projectCommand: SessionCommand = {
  name: 'proyecto',
  aliases: ['project'],
  usage: '/proyecto [inferir|confirmar]',
  summary: 'what CompassRose knows about this repository, and how it knows it',
  async run(context, args) {
    if (args[0] === 'inferir' || args[0] === 'infer') {
      await inferAndOffer(context);
      return;
    }

    if (args[0] === 'confirmar' || args[0] === 'confirm') {
      await confirmFacts(context);
      return;
    }

    const { facts, contradictions, changedSignals } = context.orchestrator.refreshProjectFacts();
    const lines: string[] = [''];

    const describe = (label: string, fact: { value: unknown; provenance: { kind: string } } | null): void => {
      if (!fact) {
        return;
      }
      const value = Array.isArray(fact.value) ? fact.value.join(', ') : String(fact.value);
      // The marker distinguishes what was read from what was guessed. Confusing the two is the
      // whole failure this document exists to prevent.
      const marker = fact.provenance.kind === 'confirmed' ? '✓' : fact.provenance.kind === 'detected' ? '·' : '?';
      lines.push(`    ${marker} ${label.padEnd(14)} ${value}`);
    };

    lines.push('  What I can read from this repository:');
    describe('name', facts.name);
    describe('languages', facts.languages);
    describe('packages', facts.packageManager);
    describe('build', facts.buildSystem);
    describe('tests', facts.testSystem);
    describe('sources', facts.sourceRoots);
    describe('docs', facts.documentationRoots);
    describe('purpose', facts.purpose);

    lines.push('', '  ✓ confirmed by a human · read from the repository ? inferred, wants your confirmation', '');

    const inventory = context.orchestrator.codeInventory();
    if (inventory.length > 0) {
      lines.push('  Code, grouped by directory:');
      for (const group of inventory.slice(0, 8)) {
        const entries = group.entryPoints.length > 0 ? `  (entry: ${group.entryPoints.join(', ')})` : '';
        lines.push(`    ${group.directory.padEnd(28)} ${group.moduleCount} modules${entries}`);
      }
      lines.push('', '  This is material for a conversation, not a specification. Nothing here becomes a', '  feature without you deciding it does.', '');
    }

    if (changedSignals.length > 0) {
      lines.push(`  Changed since last time: ${changedSignals.join(', ')}`, '');
    }

    for (const contradiction of contradictions) {
      lines.push(
        `  ⚠ ${contradiction.field}: you confirmed ${contradiction.confirmedValue}, but the repository now says ${contradiction.detectedValue}.`,
        '    Your confirmation stands until you change it.',
        '',
      );
    }

    print(context, lines);
  },
};

const coverageCommand: SessionCommand = {
  name: 'cobertura',
  aliases: ['coverage'],
  usage: '/cobertura',
  summary: 'which dimensions of the application nothing covers yet',
  run(context) {
    print(context, renderCoverageReport(context.orchestrator.buildCoverageReport()));
  },
};

const discardDimensionCommand: SessionCommand = {
  name: 'descartar',
  aliases: ['discard'],
  usage: '/descartar <dimension>',
  summary: 'put a dimension out of scope, with a reason',
  async run(context, args) {
    const name = args.join(' ').trim();
    if (name.length === 0) {
      const uncovered = context.orchestrator.buildCoverageReport().uncovered;
      print(context, [
        '',
        '  Name the dimension:',
        ...uncovered.map((entry) => `    /descartar ${entry}`),
        '',
      ]);
      return;
    }

    // The reason is not optional, and refusing without one is the point: six months from now, an
    // unexplained discard is indistinguishable from an oversight.
    const reason = (await context.ask(`  Why is "${name}" out of scope for this project? `)).trim();
    if (reason.length === 0) {
      print(context, ['', '  Without a reason this would be indistinguishable from forgetting. Cancelled.', '']);
      return;
    }

    try {
      context.orchestrator.decideDimension(name, 'out_of_scope', reason, context.state.author);
      print(context, ['', `  "${name}" is out of scope, with your reason recorded. It will not be raised again.`, '']);
    } catch (error) {
      print(context, ['', `  ${error instanceof Error ? error.message : String(error)}`, '']);
    }
  },
};

const reopenDimensionCommand: SessionCommand = {
  name: 'reabrir',
  aliases: ['reopen'],
  usage: '/reabrir <dimension>',
  summary: 'reopen a dimension somebody else put out of scope',
  run(context, args) {
    const name = args.join(' ').trim();
    if (name.length === 0) {
      print(context, ['', '  Name the dimension to reopen.', '']);
      return;
    }

    // Reopening appends; the prior decision stays visible with its original author and date. That
    // is what makes it safe for a second person to disagree with the first.
    context.orchestrator.decideDimension(name, 'uncovered', `reopened by ${context.state.author}`, context.state.author);
    print(context, ['', `  "${name}" is open again. The earlier decision is kept in the record.`, '']);
  },
};

const exitCommand: SessionCommand = {
  name: 'salir',
  aliases: ['terminado', 'exit', 'quit'],
  usage: '/salir',
  summary: 'end the session',
  run(context) {
    context.state.exit = true;
    // A session that ends without saying what is still uncovered is a session that quietly loses
    // the one thing the checklist exists to surface.
    print(context, renderCoverageReport(context.orchestrator.buildCoverageReport()));
  },
};

async function validateItem(context: SessionContext, itemId: string): Promise<void> {
  const { confirmed, transcript } = await runValidationLoopForItem(
    context.orchestrator,
    itemId,
    context.ask,
    (line) => context.writer.append([`  ${line}`]),
  );

  if (confirmed) {
    context.orchestrator.confirmFeatureValidation(itemId, transcript);
    print(context, ['', `  ${itemId} confirmed. It is now eligible for /run.`, '']);
  } else {
    print(context, ['', `  ${itemId} is still awaiting validation. /listo ${itemId} when you're ready.`, '']);
  }
}

export const SESSION_COMMANDS: readonly SessionCommand[] = [
  helpCommand,
  statusCommand,
  doctorCommand,
  runCommand,
  unblockCommand,
  createCommand,
  readyCommand,
  projectCommand,
  coverageCommand,
  discardDimensionCommand,
  reopenDimensionCommand,
  exitCommand,
];

export interface ParsedCommandLine {
  readonly command: SessionCommand;
  readonly args: readonly string[];
}

/**
 * Resolves an input line to a command, or `null` when it is conversation.
 *
 * Two accepted shapes, both literal: a slash form (`/run 024`), and the bare keywords that already
 * carry orchestrator-owned meaning (`crear`, `listo`, `terminado`). Anything else is conversation,
 * including an unknown slash word -- which is reported as unknown by the caller rather than guessed
 * at.
 */
export function parseCommandLine(line: string): ParsedCommandLine | 'unknown-command' | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const isSlash = trimmed.startsWith('/');
  const withoutSlash = isSlash ? trimmed.slice(1) : trimmed;
  const [word = '', ...args] = withoutSlash.split(/\s+/);
  const name = word.toLowerCase();

  const match = SESSION_COMMANDS.find(
    (command) => command.name === name || command.aliases.includes(name),
  );

  if (match) {
    // A bare keyword only counts when it is the entire line: "crear" is a command, "crear una
    // pantalla de login" is someone describing a feature.
    if (!isSlash && args.length > 0) {
      return null;
    }
    return { command: match, args };
  }

  return isSlash ? 'unknown-command' : null;
}
