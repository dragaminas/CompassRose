import { existsSync, readFileSync } from 'node:fs';

export function readUtf8(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

export function readTextIfExists(path: string): string {
  return existsSync(path) ? readUtf8(path) : '';
}

export function normalizeTextForWrite(text: string): string {
  return `${text.trimEnd()}\n`;
}
