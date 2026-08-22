import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readProjectConfiguration } from '../src/config/configReader.js';
import { createTempWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

const minimalMvpConfig = [
  '# CompassRose Project Configuration',
  '',
  '## Configuration',
  '',
  '```yaml',
  'project:',
  '  name: compassrose',
  '  supported_platforms:',
  '    - linux',
  '    - windows',
  '  documentation_root: docs',
  '',
  'adapters:',
  '  external_cli:',
  '    type: external_cli',
  '',
  'commands:',
  '  typecheck: "npm run typecheck"',
  '  tests: "npm test"',
  '  lint: ""',
  '  build: ""',
  '',
  'documentation:',
  '  roadmap: compassrose/ROADMAP.md',
  '  project_state: compassrose/PROJECT_STATE.md',
  '  config: compassrose/CONFIG.md',
  '  contracts_root: src/contracts',
  '```',
].join('\n');

describe('project configuration loader', () => {
  test('accepts a minimal MVP configuration with only required fields', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': minimalMvpConfig,
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.project.name).toBe('compassrose');
      expect(result.value.project.supported_platforms).toEqual(['linux', 'windows']);
      expect(result.value.project.documentation_root).toBe('docs');
      expect(result.value.adapters.external_cli.type).toBe('external_cli');
      expect(result.value.commands.typecheck).toBe('npm run typecheck');
      expect(result.value.commands.tests).toBe('npm test');
      expect(result.value.commands.lint).toBe('');
      expect(result.value.commands.build).toBe('');
      expect(result.value.documentation.roadmap).toBe('compassrose/ROADMAP.md');
      expect(result.value.documentation.project_state).toBe('compassrose/PROJECT_STATE.md');
      expect(result.value.documentation.config).toBe('compassrose/CONFIG.md');
      expect(result.value.documentation.contracts_root).toBe('src/contracts');
      expect(result.value.git_policy.require_clean_worktree_before_task).toBe(true);
      expect(result.value.git_policy.review_target).toBe('git_diff');
      expect(result.value.git_policy.allow_dirty_worktree).toBe(false);
      expect(result.value.git_policy.branch_per_task).toBe('disabled');
      expect(result.value.git_policy.commit_after_task).toBe('disabled');
    } finally {
      workspace.dispose();
    }
  });

  test('loads the canonical project-local configuration from CONFIG.md', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

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

  test('preserves existing top-level platform values from canonical configuration', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.project.supported_platforms).toEqual(['linux', 'windows']);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects configuration that omits a required command key', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          /  lint: "npm run lint"\n/,
          ''
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

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
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

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
        'compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          'mode: interactive',
          'mode: unknown_mode'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

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
        'compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          /  implementer:\n    enabled: true\n    adapter: external_cli\n\n/,
          ''
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

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
        'compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          'review_target: git_diff',
          'review_target: invalid_target'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

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
        'compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          'require_clean_worktree_before_task: true',
          'require_clean_worktree_before_task: maybe'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

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

describe('policy sections: development_policy, review_policy, quality_gates, and limits', () => {
  test('exposes canonical development_policy, review_policy, quality_gates, and limits values from valid canonical config', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.development_policy.default).toBe('implementation_first');

      expect(result.value.review_policy.mode).toBe('required');
      expect(result.value.review_policy.record_skipped_review).toBe(true);

      expect(result.value.quality_gates.enabled).toBe(true);
      expect(result.value.quality_gates.required).toEqual(['typecheck', 'tests']);
      expect(result.value.quality_gates.optional).toEqual(['lint', 'build']);

      expect(result.value.limits.max_tasks_per_run).toBe(50);
      expect(result.value.limits.max_retries_per_task).toBe(1);
      expect(result.value.limits.max_review_iterations).toBe(1);
      expect(result.value.limits.stop_on_quality_gate_failure).toBe(true);
      expect(result.value.limits.stop_on_review_failure).toBe(true);
      // Optional field (ADR-0041): the canonical fixture opts in.
      expect(result.value.limits.max_ai_calls_per_run).toBe(200);
    } finally {
      workspace.dispose();
    }
  });

  test('accepts an explicit 0 for optional non-negative limits as a real, distinct value', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown()
          .replace(/max_ai_calls_per_run:\s*\d+/, 'max_ai_calls_per_run: 0'),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.limits.max_ai_calls_per_run).toBe(0);
    } finally {
      workspace.dispose();
    }
  });

  test('treats a key with no inline value (parses to null) the same as an absent optional limit', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown()
          .replace(/max_ai_calls_per_run:\s*\d+/, 'max_ai_calls_per_run:'),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.limits.max_ai_calls_per_run).toBeUndefined();
    } finally {
      workspace.dispose();
    }
  });

  test('rejects invalid development_policy.default enum value', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          'default: implementation_first',
          'default: unknown_policy'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'development_policy.default')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects invalid review_policy.mode enum value', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          'mode: required',
          'mode: unknown_mode'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'review_policy.mode')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects non-string entries in quality_gates.required', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          '    - typecheck\n    - tests',
          '    - typecheck\n    - 42'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'quality_gates.required')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects non-integer limit values', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown().replace(
          '  max_retries_per_task: 1',
          '  max_retries_per_task: -5'
        ),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'limits.max_retries_per_task')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects malformed present optional adapter fields', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': [
          '# CompassRose Project Configuration',
          '',
          '## Configuration',
          '',
          '```yaml',
          'project:',
          '  name: compassrose',
          '  supported_platforms:',
          '    - linux',
          '    - windows',
          '  documentation_root: docs',
          '',
          'adapters:',
          '  external_cli:',
          '    type: external_cli',
          '    command: 42',
          '',
          'commands:',
          '  typecheck: "npm run typecheck"',
          '  tests: "npm test"',
          '  lint: ""',
          '  build: ""',
          '',
          'documentation:',
          '  roadmap: compassrose/ROADMAP.md',
          '  project_state: compassrose/PROJECT_STATE.md',
          '  config: compassrose/CONFIG.md',
          '  contracts_root: src/contracts',
          '```',
        ].join('\n'),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'adapters.external_cli.command')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects non-object optional policy sections', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': [
          '# CompassRose Project Configuration',
          '',
          '## Configuration',
          '',
          '```yaml',
          'project:',
          '  name: compassrose',
          '  supported_platforms:',
          '    - linux',
          '    - windows',
          '  documentation_root: docs',
          '',
          'execution: null',
          '',
          'adapters:',
          '  external_cli:',
          '    type: external_cli',
          '',
          'commands:',
          '  typecheck: "npm run typecheck"',
          '  tests: "npm test"',
          '  lint: ""',
          '  build: ""',
          '',
          'documentation:',
          '  roadmap: compassrose/ROADMAP.md',
          '  project_state: compassrose/PROJECT_STATE.md',
          '  config: compassrose/CONFIG.md',
          '  contracts_root: src/contracts',
          '```',
        ].join('\n'),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error.some((issue) => issue.field === 'execution')).toBe(true);
    } finally {
      workspace.dispose();
    }
  });

  test('rejects boolean value in review_policy.record_skipped_review when string expected is not enforced (boolean is valid)', () => {
    const workspace = createTempWorkspace({
      files: {
        'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      },
    });

    try {
      const result = readProjectConfiguration(join(workspace.root, 'compassrose/CONFIG.md'));

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.review_policy.record_skipped_review).toBe(true);
    } finally {
      workspace.dispose();
    }
  });
});
