/**
 * Deterministic, human-legible rendering of a blocker, shared by the live blocking path
 * (`persistBlockedFeature` in orchestrator.ts) and `npm run doctor` (`scanBlockedWorkItems`).
 *
 * The orchestrator already computes and durably persists a typed `BlockerProfile` for every
 * blocked feature/fix (see `buildBlockedByLines` in orchestrator.ts, written to each item's
 * `state.md` `## Blocked By` section). What was missing was rendering that structure back to a
 * human at the point of failure -- today's only console output is a single, unbounded,
 * frequently AI-authored sentence. This module renders a small, fixed-shape card from the same
 * structured facts instead, truncating deterministically rather than trusting free-text
 * discipline (the AI-authored fields that feed `reason`/`evidence` are additionally bounded by
 * `maxLength` at the schema level -- see the reviewer/diagnostic-autocorrection/blocker-kind
 * contracts -- so this truncation is a last-resort safety net, not the primary control).
 *
 * `scanBlockedWorkItems` deliberately depends on nothing but plain fs + the shared markdown
 * section parsers -- no `CompassRoseOrchestrator` instance. `npm run doctor` must be able to
 * report blocked work without paying for (or requiring) the full orchestrator's contract
 * registry, git client, and CLI adapters, none of which a read-only "what's blocked" listing
 * needs.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readUtf8 } from '../filesystem/textNormalization.js';
import { optionalSection, parseBulletSection, requireSection, stripTicks } from '../markdown/sections.js';

const REASON_MAX_LENGTH = 200;
const EVIDENCE_ITEM_MAX_LENGTH = 160;
const MAX_EVIDENCE_LINES = 2;

export interface BlockerCardInput {
  readonly itemId: string;
  /** Path to the item's state.md, for "go deeper" -- rendered as-is (native separators are fine; a human reads and opens this, it is never compared against a git-reported path). */
  readonly itemPathRelative: string;
  readonly kind: string;
  readonly recoverability: string;
  /** Raw, possibly long and/or multi-line (e.g. a reviewer summary followed by every finding). */
  readonly reason: string;
  /** Raw, possibly many and/or long items. */
  readonly evidence: readonly string[];
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength).trimEnd()}...` : trimmed;
}

function firstNonEmptySegment(reason: string): string {
  const segments = reason
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return segments[0] ?? reason.trim();
}

export function renderBlockerCard(input: BlockerCardInput): string[] {
  const lines: string[] = [
    `=== BLOCKED: ${input.itemId} ===`,
    `kind: ${input.kind}  recoverability: ${input.recoverability}`,
    `what happened: ${truncate(firstNonEmptySegment(input.reason), REASON_MAX_LENGTH)}`,
  ];

  const shownEvidence = input.evidence.slice(0, MAX_EVIDENCE_LINES);
  for (const item of shownEvidence) {
    lines.push(`evidence: ${truncate(item, EVIDENCE_ITEM_MAX_LENGTH)}`);
  }
  const remainingEvidence = input.evidence.length - shownEvidence.length;
  if (remainingEvidence > 0) {
    lines.push(`... and ${remainingEvidence} more (see full detail)`);
  }

  lines.push(`full detail: ${input.itemPathRelative}`);
  return lines;
}

/**
 * Inverse of `buildBlockedByLines` (orchestrator.ts): reconstructs a `BlockerCardInput`'s
 * kind/recoverability/reason/evidence from the exact bullet lines that function wrote into
 * `## Blocked By` (already parsed one level, via `parseBulletSection`, into
 * `FeatureStateSnapshot.blockedBy`). This is this codebase's own fixed bullet format, not free
 * text, so a plain `key: value` split is unambiguous -- no ensemble/AI needed.
 */
export function parseBlockedByBullets(
  itemId: string,
  itemPathRelative: string,
  bulletLines: readonly string[],
): BlockerCardInput {
  const evidence: string[] = [];
  const fields: Record<string, string> = {};

  for (const line of bulletLines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key === 'evidence') {
      evidence.push(value);
    } else {
      fields[key] = value;
    }
  }

  return {
    itemId,
    itemPathRelative,
    kind: fields.kind ?? 'unknown',
    recoverability: fields.recoverability ?? 'human',
    reason: fields.reason ?? '(no reason recorded)',
    evidence,
  };
}

function listBlockedIdsUnder(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root).filter((entry) => statSync(join(root, entry)).isDirectory());
}

/**
 * Every feature/fix directory under `featuresRoot`/`fixesRoot` currently sitting in `blocked` or
 * `review_failed`, rendered into `BlockerCardInput`s via `parseBlockedByBullets` -- the same
 * bounded shape `persistBlockedFeature` already prints live. Read-only; never mutates state.md.
 */
export function scanBlockedWorkItems(input: {
  readonly repositoryRoot: string;
  readonly featuresRoot: string;
  readonly fixesRoot: string;
}): BlockerCardInput[] {
  const cards: BlockerCardInput[] = [];

  for (const root of [input.featuresRoot, input.fixesRoot]) {
    for (const id of listBlockedIdsUnder(root)) {
      const statePath = join(root, id, 'state.md');
      if (!existsSync(statePath)) {
        continue;
      }

      try {
        const markdown = readUtf8(statePath);
        const lifecycleState = stripTicks(requireSection(markdown, 'Lifecycle State').trim());
        if (lifecycleState !== 'blocked' && lifecycleState !== 'review_failed') {
          continue;
        }

        const blockedBy = parseBulletSection(optionalSection(markdown, 'Blocked By')) ?? [];
        cards.push(parseBlockedByBullets(id, relative(input.repositoryRoot, statePath), blockedBy));
      } catch {
        // A malformed state.md is its own, separately-diagnosed problem (state_corruption); it
        // must not prevent this scan from reporting every other item that parses cleanly.
      }
    }
  }

  return cards;
}
