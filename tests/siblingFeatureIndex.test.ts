import { afterEach, describe, expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import { buildSiblingFeatureIndex } from '../src/planner/siblingFeatureIndex.js';

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('buildSiblingFeatureIndex', () => {
  test('returns an empty array when the features root does not exist', () => {
    workspace = createTempWorkspace();
    expect(buildSiblingFeatureIndex(join(workspace.root, 'compassrose/features'))).toEqual([]);
  });

  test('ignores non-numbered directories and files', () => {
    workspace = createTempWorkspace({
      directories: ['compassrose/features/README-not-a-feature', 'compassrose/features/010-generic-external-cli-adapter'],
      files: {
        'compassrose/features/010-generic-external-cli-adapter/request.md':
          '# Request: Generic External CLI Adapter\n\nWe want one generic adapter.\n',
        'compassrose/features/not-a-file.txt': 'ignore me',
      },
    });

    const index = buildSiblingFeatureIndex(join(workspace.root, 'compassrose/features'));
    expect(index.map((entry) => entry.featureId)).toEqual(['010-generic-external-cli-adapter']);
  });

  test('excludes the given feature id', () => {
    workspace = createTempWorkspace({
      files: {
        'compassrose/features/002-configuration-model/request.md': '# Request: Configuration Model\n\nConfig stuff.\n',
        'compassrose/features/010-generic-external-cli-adapter/request.md': '# Request: Generic External CLI Adapter\n\nAdapter stuff.\n',
      },
    });

    const index = buildSiblingFeatureIndex(join(workspace.root, 'compassrose/features'), '002-configuration-model');
    expect(index.map((entry) => entry.featureId)).toEqual(['010-generic-external-cli-adapter']);
  });

  test('prefers feature.md\'s Purpose section over request.md once formalized', () => {
    workspace = createTempWorkspace({
      files: {
        'compassrose/features/006-feature-formalization/request.md': '# Request: Feature Formalization\n\nRaw request text.\n',
        'compassrose/features/006-feature-formalization/feature.md': [
          '# Feature: Feature Formalization',
          '',
          '## Purpose',
          '',
          'Define a repository-local formalization flow.',
          '',
          '## Scope',
          '',
          'unrelated section content',
        ].join('\n'),
      },
    });

    const index = buildSiblingFeatureIndex(join(workspace.root, 'compassrose/features'));
    expect(index).toEqual([
      {
        featureId: '006-feature-formalization',
        title: 'Feature Formalization',
        summary: 'Define a repository-local formalization flow.',
      },
    ]);
  });

  test('falls back to the first paragraph of request.md when unformalized', () => {
    workspace = createTempWorkspace({
      files: {
        'compassrose/features/012-implementation-runner/request.md': [
          '# Request: Implementation Runner',
          '',
          'I want a runner that invokes the configured implementer role.',
          '',
          'It should capture exit status and inspect repository changes.',
        ].join('\n'),
      },
    });

    const index = buildSiblingFeatureIndex(join(workspace.root, 'compassrose/features'));
    expect(index).toEqual([
      {
        featureId: '012-implementation-runner',
        title: 'Implementation Runner',
        summary: 'I want a runner that invokes the configured implementer role.',
      },
    ]);
  });

  test('falls back to a humanized directory name when no title heading is found', () => {
    workspace = createTempWorkspace({
      files: {
        'compassrose/features/014-git-integration/request.md': 'no heading here, just prose.\n',
      },
    });

    const index = buildSiblingFeatureIndex(join(workspace.root, 'compassrose/features'));
    expect(index[0]?.title).toBe('Git Integration');
  });

  test('truncates long summaries with an ellipsis', () => {
    const longSentence = 'word '.repeat(200).trim();
    workspace = createTempWorkspace({
      files: {
        'compassrose/features/018-deterministic-orchestration-loop/request.md': `# Request: Loop\n\n${longSentence}\n`,
      },
    });

    const index = buildSiblingFeatureIndex(join(workspace.root, 'compassrose/features'));
    expect(index[0]?.summary.endsWith('...')).toBe(true);
    expect(index[0]?.summary.length).toBeLessThanOrEqual(323);
  });

  test('handles a feature directory with neither request.md nor feature.md', () => {
    workspace = createTempWorkspace({ directories: ['compassrose/features/099-empty'] });
    mkdirSync(join(workspace.root, 'compassrose/features/099-empty'), { recursive: true });
    writeFileSync(join(workspace.root, 'compassrose/features/099-empty/state.md'), '# State\n', 'utf8');

    const index = buildSiblingFeatureIndex(join(workspace.root, 'compassrose/features'));
    expect(index).toEqual([{ featureId: '099-empty', title: 'Empty', summary: '' }]);
  });

  test('reads the real repository roadmap features without throwing', () => {
    const index = buildSiblingFeatureIndex(join(process.cwd(), 'compassrose/features'));
    expect(index.length).toBeGreaterThanOrEqual(20);
    expect(index.every((entry) => entry.featureId.length > 0 && entry.title.length > 0)).toBe(true);
  });
});
