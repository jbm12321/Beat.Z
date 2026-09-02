import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadFaustFactoryFromBytes, renderFaustProjectOffline } from '../../src/features/audio-builder/faust/runtime.ts';
import { NativeBuildError } from './errors.mjs';
import { createAutomaticNativeParameters } from './generation.mjs';
import { resolveWithin } from './safety.mjs';

const execFileAsync = promisify(execFile);
const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(nativeRoot, '..');

async function defaultRun(command, argumentsList) {
  try {
    const result = await execFileAsync(command, argumentsList, {
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
      // Steinberg's CMake checks this environment value even when the matching
      // Apple Command Line Tools are installed without the Xcode application.
      env: { ...process.env, XCODE_VERSION: '16.4' },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, stdout: error?.stdout ?? '', stderr: error?.stderr ?? '' };
  }
}

export function compareStereoParity(browser, native, tolerance) {
  const limits = typeof tolerance === 'number' ? { maxTolerance: tolerance, rmsTolerance: tolerance } : tolerance;
  if (browser.length !== 2 || native.length !== 2 || browser[0].length !== browser[1].length || native[0].length !== native[1].length || browser[0].length !== native[0].length) {
    throw new NativeBuildError('parity_render_invalid', 'Browser and native stereo frame counts do not match.');
  }
  let maximum = 0;
  let peakChannel = 0;
  let peakFrame = 0;
  let squaredError = 0;
  let initialSquaredError = 0;
  let initialSamples = 0;
  let steadySquaredError = 0;
  let steadySamples = 0;
  let samples = 0;
  const initialBlockFrames = Math.min(128, browser[0].length);
  for (let channel = 0; channel < 2; channel += 1) {
    for (let frame = 0; frame < browser[channel].length; frame += 1) {
      const error = Math.abs(browser[channel][frame] - native[channel][frame]);
      if (error > maximum) {
        maximum = error;
        peakChannel = channel;
        peakFrame = frame;
      }
      squaredError += error * error;
      if (frame < initialBlockFrames) {
        initialSquaredError += error * error;
        initialSamples += 1;
      } else {
        steadySquaredError += error * error;
        steadySamples += 1;
      }
      samples += 1;
    }
  }
  const rmsError = Math.sqrt(squaredError / Math.max(1, samples));
  return {
    passed: maximum <= limits.maxTolerance && rmsError <= limits.rmsTolerance,
    maxAbsoluteError: maximum,
    rmsError,
    maxTolerance: limits.maxTolerance,
    rmsTolerance: limits.rmsTolerance,
    peakChannel,
    peakFrame,
    peakInInitialBlock: peakFrame < initialBlockFrames,
    initialBlockRmsError: Math.sqrt(initialSquaredError / Math.max(1, initialSamples)),
    steadyStateRmsError: Math.sqrt(steadySquaredError / Math.max(1, steadySamples)),
  };
}

export function createParityScenarios(parameters) {
  const defaults = parameters.map((parameter) => parameter.value);
  return [
    { id: 'defaults', values: defaults, parameterIndex: null, normalizedValue: null },
    ...parameters.flatMap((parameter, parameterIndex) => (parameter.definition.choices ? [0, 1] : [0, 0.5, 1]).map((normalized) => {
      const values = [...defaults];
      values[parameterIndex] = parameter.definition.scale === 'log'
        ? parameter.definition.min * ((parameter.definition.max / parameter.definition.min) ** normalized)
        : parameter.definition.min + ((parameter.definition.max - parameter.definition.min) * normalized);
      return { id: `parameter-${parameterIndex}-${String(normalized).replace('.', '_')}`, values, parameterIndex, normalizedValue: normalized };
    })),
  ];
}

export function parityDiagnostics(sampleRate, scenario, parameters, comparison) {
  const parameter = scenario.parameterIndex === null ? null : parameters[scenario.parameterIndex];
  return {
    sampleRate,
    scenarioId: scenario.id,
    module: parameter?.moduleLabel ?? 'Project defaults',
    parameter: parameter?.controlLabel ?? 'Defaults',
    parameterIndex: scenario.parameterIndex,
    testedNativeValue: scenario.parameterIndex === null ? null : scenario.values[scenario.parameterIndex],
    normalizedValue: scenario.normalizedValue,
    maxAbsoluteError: comparison.maxAbsoluteError,
    maxTolerance: comparison.maxTolerance,
    rmsError: comparison.rmsError,
    rmsTolerance: comparison.rmsTolerance,
    peakChannel: comparison.peakChannel === 0 ? 'left' : 'right',
    peakFrame: comparison.peakFrame,
    peakTimeMs: comparison.peakFrame * 1000 / sampleRate,
    peakInInitialBlock: comparison.peakInInitialBlock,
    initialBlockRmsError: comparison.initialBlockRmsError,
    steadyStateRmsError: comparison.steadyStateRmsError,
  };
}

function flattenedNativeProject(request, parameters, values) {
  const project = structuredClone(request.project);
  project.macros = [];
  parameters.forEach((parameter, index) => {
    project.nodes[parameter.nodeId].params[parameter.parameterId] = values[index];
  });
  return project;
}

function normalizeNativeParameter(parameter, value) {
  if (parameter.definition.scale === 'log') {
    return Math.log(value / parameter.definition.min) / Math.log(parameter.definition.max / parameter.definition.min);
  }
  return (value - parameter.definition.min) / (parameter.definition.max - parameter.definition.min);
}

export async function buildVst3RenderHost(doctor, options = {}) {
  const run = options.run ?? defaultRun;
  const sourceRoot = resolve(nativeRoot, 'parity-host');
  const buildRoot = resolve(nativeRoot, 'build', 'parity-host');
  await mkdir(buildRoot, { recursive: true, mode: 0o700 });
  const configure = await run('cmake', [
    '-S', sourceRoot,
    '-B', buildRoot,
    '-G', doctor.generator,
    `-DVST3_SDK_ROOT=${doctor.paths.vst3SdkRoot}`,
    '-DCMAKE_MAKE_PROGRAM=/opt/homebrew/bin/ninja',
    '-DCMAKE_CXX_COMPILER=/usr/bin/clang++',
    '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_OSX_ARCHITECTURES=arm64',
    '-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0',
  ]);
  if (!configure.ok) throw new NativeBuildError('parity_host_build_failed', `VST3 render-host configuration failed: ${configure.stderr || configure.stdout}`);
  const build = await run('cmake', ['--build', buildRoot, '--target', 'beatz-vst3-render', '--parallel', '4']);
  if (!build.ok) throw new NativeBuildError('parity_host_build_failed', `VST3 render-host compilation failed: ${build.stderr || build.stdout}`);
  return resolve(buildRoot, 'beatz-vst3-render');
}

function deterministicInput(sampleRate, frames) {
  return [
    Float32Array.from({ length: frames }, (_, index) => 0.18 * Math.sin(2 * Math.PI * 330 * index / sampleRate)),
    Float32Array.from({ length: frames }, (_, index) => 0.13 * Math.sin(2 * Math.PI * 517 * index / sampleRate)),
  ];
}

function encodeStereoFloat32(channels) {
  const frames = channels[0].length;
  const samples = new Float32Array(frames * 2);
  samples.set(channels[0], 0);
  samples.set(channels[1], frames);
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

async function renderBrowserParity(project, input, sampleRate, loadFactory) {
  const originalLog = console.log;
  console.log = (...args) => {
    if (args.length === 1 && /^sampleSize: 4 bufferSize: 128$/u.test(String(args[0]))) return;
    originalLog(...args);
  };
  try {
    return await renderFaustProjectOffline(project, input, sampleRate, loadFactory);
  } finally {
    console.log = originalLog;
  }
}

export async function runVst3Parity(request, bundlePath, workspaceRoot, doctor, lock, options = {}) {
  const run = options.run ?? defaultRun;
  const hostPath = options.hostPath ?? await buildVst3RenderHost(doctor, options);
  const parityRoot = resolveWithin(workspaceRoot, 'parity');
  await mkdir(parityRoot, { recursive: true, mode: 0o700 });
  const factoryCache = new Map();
  const loadFactory = (type) => {
    let pending = factoryCache.get(type);
    if (!pending) {
      pending = Promise.all([
        readFile(resolve(repositoryRoot, 'public', 'faust', type, 'dsp-module.wasm')),
        readFile(resolve(repositoryRoot, 'public', 'faust', type, 'dsp-meta.json'), 'utf8'),
      ]).then(([wasm, json]) => loadFaustFactoryFromBytes(wasm, json));
      factoryCache.set(type, pending);
    }
    return pending;
  };
  const evidence = [];
  const parameters = createAutomaticNativeParameters(request);
  const scenarios = createParityScenarios(parameters);
  for (const sampleRate of lock.parity.sampleRates) {
    const frames = sampleRate;
    const input = deterministicInput(sampleRate, frames);
    const inputPath = resolveWithin(parityRoot, `${sampleRate}-input.f32`);
    await writeFile(inputPath, encodeStereoFloat32(input));
    let maxAbsoluteError = 0;
    let rmsError = 0;
    for (const scenario of scenarios) {
      const project = flattenedNativeProject(request, parameters, scenario.values);
      const browser = await renderBrowserParity(project, input, sampleRate, loadFactory);
      const nativeOutputPath = resolveWithin(parityRoot, `${sampleRate}-${scenario.id}.f32`);
      const parameterArguments = scenario.values.map((value, index) => `${index}=${normalizeNativeParameter(parameters[index], value)}`);
      const rendered = await run(hostPath, [bundlePath, String(sampleRate), String(frames), inputPath, nativeOutputPath, ...parameterArguments]);
      if (!rendered.ok) throw new NativeBuildError('parity_render_failed', `Actual VST3 render failed at ${sampleRate} Hz: ${rendered.stderr || rendered.stdout}`);
      const encoded = await readFile(nativeOutputPath);
      if (encoded.byteLength !== frames * 2 * Float32Array.BYTES_PER_ELEMENT) {
        throw new NativeBuildError('parity_render_invalid', `Actual VST3 render returned an invalid frame count at ${sampleRate} Hz.`);
      }
      const samples = new Float32Array(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength));
      const native = [samples.slice(0, frames), samples.slice(frames)];
      const comparison = compareStereoParity(browser, native, lock.parity);
      if (!comparison.passed) {
        const parameter = scenario.parameterIndex === null ? null : parameters[scenario.parameterIndex];
        const target = parameter ? `${parameter.label}` : 'project defaults';
        throw new NativeBuildError('parity_mismatch', `Browser/VST3 parity did not match for ${target} at ${sampleRate} Hz.`, {
          diagnostics: parityDiagnostics(sampleRate, scenario, parameters, comparison),
        });
      }
      maxAbsoluteError = Math.max(maxAbsoluteError, comparison.maxAbsoluteError);
      rmsError = Math.max(rmsError, comparison.rmsError);
    }
    evidence.push({ sampleRate, passed: true, maxAbsoluteError, rmsError, maxTolerance: lock.parity.maxTolerance, rmsTolerance: lock.parity.rmsTolerance });
  }
  return evidence;
}

export async function verifyVst3StateRoundTrip(bundlePath, doctor, options = {}) {
  const run = options.run ?? defaultRun;
  const hostPath = options.hostPath ?? await buildVst3RenderHost(doctor, options);
  const result = await run(hostPath, ['--state-check', bundlePath]);
  if (!result.ok) throw new NativeBuildError('state_restore_failed', `VST3 state round trip failed: ${result.stderr || result.stdout}`);
  return { passed: true };
}
