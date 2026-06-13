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

describe('runtime-precondition policy fields', () => {
  test('exposes typed execution, roles, and git_policy on valid canonical config', () => {
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

      expect(result.value.execution.mode).toBe('interactive');
      expect(result.value.execution.repository_is_source_of_truth).toBe(true);
      expect(result.value.execution.orchestrator_uses_ai).toBe(false);

      expect(result.value.roles.planner.enabled).toBe(true);
      expect(result.value.roles.planner.adapter).toBe('external_cli');
      expect(result.value.roles.implementer.enabled).toBe(true);
      expect(result.value.roles.reviewer.enabled).toBe(true);

      expect(result.value.git_policy.require_clean_worktree_before_task).toBe(true);
      expect(result.value.git_policy.review_target).toBe('git_diff');
      expect(result.value.git_policy.allow_dirty_worktree).toBe(false);
      expect(result.value.git_policy.branch_per_task).toBe('optional');
      expect(result.value.git_policy.commit_after_task).toBe('manual');
    } finally {
      workspace.dispose();
    }
  });

  test('rejects unsupported execution mode values', () => {
    const workspace = createTempWorkspace({
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          'mode: interactive',
          'mode: unknown_mode'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'docs/compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'execution.mode')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects missing required role entries', () => {
    const workspace = createTempWorkspace({
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          /  implementer:\n    enabled: true\n    adapter: external_cli\n\n/,
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

      expect(result.error.some((issue) => issue.field === 'roles.implementer')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects invalid git_policy enum fields', () => {
    const workspace = createTempWorkspace({
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          'review_target: git_diff',
          'review_target: invalid_target'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'docs/compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'git_policy.review_target')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects invalid git_policy boolean fields', () => {
    const workspace = createTempWorkspace({
      files: {
        'docs/compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          'require_clean_worktree_before_task: true',
          'require_clean_worktree_before_task: maybe'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'docs/compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'git_policy.require_clean_worktree_before_task')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });
});
