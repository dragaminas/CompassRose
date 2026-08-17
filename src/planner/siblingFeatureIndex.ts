import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { optionalSection } from '../markdown/sections.js';

export interface SiblingFeatureSummary {
  readonly featureId: string;
  readonly title: string;
  readonly summary: string;
}

const SUMMARY_MAX_LENGTH = 320;

function humanizeFeatureId(featureId: string): string {
  return featureId
    .replace(/^\d+-/, '')
    .split('-')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s*(?:Feature|Request):\s*(.+)$/m) ?? markdown.match(/^#\s*(.+)$/m);
  return match?.[1]?.trim() || fallback;
}

function firstParagraphAfterTitle(markdown: string): string {
  const withoutTitle = markdown.replace(/^#[^\n]*\n/, '');
  const paragraphs = withoutTitle
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith('```'));
  return paragraphs[0] ?? '';
}

function truncate(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit).trimEnd()}...` : collapsed;
}

/**
 * Builds a lightweight {featureId, title, summary} index of every other feature under
 * compassrose/features/ so a planning step can ground "does this belong to another feature?"
 * in the repository's own documents instead of the model's memory. Reads request.md
 * (present from the moment a feature is requested) and prefers feature.md's Purpose
 * section once a feature is formalized, since that's a more deliberate summary than
 * a request's free-form prose.
 *
 * `definitionFileName` generalizes this same reader for compassrose/fixes/: pass 'fix.md' to build
 * a sibling-fix index instead (used only for dedup awareness in fix task planning, since
 * fixes have no scope-guard equivalent) -- the reader logic is identical either way.
 */
export function buildSiblingFeatureIndex(
  featuresRoot: string,
  excludeFeatureId?: string,
  definitionFileName = 'feature.md',
): SiblingFeatureSummary[] {
  if (!existsSync(featuresRoot)) {
    return [];
  }

  const featureIds = readdirSync(featuresRoot)
    .filter((entry) => /^\d+-/.test(entry) && statSync(join(featuresRoot, entry)).isDirectory())
    .filter((entry) => entry !== excludeFeatureId)
    .sort();

  const summaries: SiblingFeatureSummary[] = [];
  for (const featureId of featureIds) {
    const featurePath = join(featuresRoot, featureId, definitionFileName);
    const requestPath = join(featuresRoot, featureId, 'request.md');
    const fallbackTitle = humanizeFeatureId(featureId);

    if (existsSync(featurePath)) {
      const featureMarkdown = readFileSync(featurePath, 'utf8');
      const purpose = optionalSection(featureMarkdown, 'Purpose');
      summaries.push({
        featureId,
        title: extractTitle(featureMarkdown, fallbackTitle),
        summary: truncate(purpose || firstParagraphAfterTitle(featureMarkdown), SUMMARY_MAX_LENGTH),
      });
      continue;
    }

    if (existsSync(requestPath)) {
      const requestMarkdown = readFileSync(requestPath, 'utf8');
      summaries.push({
        featureId,
        title: extractTitle(requestMarkdown, fallbackTitle),
        summary: truncate(firstParagraphAfterTitle(requestMarkdown), SUMMARY_MAX_LENGTH),
      });
      continue;
    }

    summaries.push({ featureId, title: fallbackTitle, summary: '' });
  }

  return summaries;
}
