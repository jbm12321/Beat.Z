#!/usr/bin/env node

import { spawn } from 'node:child_process';

const token = process.env.VST3_WORKER_TOKEN ?? '';
if (token.length < 24 || token.startsWith('REPLACE_')) {
  throw new Error('Set VST3_WORKER_TOKEN to a unique secret of at least 24 characters in .env before starting the VST3 worker.');
}
const liveEndpoint = 'https://audio-effect-builder-bm26.jbm111.chatgpt.site';
const environment = {
  ...process.env,
  VST3_EXPORT_ENABLED: 'true',
  VST3_WORKER_TOKEN: token,
  // Native builds always service the published Beat.Z queue.
  VST3_EXPORT_ENDPOINT: liveEndpoint,
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
