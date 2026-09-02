import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { saveVerifiedVst3Bundle } from '../lib/artifact.mjs';
import { sha256Canonical } from '../lib/canonical.mjs';
import { createAutomaticNativeParameters, createNativeEditorModel, createNativeGenerationPlan, deriveNativeIdentity, defaultExportRoot, materializeNativeTemplates, repairFaustFtzRvalueAddresses } from '../lib/generation.mjs';
import { inspectNativeToolchain } from '../lib/doctor.mjs';
import { compareStereoParity, createParityScenarios, parityDiagnostics } from '../lib/parity.mjs';
import { publicArtifactDetails } from '../lib/publish.mjs';
import { asNativeBuildFailure, formatNativeBuildDiagnostics, NativeBuildError } from '../lib/errors.mjs';
import { loadToolchainLock, validateNativeBuildRequest } from '../lib/spec.mjs';
import { analyzeStereo } from '../../src/features/audio-builder/audio/analysis.ts';
import { freezeProjectRevision } from '../../src/features/audio-builder/domain/build.ts';
import { applyProjectCommands, createInitialProject } from '../../src/features/audio-builder/domain/project.ts';
import { validateProjectForBuild } from '../../src/features/audio-builder/domain/validation.ts';
import { createNativeBuildRequest } from '../../src/features/vst3-export/contract.ts';
import { NATIVE_MODULE_CATALOG, SOURCE_FINGERPRINTS } from '../lib/catalog.mjs';

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

test('parity scenarios cover every choice value and 0, 0.5, 1 for continuous VST3 parameters', () => {
  assert.deepEqual(createParityScenarios([]), [{ id: 'defaults', values: [], parameterIndex: null, normalizedValue: null }]);
  assert.deepEqual(createParityScenarios([
    { value: 0, definition: { min: 0, max: 3, choices: [0, 1, 2, 3] } },
    { value: 0.75, definition: { min: 0, max: 100 } },
  ]), [
    { id: 'defaults', values: [0, 0.75], parameterIndex: null, normalizedValue: null },
    { id: 'parameter-0-0', values: [0, 0.75], parameterIndex: 0, normalizedValue: 0 },
    { id: 'parameter-0-1', values: [1, 0.75], parameterIndex: 0, normalizedValue: 1 / 3 },
    { id: 'parameter-0-2', values: [2, 0.75], parameterIndex: 0, normalizedValue: 2 / 3 },
    { id: 'parameter-0-3', values: [3, 0.75], parameterIndex: 0, normalizedValue: 1 },
    { id: 'parameter-1-0', values: [0, 0], parameterIndex: 1, normalizedValue: 0 },
    { id: 'parameter-1-0_5', values: [0, 50], parameterIndex: 1, normalizedValue: 0.5 },
    { id: 'parameter-1-1', values: [0, 100], parameterIndex: 1, normalizedValue: 1 },
  ]);
});

test('logarithmic parity scenarios use the same normalized curve as the native knob', () => {
  const scenarios = createParityScenarios([{ value: 80, definition: { min: 20, max: 20000, scale: 'log' } }]);
  assert.equal(scenarios[2].id, 'parameter-0-0_5');
  assert.ok(Math.abs(scenarios[2].values[0] - Math.sqrt(20 * 20000)) < 1e-9);
});

test('parity comparison separately enforces peak and sustained-error ceilings', () => {
  const browser = [new Float32Array(100), new Float32Array(100)];
  assert.equal(compareStereoParity(browser, browser, { maxTolerance: 5e-4, rmsTolerance: 1.5e-4 }).passed, true);
  const isolatedPeak = [new Float32Array(browser[0]), new Float32Array(browser[1])];
  isolatedPeak[0][0] = 4e-4;
  assert.equal(compareStereoParity(browser, isolatedPeak, { maxTolerance: 5e-4, rmsTolerance: 1.5e-4 }).passed, true);
  const sustainedMismatch = [new Float32Array(100).fill(1.5e-4), new Float32Array(100)];
  assert.equal(compareStereoParity(browser, sustainedMismatch, { maxTolerance: 5e-4, rmsTolerance: 1e-4 }).passed, false);
  const knownSeriousMismatch = [new Float32Array(100).fill(9.987e-4), new Float32Array(100).fill(9.987e-4)];
  assert.equal(compareStereoParity(browser, knownSeriousMismatch, { maxTolerance: 1e-3, rmsTolerance: 1.5e-4 }).passed, false);
});

test('parity diagnostics identify the peak channel, frame, and processing region', () => {
  const browser = [new Float32Array(256), new Float32Array(256)];
  const native = [new Float32Array(256), new Float32Array(256)];
  native[1][140] = 4e-4;
  const comparison = compareStereoParity(browser, native, { maxTolerance: 5e-4, rmsTolerance: 1.5e-4 });
  assert.equal(comparison.peakChannel, 1);
  assert.equal(comparison.peakFrame, 140);
  assert.equal(comparison.peakInInitialBlock, false);
  assert.equal(comparison.initialBlockRmsError, 0);
  assert.ok(comparison.steadyStateRmsError > 0);
});

test('parity diagnostics name the scenario, module, parameter, values, time, and block metrics', () => {
  const diagnostics = parityDiagnostics(
    48000,
    { id: 'parameter-2-1', values: [0, 80, 20], parameterIndex: 2, normalizedValue: 1 },
    [null, null, { moduleLabel: 'Filter 1', controlLabel: 'Resonance' }],
    {
      maxAbsoluteError: 8.418e-4,
      maxTolerance: 5e-4,
      rmsError: 4.936e-5,
      rmsTolerance: 1.5e-4,
      peakChannel: 1,
      peakFrame: 144,
      peakInInitialBlock: false,
      initialBlockRmsError: 1e-6,
      steadyStateRmsError: 5e-5,
    },
  );
  assert.deepEqual(diagnostics, {
    sampleRate: 48000,
    scenarioId: 'parameter-2-1',
    module: 'Filter 1',
    parameter: 'Resonance',
    parameterIndex: 2,
    testedNativeValue: 20,
    normalizedValue: 1,
    maxAbsoluteError: 8.418e-4,
    maxTolerance: 5e-4,
    rmsError: 4.936e-5,
    rmsTolerance: 1.5e-4,
    peakChannel: 'right',
    peakFrame: 144,
    peakTimeMs: 3,
    peakInInitialBlock: false,
    initialBlockRmsError: 1e-6,
    steadyStateRmsError: 5e-5,
  });
});

test('native diagnostics stay private while the public failure remains concise', () => {
  const error = new NativeBuildError('parity_mismatch', 'Browser/VST3 parity did not match for Filter 1 Resonance at 48000 Hz.', {
    diagnostics: { sampleRate: 48000, peakFrame: 140, internalPath: '/private/tmp/build' },
  });
  assert.deepEqual(asNativeBuildFailure(error), {
    code: 'parity_mismatch',
    message: 'Browser/VST3 parity did not match for Filter 1 Resonance at 48000 Hz.',
    retryable: false,
  });
  assert.doesNotMatch(asNativeBuildFailure(error).message, /peakFrame|private\/tmp/u);
  assert.match(formatNativeBuildDiagnostics(error), /"peakFrame":140/u);
});

test('private toolchain evidence is logged without exposing versions or paths publicly', () => {
  const error = new NativeBuildError('native_toolchain_mismatch', 'Expected Faust 2.85.9 at /private/tool/faust.', {
    publicMessage: 'The Mac build worker is not ready. Start it again after updating its toolchain.',
    diagnostics: { expected: '2.85.9', actual: '2.85.5' },
  });
  assert.equal(asNativeBuildFailure(error).message, 'The Mac build worker is not ready. Start it again after updating its toolchain.');
  assert.doesNotMatch(asNativeBuildFailure(error).message, /2\.85|private/u);
  assert.match(formatNativeBuildDiagnostics(error), /Expected Faust 2\.85\.9/u);
});

test('compiler output and filesystem paths never enter the public build failure', () => {
  const error = new NativeBuildError('native_compile_failed', 'clang failed at /private/tmp/job with an internal stack trace');
  assert.equal(asNativeBuildFailure(error).message, 'The VST3 could not be built by the Mac worker.');
  assert.doesNotMatch(asNativeBuildFailure(error).message, /clang|private|stack/u);
  assert.match(formatNativeBuildDiagnostics(error), /clang failed/u);
});

test('the native generator repairs Faust 2.85.9 ftz rvalue addresses for Apple Clang', () => {
  const source = '((*reinterpret_cast<int*>(&-fTemp264) & 2139095040) ? -fTemp264 : 0.0f);';
  const repaired = repairFaustFtzRvalueAddresses(source);
  assert.equal(repaired.repairs, 1);
  assert.equal(repaired.source, '((*reinterpret_cast<int*>(&fTemp264) & 2139095040) ? -fTemp264 : 0.0f);');
  assert.deepEqual(repairFaustFtzRvalueAddresses('float untouched = 0.0f;'), { source: 'float untouched = 0.0f;', repairs: 0 });
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

test('the native request hash includes DSP-affecting Faust code-generation flags', async () => {
  const request = await nativeRequestForModules(['filter']);
  const changed = structuredClone(request);
  changed.toolchain.faust.codegenFlags = ['-single'];
  assert.equal(request.dspHash, sha256Canonical({ dsp: request.dsp, toolchain: request.toolchain }));
  assert.notEqual(request.dspHash, sha256Canonical({ dsp: changed.dsp, toolchain: changed.toolchain }));
});

test('the native request hash changes with the Faust compiler version', async () => {
  const request = await nativeRequestForModules(['filter']);
  const changed = structuredClone(request);
  changed.toolchain.faust.version = '2.85.5';
  assert.notEqual(request.dspHash, sha256Canonical({ dsp: changed.dsp, toolchain: changed.toolchain }));
});

test('the native request hash includes DSP floating-point compiler flags', async () => {
  const request = await nativeRequestForModules(['saturation']);
  const changed = structuredClone(request);
  changed.toolchain.compiler.dspFlags = [];
  assert.notEqual(request.dspHash, sha256Canonical({ dsp: changed.dsp, toolchain: changed.toolchain }));
});

test('Faust engine and toolchain version mismatches are rejected before generation', async () => {
  const request = await nativeRequestForModules(['gain']);
  const lock = await loadToolchainLock();
  const changed = structuredClone(request);
  changed.dsp.engine.faustCompilerVersion = '2.85.5';
  changed.dspHash = sha256Canonical({ dsp: changed.dsp, toolchain: changed.toolchain });
  assert.throws(() => validateNativeBuildRequest(changed, lock), /Faust compiler version mismatch/u);
});

test('the native doctor verifies the real pinned Faust executable and matching headers', async () => {
  const doctor = await inspectNativeToolchain({ lock: await loadToolchainLock() });
  assert.deepEqual(doctor.versions, { faust: '2.85.9', faustHeaders: '2.85.9' });
  assert.equal(doctor.paths.faustIncludeRoot, '/opt/homebrew/opt/faust/include');
});

test('the generated audio callback never resizes its buffers', async () => {
  const template = await readFile(new URL('../templates/BeatZStaticChain.hpp.tpl', import.meta.url), 'utf8');
  const processBody = template.slice(template.indexOf('void process'));
  assert.doesNotMatch(processBody, /\.resize\s*\(/u);
});

test('the parity host consumes the browser fixture instead of synthesizing a second input', async () => {
  const source = await readFile(new URL('../parity-host/main.cpp', import.meta.url), 'utf8');
  assert.match(source, /inputPath/u);
  assert.match(source, /inputLeft\.data\(\)/u);
  assert.doesNotMatch(source, /std::sin|constexpr double pi/u);
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

test('the native catalog and generic editor represent Delay and Reverb without template changes', async () => {
  assert.deepEqual(Object.keys(NATIVE_MODULE_CATALOG), ['gain', 'filter', 'saturation', 'delay', 'reverb']);
  assert.deepEqual(NATIVE_MODULE_CATALOG.filter.parameters.mode.choices, [0, 1, 2, 3]);
  assert.deepEqual(NATIVE_MODULE_CATALOG.delay.parameters.mode.choiceLabels, ['Digital', 'Ping-Pong', 'Tape']);
  assert.deepEqual(NATIVE_MODULE_CATALOG.reverb.parameters.mode.choiceLabels, ['Room', 'Hall', 'Plate']);
  assert.equal(SOURCE_FINGERPRINTS.delay, 'fb9a020e31f2b4f290a17ad2a18ec5d87c6f701195af2bc95e38f2d99cef1b92');
  assert.equal(SOURCE_FINGERPRINTS.reverb, 'bec502b0ca2f0b01dd7c10051cd848417f24ca0eb45b73c2854a49da54abb5ff');
  assert.equal(NATIVE_MODULE_CATALOG.delay.wasmSha256, '6a5495bfa670ef8435cd8a2bf282f16e64e5a447ef3b5dbeabff3f4e77cba99c');
  assert.equal(NATIVE_MODULE_CATALOG.reverb.wasmSha256, 'd03ff0e330e877212436fed13d983036605d29b5aac719775abc45be402ba12a');
  const request = await nativeRequestForModules(['delay', 'reverb']);
  const editor = createNativeEditorModel(createAutomaticNativeParameters(request));
  assert.equal(editor.knobCount, 11);
  assert.equal(editor.switchCount, 2);
  assert.deepEqual(editor.rows.flatMap((row) => row.modules.map((module) => module.label)), ['Delay 1', 'Reverb 1']);
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
  assert.match(cmake, /target_compile_options\(BeatZGeneratedPlugin-vst3 PRIVATE -ffp-contract=off\)/u);
  assert.match(source, /LoadFont\("Roboto-Regular", ROBOTO_FN\)/u);
  assert.match(source, /#undef BUNDLE_ID\s+#define BUNDLE_ID BUNDLE_IDENTIFIER/u);
  assert.match(source, /LoadFont\("Roboto-Regular", "Helvetica", ETextStyle::Normal\)/u);
  assert.match(source, /WithShowLabel\(true\)[\s\S]*WithShowValue\(true\)/u);
  assert.match(source, /new IVKnobControl\([^;]*kParam0, "Level"/u);
  assert.match(source, /new IVTabSwitchControl\([^;]*kParam1[^;]*\{"Soft Clip", "Cubic", "Fuzz", "Tape"\}[^;]*"Character"/u);
  assert.match(source, /new IVKnobControl\([^;]*kParam2, "Drive"/u);
  assert.match(source, /new IVKnobControl\([^;]*kParam9, "Wow"/u);
  assert.match(source, /new IVTabSwitchControl\([^;]*kParam10[^;]*\{"High Pass", "Low Pass", "Band Pass", "Notch"\}[^;]*"Mode"/u);
  assert.match(source, /InitDouble\("Gain 1 Level"[^;]*"dB"[^;]*"Gain 1"/u);
  assert.match(source, /InitEnum\("Filter 1 Mode"[^;]*\{"High Pass", "Low Pass", "Band Pass", "Notch"\}[^;]*"Filter 1"/u);
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
