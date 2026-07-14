import { afterEach, describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempWorkspace, type TempWorkspace } from './testUtils.js';
import { ArtifactStore } from '../src/artifacts/artifactStore.js';

let workspace: TempWorkspace | undefined;

afterEach(() => {
  workspace?.dispose();
  workspace = undefined;
});

describe('ArtifactStore', () => {
  test('constructor creates the .git/proto-compassrose root', () => {
    workspace = createTempWorkspace({ directories: ['.git'] });
    new ArtifactStore(workspace.root);
    expect(existsSync(join(workspace.root, '.git', 'proto-compassrose'))).toBe(true);
  });

  test('writeJson then readJson round-trips a value', () => {
    workspace = createTempWorkspace({ directories: ['.git'] });
    const store = new ArtifactStore(workspace.root);
    store.writeJson('tasks/F001-T01.json', { taskId: 'F001-T01', ok: true });
    expect(store.readJson('tasks/F001-T01.json')).toEqual({ taskId: 'F001-T01', ok: true });
  });

  test('readJson returns null when the file does not exist', () => {
    workspace = createTempWorkspace({ directories: ['.git'] });
    const store = new ArtifactStore(workspace.root);
    expect(store.readJson('missing/does-not-exist.json')).toBeNull();
  });

  test('readJson returns null when the file contains invalid JSON', () => {
    workspace = createTempWorkspace({ directories: ['.git'] });
    const store = new ArtifactStore(workspace.root);
    store.writeRawText('broken.json', 'not json{{{');
    expect(store.readJson('broken.json')).toBeNull();
  });

  test('listFiles reports name/fullPath/mtimeMs for each file in a directory', () => {
    workspace = createTempWorkspace({ directories: ['.git'] });
    const store = new ArtifactStore(workspace.root);
    store.writeJson('tasks/a.json', { a: 1 });
    store.writeJson('tasks/b.json', { b: 2 });

    const files = store.listFiles('tasks');
    expect(files.map((f) => f.name).sort()).toEqual(['a.json', 'b.json']);
    for (const file of files) {
      expect(file.fullPath.length).toBeGreaterThan(0);
      expect(typeof file.mtimeMs).toBe('number');
    }
  });

  test('listFiles returns an empty array when the directory does not exist', () => {
    workspace = createTempWorkspace({ directories: ['.git'] });
    const store = new ArtifactStore(workspace.root);
    expect(store.listFiles('nonexistent')).toEqual([]);
  });

  test('writeText normalizes trailing whitespace to a single trailing newline', () => {
    workspace = createTempWorkspace({ directories: ['.git'] });
    const store = new ArtifactStore(workspace.root);
    const path = store.writeText('notes.md', 'hello\n\n\n');
    expect(readFileSync(path, 'utf8')).toBe('hello\n');
  });

  test('writeRawText writes the value without normalization', () => {
    workspace = createTempWorkspace({ directories: ['.git'] });
    const store = new ArtifactStore(workspace.root);
    const path = store.writeRawText('raw.txt', 'no newline at end');
    expect(readFileSync(path, 'utf8')).toBe('no newline at end');
  });
});
