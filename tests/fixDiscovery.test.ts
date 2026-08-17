import { describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { CompassRoseOrchestrator } from '../src/orchestrator/orchestrator.js';
import type { FixRecord } from '../src/contracts/runtime/protoRuntime.js';
import { copyContractsIntoWorkspace, readFixtureConfigMarkdown } from './testUtils.js';

function createWorkspace(files: Record<string, string> = {}): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'compassrose-fix-discovery-'));
  if (!existsSync(join(root, '.git'))) {
    mkdirSync(join(root, '.git'), { recursive: true });
  }
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

interface FixDiscoveryAccess {
  listFixes(): FixRecord[];
  loadFix(fixId: string): FixRecord;
}

function asFixDiscovery(orchestrator: CompassRoseOrchestrator): FixDiscoveryAccess {
  return orchestrator as unknown as FixDiscoveryAccess;
}

describe('fix discovery (listFixes/loadFix)', () => {
  test('lists fixes under fixes_root sorted by numeric id, mirroring listFeatures', () => {
    const workspace = createWorkspace({
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/fixes/002-second-fix/request.md': '# Request: Second Fix\n',
      'compassrose/fixes/001-first-fix/request.md': '# Request: First Fix\n',
    });
    copyContractsIntoWorkspace(workspace.root);

    try {
      const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
      const fixes = asFixDiscovery(orchestrator).listFixes();

      expect(fixes.map((fix) => fix.id)).toEqual(['001-first-fix', '002-second-fix']);
      expect(fixes[0].name).toBe('first-fix');
      expect(fixes[0].fixPath.replace(/\\/g, '/')).toContain('compassrose/fixes/001-first-fix/fix.md');
      expect(fixes[0].statePath.replace(/\\/g, '/')).toContain('compassrose/fixes/001-first-fix/state.md');
      expect(fixes[0].tasksDirectory.replace(/\\/g, '/')).toContain('compassrose/fixes/001-first-fix/tasks');
      expect('architecturePath' in fixes[0]).toBe(false);
    } finally {
      workspace.dispose();
    }
  });

  test('returns an empty list when fixes_root does not exist yet', () => {
    const workspace = createWorkspace({
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
    });
    copyContractsIntoWorkspace(workspace.root);

    try {
      const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
      expect(asFixDiscovery(orchestrator).listFixes()).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  test('loadFix returns the matching record', () => {
    const workspace = createWorkspace({
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
      'compassrose/fixes/003-a-fix/request.md': '# Request: A Fix\n',
    });
    copyContractsIntoWorkspace(workspace.root);

    try {
      const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
      const fix = asFixDiscovery(orchestrator).loadFix('003-a-fix');
      expect(fix.id).toBe('003-a-fix');
    } finally {
      workspace.dispose();
    }
  });

  test('loadFix throws for an id not found under fixes_root', () => {
    const workspace = createWorkspace({
      'compassrose/CONFIG.md': readFixtureConfigMarkdown(),
    });
    copyContractsIntoWorkspace(workspace.root);

    try {
      const orchestrator = new CompassRoseOrchestrator({ loop: false, commit: false, cwd: workspace.root, implementer: 'opencode' });
      expect(() => asFixDiscovery(orchestrator).loadFix('999-missing')).toThrow(/was not found under/);
    } finally {
      workspace.dispose();
    }
  });
});
