import { existsSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export function resolveRepositoryRelativePath(repositoryRoot: string, configuredPath: string): string | null {
  if (configuredPath.trim().length === 0 || isAbsolute(configuredPath)) {
    return null;
  }

  const resolvedPath = resolve(repositoryRoot, configuredPath);
  const relativePath = relative(repositoryRoot, resolvedPath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null;
  }

  return resolvedPath;
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

export function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}
