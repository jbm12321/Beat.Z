import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { saveVerifiedVst3Bundle } from '../lib/artifact.mjs';
import { createAutomaticNativeParameters, createNativeEditorModel, createNativeGenerationPlan, deriveNativeIdentity, defaultExportRoot, materializeNativeTemplates } from '../lib/generation.mjs';
import { compareStereoParity, createParityScenarios } from '../lib/parity.mjs';
import { publicArtifactDetails } from '../lib/publish.mjs';
import { loadToolchainLock, validateNativeBuildRequest } from '../lib/spec.mjs';
import { analyzeStereo } from '../../src/features/audio-builder/audio/analysis.ts';
import { freezeProjectRevision } from '../../src/features/audio-builder/domain/build.ts';
import { applyProjectCommands, createInitialProject } from '../../src/features/audio-builder/domain/project.ts';
import { validateProjectForBuild } from '../../src/features/audio-builder/domain/validation.ts';
import { createNativeBuildRequest } from '../../src/features/vst3-export/contract.ts';

async function nativeRequestForModules(moduleTypes) {
  const commands = moduleTypes.map((moduleType, index) => ({ type: 'add_module', moduleType, nodeId: `${moduleType}-${index + 1}` }));
  const project = applyProjectCommands(createInitialProject(), commands, 'human');
  const signal = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(index * 0.1) * 0.2);
  const analysis = analyzeStereo([signal, signal], 48000);
  return createNativeBuildRequest(await freezeProjectRevision(project, validateProjectForBuild(project, analysis)));
}

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

test('parity scenarios cover valid endpoints for choices and 0, 0.5, 1 for continuous VST3 parameters', () => {
  assert.deepEqual(createParityScenarios([]), [{ id: 'defaults', values: [] }]);
  assert.deepEqual(createParityScenarios([
    { value: 0, definition: { min: 0, max: 1, choices: [0, 1] } },
    { value: 0.75, definition: { min: 0, max: 100 } },
  ]), [
    { id: 'defaults', values: [0, 0.75] },
    { id: 'parameter-0-0', values: [0, 0.75] },
    { id: 'parameter-0-1', values: [1, 0.75] },
    { id: 'parameter-1-0', values: [0, 0] },
    { id: 'parameter-1-0_5', values: [0, 50] },
    { id: 'parameter-1-1', values: [0, 100] },
  ]);
});

test('logarithmic parity scenarios use the same normalized curve as the native knob', () => {
  const scenarios = createParityScenarios([{ value: 80, definition: { min: 20, max: 20000, scale: 'log' } }]);
  assert.equal(scenarios[2].id, 'parameter-0-0_5');
  assert.ok(Math.abs(scenarios[2].values[0] - Math.sqrt(20 * 20000)) < 1e-9);
});

test('parity comparison separately enforces peak and sustained-error ceilings', () => {
  const browser = [new Float32Array(100), new Float32Array(100)];
  assert.equal(compareStereoParity(browser, browser, { maxTolerance: 5e-4, rmsTolerance: 1e-4 }).passed, true);
  const isolatedPeak = [new Float32Array(browser[0]), new Float32Array(browser[1])];
  isolatedPeak[0][0] = 4e-4;
  assert.equal(compareStereoParity(browser, isolatedPeak, { maxTolerance: 5e-4, rmsTolerance: 1e-4 }).passed, true);
  const sustainedMismatch = [new Float32Array(100).fill(1.5e-4), new Float32Array(100)];
  assert.equal(compareStereoParity(browser, sustainedMismatch, { maxTolerance: 5e-4, rmsTolerance: 1e-4 }).passed, false);
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

test('the native editor preserves every Saturation v2 parameter in visible wrapped rows', async () => {
  const request = await nativeRequestForModules(['gain', 'filter', 'saturation']);
  const parameters = createAutomaticNativeParameters(request);
  const editor = createNativeEditorModel(parameters);

  assert.equal(editor.rowCount, 3);
  assert.equal(editor.knobCount, 11);
  assert.equal(editor.switchCount, 2);
  assert.ok(editor.rows.every((row) => row.knobCount <= 6));
  assert.deepEqual(editor.rows.flatMap((row) => row.modules.map((module) => module.label)), ['Gain 1', 'Filter 1', 'Saturation 1 1/2', 'Saturation 1 2/2']);
  assert.deepEqual(parameters.filter((parameter) => parameter.moduleType === 'saturation').map((parameter) => parameter.parameterId), ['character', 'drive', 'tone', 'mix', 'output', 'bias', 'clip', 'age', 'wow']);
  assert.equal('pages' in editor, false);
});

test('the native editor wraps complete modules into visible rows without pagination', async () => {
  const request = await nativeRequestForModules(['saturation', 'saturation', 'gain']);
  const editor = createNativeEditorModel(createAutomaticNativeParameters(request));

  assert.equal(editor.rowCount, 4);
  assert.equal(editor.height, 1480);
  assert.deepEqual(editor.rows.map((row) => row.modules.map((module) => module.label)), [
    ['Saturation 1 1/2'],
    ['Saturation 1 2/2'],
    ['Saturation 2 1/2'],
    ['Saturation 2 2/2', 'Gain 1'],
  ]);
  assert.ok(editor.rows.every((row) => row.knobCount <= 6));
  assert.deepEqual(editor.rows[0].modules[0].controls.filter((control) => control.type === 'knob').map((control) => control.slot), [0, 1, 2, 3, 4, 5]);
});

test('repeated modules have stable section and host parameter numbering', async () => {
  const request = await nativeRequestForModules(['filter', 'filter']);
  const parameters = createAutomaticNativeParameters(request);
  const editor = createNativeEditorModel(parameters);

  assert.deepEqual(editor.rows[0].modules.map((module) => module.label), ['Filter 1', 'Filter 2']);
  assert.deepEqual(parameters.map((parameter) => parameter.label), [
    'Filter 1 Mode', 'Filter 1 Cutoff', 'Filter 1 Resonance',
    'Filter 2 Mode', 'Filter 2 Cutoff', 'Filter 2 Resonance',
  ]);
});

test('native exports expose every active effect parameter in an editable VST3 editor', async () => {
  const project = applyProjectCommands(createInitialProject(), [
    { type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' },
    { type: 'add_module', moduleType: 'saturation', nodeId: 'saturation-1' },
    { type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' },
  ], 'human');
  const signal = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(index * 0.1) * 0.2);
  const analysis = analyzeStereo([signal, signal], 48000);
  const request = await createNativeBuildRequest(await freezeProjectRevision(project, validateProjectForBuild(project, analysis)));
  const root = await mkdtemp(join(tmpdir(), 'beatz-native-ui-test-'));
  const plan = await createNativeGenerationPlan(request, await loadToolchainLock(), { workspaceRoot: root });
  const files = await materializeNativeTemplates(plan);
  const [config, cmake, source, chain, manifestSource] = await Promise.all([
    readFile(files.config, 'utf8'), readFile(files.cmake, 'utf8'), readFile(files.pluginSource, 'utf8'), readFile(files.staticChain, 'utf8'), readFile(files.manifest, 'utf8'),
  ]);
  const manifest = JSON.parse(manifestSource);

  assert.match(config, /PLUG_HAS_UI 1/u);
  assert.match(config, /PLUG_WIDTH 960/u);
  assert.match(config, /PLUG_HEIGHT 1160/u);
  assert.match(config, /ROBOTO_FN "Roboto-Regular\.ttf"/u);
  assert.doesNotMatch(cmake, /UI NONE|NO_IGRAPHICS/u);
  assert.match(cmake, /RESOURCES \$\{IPLUG2_DIR\}\/Examples\/IPlugEffect\/resources\/fonts\/Roboto-Regular\.ttf/u);
  assert.match(source, /LoadFont\("Roboto-Regular", ROBOTO_FN\)/u);
  assert.match(source, /#undef BUNDLE_ID\s+#define BUNDLE_ID BUNDLE_IDENTIFIER/u);
  assert.match(source, /LoadFont\("Roboto-Regular", "Helvetica", ETextStyle::Normal\)/u);
  assert.match(source, /WithShowLabel\(true\)[\s\S]*WithShowValue\(true\)/u);
  assert.match(source, /new IVKnobControl\([^;]*kParam0, "Level"/u);
  assert.match(source, /new IVTabSwitchControl\([^;]*kParam1[^;]*\{"Soft Clip", "Cubic", "Fuzz", "Tape"\}[^;]*"Character"/u);
  assert.match(source, /new IVKnobControl\([^;]*kParam2, "Drive"/u);
  assert.match(source, /new IVKnobControl\([^;]*kParam9, "Wow"/u);
  assert.match(source, /new IVTabSwitchControl\([^;]*kParam10[^;]*\{"High Pass", "Low Pass"\}[^;]*"Mode"/u);
  assert.match(source, /InitDouble\("Gain 1 Level"[^;]*"dB"[^;]*"Gain 1"/u);
  assert.match(source, /InitEnum\("Filter 1 Mode"[^;]*\{"High Pass", "Low Pass"\}[^;]*"Filter 1"/u);
  assert.match(source, /new IVGroupControl\([^;]*"SATURATION 1 1\/2"/u);
  assert.match(source, /new IVGroupControl\([^;]*"FILTER 1"/u);
  assert.match(source, /"3 MODULES  \/  11 KNOBS  \/  2 SWITCHES"/u);
  assert.match(source, /SubRectVertical\(3, 0\)/u);
  assert.doesNotMatch(source, /editor-page|PAGE 1 \/|"PREV"|"NEXT"/u);
  assert.match(source, /iplug::IParam::ShapeExp\(\)/u);
  assert.match(chain, /void setParameter\(int parameterIndex, float value\)/u);
  assert.doesNotMatch(chain, /void setMacro/u);
  assert.equal(manifest.editor.rowCount, 3);
  assert.equal(manifest.editor.knobCount, 11);
  assert.equal(manifest.editor.switchCount, 2);
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
