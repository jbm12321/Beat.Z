#!/usr/bin/env node

import { spawn } from 'node:child_process';

const token = process.env.VST3_WORKER_TOKEN ?? 'beatz-local-demo-worker-token-2026';
const environment = {
  ...process.env,
  VST3_EXPORT_ENABLED: 'true',
  VST3_WORKER_TOKEN: token,
  VST3_EXPORT_ENDPOINT: process.env.VST3_EXPORT_ENDPOINT ?? 'http://127.0.0.1:3000',
};
const children = [
  spawn('npm', ['run', 'dev'], { stdio: 'inherit', env: environment }),
  spawn(process.execPath, ['scripts/vst3-worker.mjs'], { stdio: 'inherit', env: environment }),
];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill(signal));
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
children.forEach((child) => child.on('exit', (code) => {
  if (!stopping && code) {
    stop();
    process.exitCode = code;
  }
}));
