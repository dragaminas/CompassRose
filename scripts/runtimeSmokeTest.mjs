#!/usr/bin/env node
// Real-runtime smoke test: dynamically imports each given module path under whatever loader
// invoked this script (tsx, in the standard quality-gate command below) and reports failure if
// any of them throw during import. vitest tolerates CommonJS-style `require()` inside an ESM
// module via its CJS interop, but a real ESM loader (tsx/node) does not -- this is exactly the
// gap that let `require('node:fs')` inside an ESM module ship past every vitest-based quality
// gate and crash correctState() under the real CLI. Static imports run their whole module graph
// at evaluation time, so importing a single entry point (e.g. src/cli/main.ts) is enough to
// exercise every module it transitively imports.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('runtime-smoke-test: no target modules provided.');
  process.exit(1);
}

let failed = false;
for (const target of targets) {
  const url = pathToFileURL(resolve(target)).href;
  try {
    await import(url);
    console.log(`runtime-smoke-test: imported ${target} successfully under a real ESM runtime.`);
  } catch (error) {
    failed = true;
    console.error(`runtime-smoke-test: failed to import ${target} under a real ESM runtime:`);
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  }
}

process.exit(failed ? 1 : 0);
