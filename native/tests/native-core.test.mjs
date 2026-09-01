import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { saveVerifiedVst3Bundle } from '../lib/artifact.mjs';
import { createNativeGenerationPlan, deriveNativeIdentity, defaultExportRoot, materializeNativeTemplates } from '../lib/generation.mjs';
import { compareStereoParity, createParityScenarios } from '../lib/parity.mjs';
import { publicArtifactDetails } from '../lib/publish.mjs';
import { loadToolchainLock, validateNativeBuildRequest } from '../lib/spec.mjs';
import { analyzeStereo } from '../../src/features/audio-builder/audio/analysis.ts';
import { freezeProjectRevision } from '../../src/features/audio-builder/domain/build.ts';
import { applyProjectCommands, createInitialProject } from '../../src/features/audio-builder/domain/project.ts';
import { validateProjectForBuild } from '../../src/features/audio-builder/domain/validation.ts';
import { createNativeBuildRequest } from '../../src/features/vst3-export/contract.ts';

test('native identity is stable per project while artifact hashes can change', () => {
  assert.deepEqual(deriveNativeIdentity('project-123'), deriveNativeIdentity('project-123'));
  assert.notDeepEqual(deriveNativeIdentity('project-123'), deriveNativeIdentity('project-456'));
});

test('the default artifact destination is the normal Downloads folder', () => {
  assert.equal(defaultExportRoot({ HOME: '/Users/demo' }), '/Users/demo/Downloads');
});

test('each public artifact URL is a unique, predictable ZIP release URL', () => {
  const jobId = '01234567-89ab-cdef-0123-456789abcdef';
  assert.deepEqual(publicArtifactDetails({
    jobId,
    filename: 'Test-01234567.vst3',
    bucket: 'vst3-builds',
    publicUrl: 'https://example.supabase.co/storage/v1/object/public/vst3-builds/',
  }), {
    objectKey: `builds/${jobId}/Test-01234567.vst3.zip`,
    downloadUrl: `https://example.supabase.co/storage/v1/object/public/vst3-builds/builds/${jobId}/Test-01234567.vst3.zip`,
  });
});

test('parity scenarios cover defaults and 0, 0.5, 1 for every real macro', () => {
  assert.deepEqual(createParityScenarios([]), [{ id: 'defaults', values: [] }]);
  assert.deepEqual(createParityScenarios([{ value: 0.25 }, { value: 0.75 }]), [
    { id: 'defaults', values: [0.25, 0.75] },
    { id: 'macro-0-0', values: [0, 0.75] },
    { id: 'macro-0-0_5', values: [0.5, 0.75] },
    { id: 'macro-0-1', values: [1, 0.75] },
    { id: 'macro-1-0', values: [0.25, 0] },
    { id: 'macro-1-0_5', values: [0.25, 0.5] },
    { id: 'macro-1-1', values: [0.25, 1] },
  ]);
});

test('parity comparison enforces the 1e-4 ceiling', () => {
  const browser = [Float32Array.of(0, 0.5), Float32Array.of(0, -0.5)];
  assert.equal(compareStereoParity(browser, browser, 1e-4).passed, true);
  const mismatch = [Float32Array.of(0, 0.5002), Float32Array.of(0, -0.5)];
  assert.equal(compareStereoParity(browser, mismatch, 1e-4).passed, false);
});

test('the Mac independently validates the Site request hashes and allowlist', async () => {
  const project = applyProjectCommands(createInitialProject(), [{ type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' }], 'human');
  const signal = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(index * 0.1) * 0.2);
  const analysis = analyzeStereo([signal, signal], 48000);
  const request = await createNativeBuildRequest(await freezeProjectRevision(project, validateProjectForBuild(project, analysis)));
  const lock = await loadToolchainLock();
  assert.equal(validateNativeBuildRequest(request, lock), request);
  const changed = structuredClone(request);
  changed.dsp.chain[0].params.level = 6;
  assert.throws(() => validateNativeBuildRequest(changed, lock), /DSP hash/i);
});

test('the generated audio callback never resizes its buffers', async () => {
  const template = await readFile(new URL('../templates/BeatZStaticChain.hpp.tpl', import.meta.url), 'utf8');
  const processBody = template.slice(template.indexOf('void process'));
  assert.doesNotMatch(processBody, /\.resize\s*\(/u);
});

test('native exports expose every active effect parameter in an editable VST3 editor', async () => {
  const project = applyProjectCommands(createInitialProject(), [
    { type: 'add_module', moduleType: 'saturation', nodeId: 'saturation-1' },
    { type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' },
  ], 'human');
  const signal = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(index * 0.1) * 0.2);
  const analysis = analyzeStereo([signal, signal], 48000);
  const request = await createNativeBuildRequest(await freezeProjectRevision(project, validateProjectForBuild(project, analysis)));
  const root = await mkdtemp(join(tmpdir(), 'beatz-native-ui-test-'));
  const plan = await createNativeGenerationPlan(request, await loadToolchainLock(), { workspaceRoot: root });
  const files = await materializeNativeTemplates(plan);
  const [config, cmake, source, chain] = await Promise.all([
    readFile(files.config, 'utf8'), readFile(files.cmake, 'utf8'), readFile(files.pluginSource, 'utf8'), readFile(files.staticChain, 'utf8'),
  ]);

  assert.match(config, /PLUG_HAS_UI 1/u);
  assert.doesNotMatch(cmake, /UI NONE|NO_IGRAPHICS/u);
  assert.match(source, /Saturation 1 Drive/u);
  assert.match(source, /Filter 1 Cutoff/u);
  assert.match(chain, /void setParameter\(int parameterIndex, float value\)/u);
  assert.doesNotMatch(chain, /void setMacro/u);
});

test('verified bundles are copied atomically without a Beat.Z subfolder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'beatz-artifact-test-'));
  const source = resolve(root, 'source.vst3');
  const downloads = resolve(root, 'Downloads');
  await mkdir(resolve(source, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(resolve(source, 'Contents', 'MacOS', 'Test'), 'binary');
  const saved = await saveVerifiedVst3Bundle(source, downloads, 'Test-01234567.vst3', { inspectArchitecture: async () => 'arm64' });
  assert.equal(saved.path, resolve(downloads, 'Test-01234567.vst3'));
  assert.equal(await readFile(resolve(saved.path, 'Contents', 'MacOS', 'Test'), 'utf8'), 'binary');
  const repeated = await saveVerifiedVst3Bundle(source, downloads, 'Test-01234567.vst3', { inspectArchitecture: async () => 'arm64' });
  assert.equal(repeated.bundleSha256, saved.bundleSha256);
  const different = resolve(root, 'different.vst3');
  await mkdir(resolve(different, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(resolve(different, 'Contents', 'MacOS', 'Test'), 'different binary');
  await assert.rejects(() => saveVerifiedVst3Bundle(different, downloads, 'Test-01234567.vst3', { inspectArchitecture: async () => 'arm64' }), /replace existing/i);
});
