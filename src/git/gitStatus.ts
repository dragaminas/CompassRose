import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function findGitRepositoryRoot(startDirectory: string): string | null {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    if (existsSync(join(currentDirectory, '.git'))) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

export function isInsideGitRepository(startDirectory: string): boolean {
  return findGitRepositoryRoot(startDirectory) !== null;
}
