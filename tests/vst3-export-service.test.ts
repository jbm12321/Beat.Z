import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeStereo, type AudioAnalysis } from '../src/features/audio-builder/audio/analysis.ts';
import { freezeProjectRevision } from '../src/features/audio-builder/domain/build.ts';
import { applyProjectCommands, createInitialProject } from '../src/features/audio-builder/domain/project.ts';
import { validateProjectForBuild } from '../src/features/audio-builder/domain/validation.ts';
import { MemoryBuildRepository } from '../src/features/vst3-export/server/repository.ts';
import { Vst3ExportError, createVst3ExportService } from '../src/features/vst3-export/server/service.ts';

function healthyAnalysis(): AudioAnalysis {
  const signal = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(index * 0.1) * 0.2);
  return analyzeStereo([signal, signal], 48000);
}

async function approvedSnapshot() {
  const project = applyProjectCommands(createInitialProject(), [{ type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' }], 'human');
  return freezeProjectRevision(project, validateProjectForBuild(project, healthyAnalysis()));
}

test('the backend switch blocks new work without exposing a UI toggle', async () => {
  const service = createVst3ExportService({ repository: new MemoryBuildRepository(), enabled: false, workerToken: 'test-worker-token-that-is-long-enough' });
  assert.deepEqual(service.capability(), { enabled: false });
  const frozen = await approvedSnapshot();
  await assert.rejects(() => service.submit(frozen), (error: unknown) => error instanceof Vst3ExportError && error.code === 'export_disabled');
});

test('one worker claims one queued job and reports an honest terminal result', async () => {
  const repository = new MemoryBuildRepository();
  const service = createVst3ExportService({ repository, enabled: true, workerToken: 'test-worker-token-that-is-long-enough' });
  const submitted = await service.submit(await approvedSnapshot());
  assert.equal(submitted.status, 'queued');

  await assert.rejects(() => service.claim('wrong-token'), (error: unknown) => error instanceof Vst3ExportError && error.code === 'unauthorized_worker');
  const claimed = await service.claim('test-worker-token-that-is-long-enough');
  assert.equal(claimed?.id, submitted.id);
  assert.equal(claimed?.status, 'building');
  assert.equal(await service.claim('test-worker-token-that-is-long-enough'), null);

  await service.report('test-worker-token-that-is-long-enough', submitted.id, {
    status: 'ready',
    artifact: { filename: 'Test-01234567.vst3', bundleSha256: 'a'.repeat(64), architecture: 'arm64', dspHash: claimed!.request.dspHash },
    evidence: { validatorPassed: true, stateRestorePassed: true, parityPassed: true },
  });
  const completed = await service.status(submitted.id);
  assert.equal(completed.status, 'ready');
  assert.equal(completed.artifact?.filename, 'Test-01234567.vst3');
});

test('a job already building may report after the switch is turned off', async () => {
  const repository = new MemoryBuildRepository();
  const on = createVst3ExportService({ repository, enabled: true, workerToken: 'test-worker-token-that-is-long-enough' });
  const submitted = await on.submit(await approvedSnapshot());
  await on.claim('test-worker-token-that-is-long-enough');
  const off = createVst3ExportService({ repository, enabled: false, workerToken: 'test-worker-token-that-is-long-enough' });
  await off.report('test-worker-token-that-is-long-enough', submitted.id, { status: 'failed', error: 'Compiler failed.' });
  assert.equal((await off.status(submitted.id)).status, 'failed');
  assert.equal(await off.claim('test-worker-token-that-is-long-enough'), null);
});

test('ready is rejected unless validator, state restore, parity, and artifact identity all pass', async () => {
  const repository = new MemoryBuildRepository();
  const service = createVst3ExportService({ repository, enabled: true, workerToken: 'test-worker-token-that-is-long-enough' });
  const submitted = await service.submit(await approvedSnapshot());
  const claimed = await service.claim('test-worker-token-that-is-long-enough');
  await assert.rejects(() => service.report('test-worker-token-that-is-long-enough', submitted.id, {
    status: 'ready',
    artifact: { filename: 'Test-01234567.vst3', bundleSha256: 'a'.repeat(64), architecture: 'arm64', dspHash: claimed!.request.dspHash },
    evidence: { validatorPassed: true, stateRestorePassed: true, parityPassed: false },
  }), (error: unknown) => error instanceof Vst3ExportError && error.code === 'invalid_result');
  assert.equal((await service.status(submitted.id)).status, 'building');
});
