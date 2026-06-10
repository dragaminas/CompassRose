import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readProjectConfiguration } from '../src/config/configReader.js';
import { createTempWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

describe('project configuration loader', () => {
  test('loads the canonical project-local configuration from CONFIG.md', () => {
    const workspace = createTempWorkspace({
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'docs/compassrose/CONFIG.md'));

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.project.name).toBe('compassrose');
      expect(result.value.project.documentation_root).toBe('docs');
      expect(result.value.commands.build).toBe('npm run build');
      expect(result.value.adapters.external_cli.type).toBe('external_cli');
    } finally {
      workspace.dispose();
    }
  });

  test('rejects configuration that omits a required command key', () => {
    const workspace = createTempWorkspace({
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          /  lint: "npm run lint"\n/,
          ''
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'docs/compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'commands.lint')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });
});
