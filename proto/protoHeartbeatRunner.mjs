#!/usr/bin/env node
import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { spawn } from 'node:child_process';

const DEFAULT_HEARTBEAT_MS = 15_000;

const rawConfig = process.env.PROTO_COMPASSROSE_HEARTBEAT_CONFIG;
if (!rawConfig) {
  process.stderr.write('Missing PROTO_COMPASSROSE_HEARTBEAT_CONFIG.\n');
  process.exit(1);
}

let config;
try {
  config = JSON.parse(rawConfig);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to parse PROTO_COMPASSROSE_HEARTBEAT_CONFIG: ${message}\n`);
  process.exit(1);
}

if (!isValidConfig(config)) {
  process.stderr.write('Invalid heartbeat runner configuration.\n');
  process.exit(1);
}

const prompt = readFileSync(config.promptPath);
const stdoutFd = openSync(config.stdoutPath, 'w');
const stderrFd = openSync(config.stderrPath, 'w');
const prefix = `[${config.agent}:${config.label}]`;
const heartbeatIntervalMs = normalizeHeartbeatInterval(config.heartbeatIntervalMs);
const startedAt = Date.now();
let lastOutputAt = startedAt;
let stdoutBytes = 0;
let stderrBytes = 0;
let cleanedUp = false;

const cleanup = () => {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;
  closeSync(stdoutFd);
  closeSync(stderrFd);
};

const formatDuration = (durationMs) => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }

  return `${seconds}s`;
};

const formatBytes = (byteCount) => {
  if (byteCount < 1024) {
    return `${byteCount}B`;
  }

  if (byteCount < 1024 * 1024) {
    return `${(byteCount / 1024).toFixed(byteCount < 10 * 1024 ? 1 : 0)}kB`;
  }

  return `${(byteCount / (1024 * 1024)).toFixed(1)}MB`;
};

const heartbeat = () => {
  const elapsed = Date.now() - startedAt;
  const idleMs = Date.now() - lastOutputAt;
  const activityState = stdoutBytes === 0 && stderrBytes === 0
    ? 'no child output yet'
    : idleMs >= heartbeatIntervalMs
      ? `idle for ${formatDuration(idleMs)}`
      : `active ${formatDuration(idleMs)} ago`;

  process.stderr.write(
    `${prefix} running for ${formatDuration(elapsed)} (${activityState}, stdout ${formatBytes(stdoutBytes)}, stderr ${formatBytes(stderrBytes)})\n`,
  );
};

const childArgs = config.promptMode === 'arg'
  ? [...config.args, prompt.toString('utf8')]
  : config.args;

const child = spawn(config.command, childArgs, {
  cwd: config.cwd,
  stdio: config.promptMode === 'arg' ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});

if (config.promptMode === 'stdin' && child.stdin) {
  child.stdin.end(prompt);
}

child.stdout.on('data', (chunk) => {
  stdoutBytes += chunk.length;
  lastOutputAt = Date.now();
  writeSync(stdoutFd, chunk);
});

child.stderr.on('data', (chunk) => {
  stderrBytes += chunk.length;
  lastOutputAt = Date.now();
  writeSync(stderrFd, chunk);
});

process.stderr.write(`${prefix} monitoring ${config.command}; heartbeat every ${Math.round(heartbeatIntervalMs / 1000)}s\n`);
const interval = setInterval(heartbeat, heartbeatIntervalMs);

child.on('error', (error) => {
  clearInterval(interval);
  cleanup();
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${prefix} failed to start: ${message}\n`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  clearInterval(interval);
  cleanup();

  if (signal === 'SIGINT') {
    process.kill(process.pid, 'SIGINT');
  }

  if (signal === 'SIGTERM') {
    process.kill(process.pid, 'SIGTERM');
  }

  process.exit(code ?? 1);
});

function normalizeHeartbeatInterval(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_HEARTBEAT_MS;
  }

  return Math.floor(numeric);
}

function isValidConfig(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.agent === 'string' &&
    typeof value.label === 'string' &&
    typeof value.command === 'string' &&
    Array.isArray(value.args) &&
    value.args.every((entry) => typeof entry === 'string') &&
    typeof value.cwd === 'string' &&
    typeof value.promptPath === 'string' &&
    (value.promptMode === 'stdin' || value.promptMode === 'arg') &&
    typeof value.stdoutPath === 'string' &&
    typeof value.stderrPath === 'string'
  );
}
