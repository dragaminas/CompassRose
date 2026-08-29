/**
 * Primitives for reading and editing the `## Heading` markdown sections used by
 * CompassRose's task, feature, and state documents.
 */

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripTicks(text: string): string {
  return text.replace(/^`+|`+$/g, '');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

interface SectionBounds {
  /** Index of the `#` that opens the heading. */
  readonly start: number;
  /** Index of the newline that ends the heading line, where the body begins. */
  readonly bodyStart: number;
  /** Index of the newline that opens the next `## ` heading, or the end of the document. */
  readonly end: number;
}

/**
 * Where a section starts, where its body starts, and where it ends.
 *
 * The header pattern used to be `^## Heading\n+`, and the greedy `\n+` was a document-corruption
 * bug waiting for an empty section. Given `## Implemented\n\n## Pending\n- b`, it consumed the
 * blank line *and* the newline that opens `## Pending`, so `bodyStart` landed inside the next
 * heading and `indexOf('\n## ')` skipped straight past it. `## Implemented` then measured as
 * containing all of `## Pending`'s bullets -- and `replaceSection` overwrote them.
 *
 * Silently, and while producing a perfectly well-formed document with one section's content filed
 * under another's heading. Found by seeding an empty `## Implemented`, which is what an
 * implemented-nothing-yet project honestly has.
 *
 * The match now stops at the end of the heading line, leaving `bodyStart` on the newline itself, so
 * a section immediately followed by another measures as empty -- which is what it is.
 */
function locateSection(markdown: string, heading: string): SectionBounds | null {
  const match = new RegExp(`^## ${escapeRegExp(heading)}[ \\t]*$`, 'm').exec(markdown);
  if (!match || match.index === undefined) {
    return null;
  }

  const bodyStart = match.index + match[0].length;
  const nextHeadingIndex = markdown.indexOf('\n## ', bodyStart);
  return {
    start: match.index,
    bodyStart,
    end: nextHeadingIndex === -1 ? markdown.length : nextHeadingIndex,
  };
}

export function optionalSection(rawMarkdown: string, heading: string): string | null {
  const markdown = rawMarkdown.replace(/\r\n/g, '\n');
  const bounds = locateSection(markdown, heading);
  if (!bounds) {
    return null;
  }

  // The blank line between a heading and its body belongs to the heading, not the body.
  return markdown.slice(bounds.bodyStart, bounds.end).replace(/^\n+/, '').trimEnd();
}

export function requireSection(markdown: string, heading: string): string {
  const body = optionalSection(markdown, heading);
  if (body === null) {
    throw new Error(`Section "## ${heading}" was not found.`);
  }

  return body;
}

export function replaceSection(rawMarkdown: string, heading: string, newBody: string): string {
  const markdown = rawMarkdown.replace(/\r\n/g, '\n');
  const bounds = locateSection(markdown, heading);
  if (!bounds) {
    throw new Error(`Section "## ${heading}" was not found.`);
  }

  const body = ensureTrailingNewline(newBody).trimEnd();
  // An empty body leaves the heading alone rather than trailing blank lines behind it.
  const replacement = body.length > 0 ? `## ${heading}\n\n${body}\n` : `## ${heading}\n`;
  return `${markdown.slice(0, bounds.start)}${replacement}${markdown.slice(bounds.end)}`;
}

export function setOrInsertSection(rawMarkdown: string, heading: string, newBody: string): string {
  const markdown = rawMarkdown.replace(/\r\n/g, '\n');
  if (locateSection(markdown, heading)) {
    return replaceSection(markdown, heading, newBody);
  }

  const status = locateSection(markdown, 'Status');
  if (!status) {
    throw new Error(`Unable to insert section "## ${heading}" because "## Status" was not found.`);
  }

  const insertAt = status.end;
  const insertion = `\n\n## ${heading}\n\n${ensureTrailingNewline(newBody).trimEnd()}`;
  return `${markdown.slice(0, insertAt)}${insertion}${markdown.slice(insertAt)}`;
}

export function upsertBulletInSection(markdown: string, heading: string, startsWith: string, bullet: string): string {
  const existingBody = requireSection(markdown, heading);
  const lines = existingBody
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  const index = lines.findIndex((line) => line.startsWith(startsWith));
  if (index === -1) {
    lines.push(bullet);
  } else {
    lines[index] = bullet;
  }

  return replaceSection(markdown, heading, lines.join('\n'));
}

export function upsertParagraphInSection(markdown: string, heading: string, contains: string, paragraph: string): string {
  const existingBody = requireSection(markdown, heading);
  const blocks = existingBody
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  const index = blocks.findIndex((block) => block.includes(contains));
  if (index === -1) {
    blocks.push(paragraph);
  } else {
    blocks[index] = paragraph;
  }

  return replaceSection(markdown, heading, blocks.join('\n\n'));
}

export function parseBulletSection(section: string | null): string[] | null {
  if (!section) {
    return null;
  }

  const items = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());

  return items.length > 0 ? items : null;
}

export function parseLabeledBulletList(section: string, label: string): string[] {
  // No `m` flag: `$` here must mean "end of the whole section", not "end of the current
  // line" (which is what `$` means with `m` set). With `m` set, the lazy `[\s\S]*?` stops
  // matching at the very first line break because that already satisfies the `$` branch of
  // the lookahead, silently truncating every list to its first bullet whenever more than
  // one entry is present.
  const pattern = new RegExp(`${escapeRegExp(label)}:\\n([\\s\\S]*?)(?=\\n[A-Z][^\\n]*:|$)`);
  const match = section.match(pattern);
  if (!match) {
    return [];
  }

  const listBody = match[1] ?? '';
  return listBody
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

export function parseCodeBlock(section: string | null): string[] | null {
  if (!section) {
    return null;
  }

  const match = section.match(/```[a-z]*\n([\s\S]*?)```/);
  if (!match) {
    return null;
  }

  const block = match[1] ?? '';
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function firstExpectedChange(markdown: string): string | null {
  const section = optionalSection(markdown, 'Expected Changes');
  return parseBulletSection(section)?.[0] ?? null;
}

export function parseStatusMap(sectionBody: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of sectionBody.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('- ')) {
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(2, separator).trim();
    const value = line.slice(separator + 1).trim();
    values[key] = value;
  }

  return values;
}

export function parsePreferredStatusValue(sectionBody: string, key: string): string | null {
  let fallback: string | null = null;
  let preferred: string | null = null;

  for (const rawLine of sectionBody.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('- ')) {
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const parsedKey = line.slice(2, separator).trim();
    if (parsedKey !== key) {
      continue;
    }

    const value = line.slice(separator + 1).trim();
    fallback = value;
    if (value !== 'none') {
      preferred = value;
    }
  }

  return preferred ?? fallback;
}

export function extractTaskIdHint(text: string | null): string | null {
  if (!text) {
    return null;
  }

  const match = text.match(/\b(F\d+-T\d+(?:-U\d+)?)\b/);
  return match?.[1] ?? null;
}
