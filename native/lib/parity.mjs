import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadFaustFactoryFromBytes, renderFaustProjectOffline } from '../../src/features/audio-builder/faust/runtime.ts';
import { NativeBuildError } from './errors.mjs';
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
  if (browser.length !== 2 || native.length !== 2 || browser[0].length !== browser[1].length || native[0].length !== native[1].length || browser[0].length !== native[0].length) {
    throw new NativeBuildError('parity_render_invalid', 'Browser and native stereo frame counts do not match.');
  }
  let maximum = 0;
  let squaredError = 0;
  let samples = 0;
  for (let channel = 0; channel < 2; channel += 1) {
    for (let frame = 0; frame < browser[channel].length; frame += 1) {
      const error = Math.abs(browser[channel][frame] - native[channel][frame]);
      maximum = Math.max(maximum, error);
      squaredError += error * error;
      samples += 1;
    }
  }
  const rmsError = Math.sqrt(squaredError / Math.max(1, samples));
  return { passed: maximum <= tolerance && rmsError <= tolerance, maxAbsoluteError: maximum, rmsError, tolerance };
}

export function createParityScenarios(macros) {
  const defaults = macros.map((macro) => macro.value);
  return [
    { id: 'defaults', values: defaults },
    ...macros.flatMap((_macro, macroIndex) => [0, 0.5, 1].map((value) => {
      const values = [...defaults];
      values[macroIndex] = value;
      return { id: `macro-${macroIndex}-${String(value).replace('.', '_')}`, values };
    })),
  ];
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
  const scenarios = createParityScenarios(request.dsp.macros);
  for (const sampleRate of lock.parity.sampleRates) {
    const frames = sampleRate;
    const input = deterministicInput(sampleRate, frames);
    let maxAbsoluteError = 0;
    let rmsError = 0;
    for (const scenario of scenarios) {
      const project = structuredClone(request.project);
      const scenarioValues = new Map(request.dsp.macros.map((macro, index) => [macro.id, scenario.values[index]]));
      project.macros.forEach((macro) => {
        const value = scenarioValues.get(macro.id);
        if (value !== undefined) macro.value = value;
      });
      const browser = await renderFaustProjectOffline(project, input, sampleRate, loadFactory);
      const nativeOutputPath = resolveWithin(parityRoot, `${sampleRate}-${scenario.id}.f32`);
      const parameterArguments = scenario.values.map((value, index) => `${index}=${value}`);
      const rendered = await run(hostPath, [bundlePath, String(sampleRate), String(frames), nativeOutputPath, ...parameterArguments]);
      if (!rendered.ok) throw new NativeBuildError('parity_render_failed', `Actual VST3 render failed at ${sampleRate} Hz: ${rendered.stderr || rendered.stdout}`);
      const encoded = await readFile(nativeOutputPath);
      if (encoded.byteLength !== frames * 2 * Float32Array.BYTES_PER_ELEMENT) {
        throw new NativeBuildError('parity_render_invalid', `Actual VST3 render returned an invalid frame count at ${sampleRate} Hz.`);
      }
      const samples = new Float32Array(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength));
      const native = [samples.slice(0, frames), samples.slice(frames)];
      const comparison = compareStereoParity(browser, native, lock.parity.maxTolerance);
      if (!comparison.passed) throw new NativeBuildError('parity_mismatch', `Browser/VST3 parity exceeded tolerance at ${sampleRate} Hz for ${scenario.id}.`);
      maxAbsoluteError = Math.max(maxAbsoluteError, comparison.maxAbsoluteError);
      rmsError = Math.max(rmsError, comparison.rmsError);
    }
    evidence.push({ sampleRate, passed: true, maxAbsoluteError, rmsError, tolerance: lock.parity.maxTolerance });
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
