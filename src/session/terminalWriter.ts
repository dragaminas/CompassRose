/**
 * The only place in this codebase permitted to emit ANSI escape sequences.
 *
 * Everything above this module renders to `string[]` and stays testable by plain array comparison
 * (see `src/session/render/`). This module turns those arrays into terminal output, and owns the
 * one piece of state that cannot be pure: how many lines the transient frame currently occupies.
 *
 * Deliberately not unit tested. Its correctness is "does the terminal look right", which no
 * assertion answers honestly; it is verified by hand, matching this repository's existing
 * convention for CLI layers. Everything it is asked to draw is tested one level up.
 */

const CURSOR_UP = (lines: number): string => `\x1b[${lines}A`;
const CLEAR_TO_END = '\x1b[0J';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

export interface TerminalWriter {
  /** Write lines that stay on screen permanently. Clears any transient frame first. */
  append(lines: readonly string[]): void;
  /** Replace the transient frame drawn below the appended output. */
  setFrame(lines: readonly string[]): void;
  /** Remove the transient frame, leaving only appended output. */
  clearFrame(): void;
  /** Restore the terminal before handing control back (cursor visibility, trailing frame). */
  dispose(): void;
}

export interface TerminalWriterOptions {
  readonly write?: (text: string) => void;
  readonly isTty?: boolean;
}

/**
 * When stdout is not a TTY -- a pipe, a file, CI -- frame replacement is meaningless and its escape
 * sequences are noise. This writer degrades to appending only, which is exactly what a log wants.
 */
function createAppendOnlyWriter(write: (text: string) => void): TerminalWriter {
  return {
    append(lines) {
      if (lines.length > 0) {
        write(`${lines.join('\n')}\n`);
      }
    },
    setFrame() {},
    clearFrame() {},
    dispose() {},
  };
}

export function createTerminalWriter(options: TerminalWriterOptions = {}): TerminalWriter {
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const isTty = options.isTty ?? Boolean(process.stdout.isTTY);

  if (!isTty) {
    return createAppendOnlyWriter(write);
  }

  let frameHeight = 0;
  let cursorHidden = false;

  const eraseFrame = (): void => {
    if (frameHeight === 0) {
      return;
    }

    write(`${CURSOR_UP(frameHeight)}${CLEAR_TO_END}`);
    frameHeight = 0;
  };

  return {
    append(lines) {
      eraseFrame();
      if (lines.length > 0) {
        write(`${lines.join('\n')}\n`);
      }
    },

    setFrame(lines) {
      eraseFrame();
      if (lines.length === 0) {
        return;
      }

      if (!cursorHidden) {
        write(HIDE_CURSOR);
        cursorHidden = true;
      }

      write(`${lines.join('\n')}\n`);
      frameHeight = lines.length;
    },

    clearFrame() {
      eraseFrame();
    },

    dispose() {
      eraseFrame();
      if (cursorHidden) {
        write(SHOW_CURSOR);
        cursorHidden = false;
      }
    },
  };
}
