#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises';
import { asNativeBuildFailure } from '../native/lib/errors.mjs';
import { publishVerifiedVst3Bundle } from '../native/lib/publish.mjs';
import { runNativeBuild } from '../native/lib/runner.mjs';
import { assertHttpsEndpoint } from '../native/lib/safety.mjs';

const liveEndpoint = 'https://audio-effect-builder-bm26.jbm111.chatgpt.site';
const endpoint = assertHttpsEndpoint(process.env.VST3_EXPORT_ENDPOINT ?? liveEndpoint);
if (endpoint.origin !== liveEndpoint) {
  throw new Error(`VST3_EXPORT_ENDPOINT must point to ${liveEndpoint}.`);
}
const token = process.env.VST3_WORKER_TOKEN ?? '';
const once = process.argv.includes('--once');
if (token.length < 24) throw new Error('VST3_WORKER_TOKEN must contain at least 24 characters.');

async function request(path, body) {
  const response = await fetch(new URL(path, endpoint), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Worker request failed with ${response.status}.`);
  return payload;
}

async function build(job) {
  console.log(`Building ${job.request.dsp.pluginName} (${job.request.dspHash.slice(0, 8)})`);
  try {
    const result = await runNativeBuild(job.request, {
      environment: process.env,
      onPhase: (_phase, message) => console.log(message),
    });
    const published = await publishVerifiedVst3Bundle(result.artifact.path, {
      jobId: job.id,
      filename: result.artifact.filename,
      environment: process.env,
    });
    await request(`/api/vst3-worker/${encodeURIComponent(job.id)}/result`, {
      status: 'ready',
      artifact: {
        filename: result.artifact.filename,
        bundleSha256: result.artifact.bundleSha256,
        architecture: result.artifact.architecture,
        dspHash: result.artifact.dspHash,
        objectKey: published.objectKey,
        downloadUrl: published.downloadUrl,
      },
      evidence: {
        validatorPassed: result.evidence.validatorPassed,
        stateRestorePassed: result.evidence.stateRestorePassed,
        parityPassed: result.evidence.parityPassed,
      },
    });
    console.log(`Ready: ${result.artifact.path}`);
  } catch (error) {
    const failure = asNativeBuildFailure(error);
    await request(`/api/vst3-worker/${encodeURIComponent(job.id)}/result`, { status: 'failed', error: failure.message });
    console.error(`Build failed: ${failure.message}`);
  }
}

let connected = false;
let lastPollError = '';
console.log(`VST3 Mac worker configured for ${endpoint.origin}`);
do {
  try {
    const { job } = await request('/api/vst3-worker/claim');
    if (!connected) console.log(`VST3 Mac worker connected to ${endpoint.origin}`);
    connected = true;
    lastPollError = '';
    if (job) await build(job);
  } catch (error) {
    if (once) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastPollError) console.error('Error.');
    connected = false;
    lastPollError = message;
  }
  if (!once) await delay(1500);
} while (!once);
