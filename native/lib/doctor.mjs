import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { NativeBuildError } from './errors.mjs';
import { loadToolchainLock } from './spec.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function output(command, args = []) {
  try {
    const result = await execFileAsync(command, args, { encoding: 'utf8', timeout: 20_000 });
    return `${result.stdout}\n${result.stderr}`.trim();
  } catch {
    throw new NativeBuildError('native_toolchain_mismatch', `${command} is unavailable.`, {
      publicMessage: 'The Mac build worker is not ready. Start it again after updating its toolchain.',
    });
  }
}

async function requirePath(path, label) {
  try { await access(path, constants.R_OK); } catch {
    throw new NativeBuildError('native_toolchain_mismatch', `${label} is missing at ${path}.`, {
      publicMessage: 'The Mac build worker is not ready. Start it again after updating its toolchain.',
    });
  }
}

export async function inspectNativeToolchain(options = {}) {
  const lock = options.lock ?? await loadToolchainLock();
  const root = resolve(options.repositoryRoot ?? repositoryRoot);
  const iPlug2Root = resolve(root, 'native/vendor/iPlug2');
  const vst3SdkRoot = resolve(root, 'native/vendor/vst3sdk');
  const validatorPath = resolve(root, 'native/build/vst3sdk/bin/Release/validator');
  const faustIncludeRoot = resolve(lock.faust.includeRoot);
  const faustHeaderPath = resolve(faustIncludeRoot, 'faust/export.h');
  const faustVersionOutput = await output(lock.faust.nativeCommand, ['--version']);
  const faustVersion = faustVersionOutput.match(/FAUST Version\s+([^\s]+)/u)?.[1] ?? '';
  const cmakeVersion = await output('cmake', ['--version']);
  const ninjaVersion = await output('ninja', ['--version']);
  const architecture = await output('uname', ['-m']);
  const clangVersion = await output('clang++', ['--version']);
  const iPlugRevision = await output('git', ['-C', iPlug2Root, 'rev-parse', 'HEAD']);
  const sdkRevision = await output('git', ['-C', vst3SdkRoot, 'rev-parse', 'HEAD']);
  await Promise.all([
    requirePath(validatorPath, 'Steinberg validator'),
    requirePath(resolve(faustIncludeRoot, 'faust/dsp/dsp.h'), 'Faust DSP headers'),
    requirePath(faustHeaderPath, 'Faust version header'),
    requirePath(resolve(iPlug2Root, 'iPlug2.cmake'), 'iPlug2'),
    requirePath(resolve(vst3SdkRoot, 'CMakeLists.txt'), 'VST3 SDK'),
  ]);
  const faustHeader = await readFile(faustHeaderPath, 'utf8');
  const faustHeaderVersion = faustHeader.match(/#define\s+FAUSTVERSION\s+"([^"]+)"/u)?.[1] ?? '';
  const mismatches = [
    faustVersion !== lock.faust.version && `Faust executable ${lock.faust.version} (found ${faustVersion || 'unknown'})`,
    faustHeaderVersion !== lock.faust.version && `Faust headers ${lock.faust.version} (found ${faustHeaderVersion || 'unknown'})`,
    !cmakeVersion.includes(lock.cmake.version) && `CMake ${lock.cmake.version}`,
    ninjaVersion.trim() !== lock.ninja.version && `Ninja ${lock.ninja.version}`,
    architecture.trim() !== lock.target.architecture && lock.target.architecture,
    !clangVersion.includes(lock.compiler.version) && `${lock.compiler.name} ${lock.compiler.version}`,
    iPlugRevision.trim() !== lock.iPlug2.revision && 'pinned iPlug2 revision',
    sdkRevision.trim() !== lock.vst3Sdk.revision && 'pinned VST3 SDK revision',
  ].filter(Boolean);
  if (mismatches.length) {
    throw new NativeBuildError('native_toolchain_mismatch', `Native toolchain mismatch: ${mismatches.join(', ')}.`, {
      publicMessage: 'The Mac build worker is not ready. Start it again after updating its toolchain.',
      diagnostics: { expectedFaustVersion: lock.faust.version, faustVersion, faustHeaderVersion },
    });
  }
  return {
    ok: true,
    generator: lock.cmake.generator,
    versions: { faust: faustVersion, faustHeaders: faustHeaderVersion },
    paths: { repositoryRoot: root, iPlug2Root, vst3SdkRoot, validatorPath, faustIncludeRoot },
  };
}
