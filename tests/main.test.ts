import { describe, expect, test } from 'vitest';
import { main } from '../src/cli/main.js';
import { createTempWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

describe('main — runtime preflight', () => {
  test('returns non-zero exit code when roles.planner.enabled is false', () => {
    const workspace = createTempWorkspace({
      directories: ['.git', 'src/contracts'],
      files: {
        'docs/compassrose/CONFIG.md':
          readFixtureConfigMarkdown().replace(
            '    enabled: true\n    adapter: external_cli\n\n  implementer:',
            '    enabled: false\n    adapter: external_cli\n\n  implementer:',
          ),
        'docs/compassrose/PROJECT_STATE.md': '# State: Test\n\n## Status\n\nIn progress\n',
        'docs/ROADMAP.md': '# roadmap\n',
      },
    });

    try {
      const stderrMessages: string[] = [];
      const exitCode = main([], {
        cwd: workspace.root,
        stderr: (msg: string) => stderrMessages.push(msg),
      });

      expect(exitCode).toBe(1);
      expect(stderrMessages.join('\n')).toContain('planner');
    } finally {
      workspace.dispose();
    }
  });
});
