import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeStereo, type AudioAnalysis } from '../src/features/audio-builder/audio/analysis.ts';
import { freezeProjectRevision } from '../src/features/audio-builder/domain/build.ts';
import { applyProjectCommands, createInitialProject } from '../src/features/audio-builder/domain/project.ts';
import { validateProjectForBuild } from '../src/features/audio-builder/domain/validation.ts';
import { STALE_BUILD_TIMEOUT_MS, MemoryBuildRepository } from '../src/features/vst3-export/server/repository.ts';
import { Vst3ExportError, createVst3ExportService } from '../src/features/vst3-export/server/service.ts';

const publicArtifactUrl = 'https://example.supabase.co/storage/v1/object/public/vst3-builds';
const createService = (repository: MemoryBuildRepository) => createVst3ExportService({ repository, workerToken: 'test-worker-token-that-is-long-enough', artifactPublicUrl: publicArtifactUrl });

function healthyAnalysis(): AudioAnalysis {
  const signal = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(index * 0.1) * 0.2);
  return analyzeStereo([signal, signal], 48000);
}

async function approvedSnapshot() {
  const project = applyProjectCommands(createInitialProject(), [{ type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' }], 'human');
  return freezeProjectRevision(project, validateProjectForBuild(project, healthyAnalysis()));
}

test('the separate native service accepts build requests and leaves execution to the worker', async () => {
  const service = createService(new MemoryBuildRepository());
  const frozen = await approvedSnapshot();
  const submitted = await service.submit(frozen);
  assert.equal(submitted.status, 'queued');
});

test('one worker claims one queued job and reports an honest terminal result', async () => {
  const repository = new MemoryBuildRepository();
  const service = createService(repository);
  const submitted = await service.submit(await approvedSnapshot());
  assert.equal(submitted.status, 'queued');

  await assert.rejects(() => service.claim('wrong-token'), (error: unknown) => error instanceof Vst3ExportError && error.code === 'unauthorized_worker');
  const claimed = await service.claim('test-worker-token-that-is-long-enough');
  assert.equal(claimed?.id, submitted.id);
  assert.equal(claimed?.status, 'building');
  assert.equal(await service.claim('test-worker-token-that-is-long-enough'), null);

  await service.report('test-worker-token-that-is-long-enough', submitted.id, {
    status: 'ready',
    artifact: { filename: 'Test-01234567.vst3', bundleSha256: 'a'.repeat(64), architecture: 'arm64', dspHash: claimed!.request.dspHash, objectKey: `builds/${submitted.id}/Test-01234567.vst3.zip`, downloadUrl: `${publicArtifactUrl}/builds/${submitted.id}/Test-01234567.vst3.zip` },
    evidence: { validatorPassed: true, stateRestorePassed: true, parityPassed: true },
  });
  const completed = await service.status(submitted.id);
  assert.equal(completed.status, 'ready');
  assert.equal(completed.artifact?.filename, 'Test-01234567.vst3');
});

test('an abandoned building job expires so the next queued job can be claimed', async () => {
  const repository = new MemoryBuildRepository();
  const service = createService(repository);
  const abandoned = await service.submit(await approvedSnapshot());
  await service.claim('test-worker-token-that-is-long-enough');
  const waiting = await service.submit(await approvedSnapshot());

  const afterLeaseExpires = new Date(Date.now() + STALE_BUILD_TIMEOUT_MS + 1_000).toISOString();
  const claimed = await repository.claimOldest(afterLeaseExpires);

  assert.equal(claimed?.id, waiting.id);
  assert.equal(claimed?.status, 'building');
  const recovered = await repository.get(abandoned.id);
  assert.equal(recovered?.status, 'failed');
  assert.equal(recovered?.error, 'The build timed out on the Mac worker.');
});

test('a job already building may report while the site remains available', async () => {
  const repository = new MemoryBuildRepository();
  const service = createService(repository);
  const submitted = await service.submit(await approvedSnapshot());
  await service.claim('test-worker-token-that-is-long-enough');
  await service.report('test-worker-token-that-is-long-enough', submitted.id, { status: 'failed', error: 'Compiler failed.' });
  assert.equal((await service.status(submitted.id)).status, 'failed');
  assert.equal(await service.claim('test-worker-token-that-is-long-enough'), null);
});

test('ready is rejected unless validator, state restore, parity, and artifact identity all pass', async () => {
  const repository = new MemoryBuildRepository();
  const service = createService(repository);
  const submitted = await service.submit(await approvedSnapshot());
  const claimed = await service.claim('test-worker-token-that-is-long-enough');
  await assert.rejects(() => service.report('test-worker-token-that-is-long-enough', submitted.id, {
    status: 'ready',
    artifact: { filename: 'Test-01234567.vst3', bundleSha256: 'a'.repeat(64), architecture: 'arm64', dspHash: claimed!.request.dspHash, objectKey: `builds/${submitted.id}/Test-01234567.vst3.zip`, downloadUrl: `${publicArtifactUrl}/builds/${submitted.id}/Test-01234567.vst3.zip` },
    evidence: { validatorPassed: true, stateRestorePassed: true, parityPassed: false },
  }), (error: unknown) => error instanceof Vst3ExportError && error.code === 'invalid_result');
  assert.equal((await service.status(submitted.id)).status, 'building');
});
