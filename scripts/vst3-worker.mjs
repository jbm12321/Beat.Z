#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises';
import { asNativeBuildFailure } from '../native/lib/errors.mjs';
import { runNativeBuild } from '../native/lib/runner.mjs';
import { assertHttpsEndpoint } from '../native/lib/safety.mjs';

const endpoint = assertHttpsEndpoint(process.env.VST3_EXPORT_ENDPOINT ?? 'http://127.0.0.1:3000', { allowLoopbackHttp: true });
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
    await request(`/api/vst3-worker/${encodeURIComponent(job.id)}/result`, {
      status: 'ready',
      artifact: {
        filename: result.artifact.filename,
        bundleSha256: result.artifact.bundleSha256,
        architecture: result.artifact.architecture,
        dspHash: result.artifact.dspHash,
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

console.log(`VST3 Mac worker connected to ${endpoint.origin}`);
do {
  try {
    const { job } = await request('/api/vst3-worker/claim');
    if (job) await build(job);
  } catch (error) {
    if (once) throw error;
  }
  if (!once) await delay(1500);
} while (!once);
