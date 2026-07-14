import { dirname } from 'node:path';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { normalizeTextForWrite } from '../filesystem/textNormalization.js';

export function compareFeatureIds(left: string, right: string): number {
  const leftNumber = Number.parseInt(left.split('-')[0] ?? '0', 10);
  const rightNumber = Number.parseInt(right.split('-')[0] ?? '0', 10);
  return leftNumber - rightNumber;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readPositiveInteger(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function createRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '--').replace('Z', '')}`;
}

export function statSafeIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function writeText(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, normalizeTextForWrite(contents), 'utf8');
}

export function requireString(value: string | null, field: string): string {
  if (!value) {
    throw new Error(`Missing required field ${field}.`);
  }

  return value;
}

export function requireNonNoneValue(value: string | null | undefined, message: string): string {
  if (!value || value === 'none') {
    throw new Error(message);
  }

  return value;
}

export function primaryTaskAnchorFromId(taskId: string): string {
  const match = taskId.match(/^(F\d+-T\d+)/);
  return match?.[1] ?? taskId;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
