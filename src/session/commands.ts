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
import type { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import type { TerminalWriter } from './terminalWriter.js';
import type { BrainstormTurnRecord } from '../contracts/brainstormer/brainstormerContracts.js';

export interface SessionState {
  /** The whole session's conversation, carried into drafting. */
  transcript: BrainstormTurnRecord[];
  /** Just the turns belonging to the idea currently under discussion; reset on each draft. */
  segment: BrainstormTurnRecord[];
  proposedTitle: string | null;
  /** The work item the conversation is currently about, if any. */
  focusItemId: string | null;
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
  summary: 'work through a blocked item',
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

    // The diagnosis-led conversation belongs to 026-conversational-doctor-recovery. Until it
    // lands, the session offers what already exists and is honest about the difference: the card,
    // and the one deterministic exit a human can take today.
    print(context, renderFailureView({ card, explanation: null }));
    context.state.focusItemId = targetId;

    const answer = (await context.ask(`Have you resolved this yourself? Type "listo" to resume ${targetId}: `)).trim();
    if (answer.toLowerCase() !== 'listo') {
      print(context, ['', `  ${targetId} stays blocked.`, '']);
      return;
    }

    context.orchestrator.acknowledgeBlocker(targetId);
    print(context, ['', `  ${targetId} is unblocked and back in the queue.`, '']);
  },
};

const createCommand: SessionCommand = {
  name: 'crear',
  aliases: ['create'],
  usage: '/crear',
  summary: 'turn the idea under discussion into a feature',
  async run(context) {
    if (context.state.segment.length === 0) {
      print(context, ['', '  Tell me the idea first, then /crear.', '']);
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
    print(context, ['', `  ${featureId} drafted. Let's validate it.`, '']);

    await validateItem(context, featureId);
  },
};

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

const exitCommand: SessionCommand = {
  name: 'salir',
  aliases: ['terminado', 'exit', 'quit'],
  usage: '/salir',
  summary: 'end the session',
  run(context) {
    context.state.exit = true;
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
