import { dirname, join } from 'node:path';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { normalizeTextForWrite, readUtf8 } from '../filesystem/textNormalization.js';

export class ArtifactStore {
  private readonly root: string;

  constructor(repositoryRoot: string) {
    this.root = join(repositoryRoot, '.git', 'proto-compassrose');
    mkdirSync(this.root, { recursive: true });
  }

  writeJson(relativePath: string, value: unknown): void {
    const targetPath = join(this.root, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  readJson<T>(relativePath: string): T | null {
    const targetPath = join(this.root, relativePath);
    try {
      return JSON.parse(readUtf8(targetPath)) as T;
    } catch {
      return null;
    }
  }

  listFiles(relativePath: string): readonly { name: string; fullPath: string; mtimeMs: number }[] {
    const targetDir = join(this.root, relativePath);
    try {
      return readdirSync(targetDir)
        .map((name) => {
          const fullPath = join(targetDir, name);
          const stat = statSync(fullPath);
          return {
            name,
            fullPath,
            mtimeMs: stat.mtimeMs,
          };
        })
        .filter((entry) => entry.fullPath.length > 0);
    } catch {
      return [];
    }
  }

  writeText(relativePath: string, value: string): string {
    const targetPath = join(this.root, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, normalizeTextForWrite(value), 'utf8');
    return targetPath;
  }

  writeRawText(relativePath: string, value: string): string {
    const targetPath = join(this.root, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, value, 'utf8');
    return targetPath;
  }
}
