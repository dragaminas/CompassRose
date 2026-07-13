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

export function optionalSection(rawMarkdown: string, heading: string): string | null {
  const markdown = rawMarkdown.replace(/\r\n/g, '\n');
  const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\n+`, 'm');
  const match = markdown.match(pattern);
  if (!match || match.index === undefined) {
    return null;
  }

  const bodyStart = match.index + match[0].length;
  const nextHeadingIndex = markdown.indexOf('\n## ', bodyStart);
  const sectionEnd = nextHeadingIndex === -1 ? markdown.length : nextHeadingIndex;
  return markdown.slice(bodyStart, sectionEnd).trimEnd();
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
  const sectionHeaderPattern = new RegExp(`^## ${escapeRegExp(heading)}\\n+`, 'm');
  const sectionMatch = markdown.match(sectionHeaderPattern);
  if (!sectionMatch || sectionMatch.index === undefined) {
    throw new Error(`Section "## ${heading}" was not found.`);
  }

  const sectionStart = sectionMatch.index;
  const bodyStart = sectionStart + sectionMatch[0].length;
  const nextHeadingIndex = markdown.indexOf('\n## ', bodyStart);
  const sectionEnd = nextHeadingIndex === -1 ? markdown.length : nextHeadingIndex;
  const replacement = `## ${heading}\n\n${ensureTrailingNewline(newBody).trimEnd()}\n`;
  return `${markdown.slice(0, sectionStart)}${replacement}${markdown.slice(sectionEnd)}`;
}

export function setOrInsertSection(rawMarkdown: string, heading: string, newBody: string): string {
  const markdown = rawMarkdown.replace(/\r\n/g, '\n');
  const sectionHeaderPattern = new RegExp(`^## ${escapeRegExp(heading)}\\n+`, 'm');
  if (sectionHeaderPattern.test(markdown)) {
    return replaceSection(markdown, heading, newBody);
  }

  const statusHeaderPattern = /^## Status\n+/m;
  const statusMatch = markdown.match(statusHeaderPattern);
  if (!statusMatch || statusMatch.index === undefined) {
    throw new Error(`Unable to insert section "## ${heading}" because "## Status" was not found.`);
  }

  const statusBodyStart = statusMatch.index + statusMatch[0].length;
  const nextHeadingIndex = markdown.indexOf('\n## ', statusBodyStart);
  const insertAt = nextHeadingIndex === -1 ? markdown.length : nextHeadingIndex;
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
