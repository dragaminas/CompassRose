import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

function listSchemaFiles(rootDir: string): string[] {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSchemaFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.schema.json') && statSafe(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function statSafe(path: string): boolean {
  return statSync(path).isFile();
}

function findMissingRequiredKeys(schema: unknown, location: string[] = []): string[] {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const node = schema as Record<string, unknown>;
  const gaps: string[] = [];

  if (node.type === 'object' && node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
    const properties = node.properties as Record<string, unknown>;
    const required = Array.isArray(node.required) ? node.required as string[] : [];
    const missing = Object.keys(properties).filter((key) => !required.includes(key));

    if (missing.length > 0) {
      gaps.push(`${location.join('.') || '<root>'} missing required: ${missing.join(', ')}`);
    }

    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      gaps.push(...findMissingRequiredKeys(propertySchema, [...location, propertyName]));
    }
  }

  if (node.items) {
    gaps.push(...findMissingRequiredKeys(node.items, [...location, 'items']));
  }

  for (const branchKey of ['anyOf', 'allOf', 'oneOf'] as const) {
    const branches = node[branchKey];
    if (Array.isArray(branches)) {
      branches.forEach((branch, index) => {
        gaps.push(...findMissingRequiredKeys(branch, [...location, `${branchKey}[${index}]`]));
      });
    }
  }

  return gaps;
}

describe('contract schemas', () => {
  test('all object properties in schema contracts are required', () => {
    const rootDir = join(process.cwd(), 'src', 'contracts');
    const schemaFiles = listSchemaFiles(rootDir);
    const gaps = schemaFiles.flatMap((filePath) => {
      const schema = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
      return findMissingRequiredKeys(schema).map((gap) => `${relative(process.cwd(), filePath)}: ${gap}`);
    });

    expect(gaps).toEqual([]);
  });
});
