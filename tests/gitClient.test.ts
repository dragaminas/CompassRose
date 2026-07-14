import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import { GitClient } from '../src/git/gitClient.js';

function initGitRepo(root: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
}

function commitAll(root: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: root });
}

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('GitClient', () => {
  test('headCommit returns the current HEAD sha after a commit', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');

    const client = new GitClient(workspace.root);
    expect(client.headCommit()).toMatch(/^[0-9a-f]{40}$/);
  });

  test('dirtyPaths reports untracked and modified files', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');

    writeFileSync(join(workspace.root, 'README.md'), 'changed\n', 'utf8');
    writeFileSync(join(workspace.root, 'new.txt'), 'new\n', 'utf8');

    const client = new GitClient(workspace.root);
    expect(client.dirtyPaths().sort()).toEqual(['README.md', 'new.txt']);
  });

  test('ensureCleanWorktree throws when dirty paths are not allowed by prefix', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');
    writeFileSync(join(workspace.root, 'new.txt'), 'new\n', 'utf8');

    const client = new GitClient(workspace.root);
    expect(() => client.ensureCleanWorktree()).toThrow(/Disallowed dirty paths/);
  });

  test('ensureCleanWorktree passes when all dirty paths match an allowed prefix', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' }, directories: ['scratch'] });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');
    writeFileSync(join(workspace.root, 'scratch', 'notes.txt'), 'new\n', 'utf8');

    const client = new GitClient(workspace.root);
    expect(() => client.ensureCleanWorktree(['scratch'])).not.toThrow();
  });

  test('diffNameOnly reports untracked, unstaged, and staged changes without duplicates', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');

    writeFileSync(join(workspace.root, 'README.md'), 'changed\n', 'utf8');
    writeFileSync(join(workspace.root, 'new.txt'), 'new\n', 'utf8');
    execFileSync('git', ['add', 'README.md'], { cwd: workspace.root });

    const client = new GitClient(workspace.root);
    expect(client.diffNameOnly().sort()).toEqual(['README.md', 'new.txt']);
  });

  test('diffNameOnly excludes paths passed as excludedPaths', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');
    writeFileSync(join(workspace.root, 'README.md'), 'changed\n', 'utf8');
    writeFileSync(join(workspace.root, 'new.txt'), 'new\n', 'utf8');

    const client = new GitClient(workspace.root);
    expect(client.diffNameOnly(['README.md'])).toEqual(['new.txt']);
  });

  test('diffPatch produces a non-empty patch covering unstaged, staged, and untracked changes', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');
    writeFileSync(join(workspace.root, 'README.md'), 'changed\n', 'utf8');
    writeFileSync(join(workspace.root, 'new.txt'), 'new\n', 'utf8');

    const client = new GitClient(workspace.root);
    const patch = client.diffPatch();
    expect(patch).toContain('README.md');
    expect(patch).toContain('new.txt');
  });

  test('diffNameOnlyBetween and diffPatchBetween compare two explicit refs', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');
    const client = new GitClient(workspace.root);
    const before = client.headCommit();

    writeFileSync(join(workspace.root, 'README.md'), 'changed\n', 'utf8');
    commitAll(workspace.root, 'second commit');
    const after = client.headCommit();

    expect(client.diffNameOnlyBetween(before, after)).toEqual(['README.md']);
    expect(client.diffPatchBetween(before, after)).toContain('README.md');
  });

  test('commit stages the given paths and creates a new HEAD commit', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');
    const client = new GitClient(workspace.root);
    const before = client.headCommit();

    writeFileSync(join(workspace.root, 'new.txt'), 'new\n', 'utf8');
    client.commit(['new.txt'], 'add new file');

    expect(client.headCommit()).not.toBe(before);
    expect(client.dirtyPaths()).toEqual([]);
  });

  test('commit throws when given no paths', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');
    const client = new GitClient(workspace.root);

    expect(() => client.commit([], 'nothing')).toThrow(/Refusing to commit with no paths/);
  });

  test('commit throws when the given paths have nothing staged to commit', () => {
    workspace = createTempWorkspace({ files: { 'README.md': 'hello\n' } });
    initGitRepo(workspace.root);
    commitAll(workspace.root, 'initial commit');
    const client = new GitClient(workspace.root);

    expect(() => client.commit(['README.md'], 'no-op')).toThrow(/No staged changes found for commit/);
  });
});
