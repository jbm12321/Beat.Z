import { execFile } from 'node:child_process';
import { access, mkdir, realpath, symlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { NativeBuildError } from './errors.mjs';
import { resolveWithin } from './safety.mjs';

const execFileAsync = promisify(execFile);
const IPLUG2_VST3_SOURCE_PARTS = ['base', 'pluginterfaces', 'public.sdk'];

async function defaultRun(command, argumentsList) {
  try {
    const result = await execFileAsync(command, argumentsList, {
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, stdout: error?.stdout ?? '', stderr: error?.stderr ?? '' };
  }
}

async function defaultArtifactExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureIPlug2Vst3SdkBridge(iPlug2Root, vst3SdkRoot) {
  const bridgeRoot = resolve(iPlug2Root, 'Dependencies', 'IPlug', 'VST3_SDK');
  await mkdir(bridgeRoot, { recursive: true, mode: 0o700 });
  for (const part of IPLUG2_VST3_SOURCE_PARTS) {
    const source = resolve(vst3SdkRoot, part);
    const destination = resolve(bridgeRoot, part);
    try {
      const [sourceRealPath, destinationRealPath] = await Promise.all([realpath(source), realpath(destination)]);
      if (sourceRealPath !== destinationRealPath) {
        throw new NativeBuildError('dependency_bridge_conflict', `iPlug2 VST3 SDK bridge ${part} points to an unexpected directory.`);
      }
    } catch (error) {
      if (error instanceof NativeBuildError) throw error;
      if (error?.code !== 'ENOENT') throw error;
      await symlink(source, destination, 'dir');
    }
  }
  return bridgeRoot;
}

export async function compileNativeVst3Sources(prepared, options = {}) {
  const { plan, doctor } = prepared;
  if (!doctor?.ok && options.allowUncheckedDoctor !== true) {
    throw new NativeBuildError('native_toolchain_mismatch', 'Native compile requires a passing doctor report.');
  }
  if (options.bridgeSdk !== false) {
    await ensureIPlug2Vst3SdkBridge(doctor.paths.iPlug2Root, doctor.paths.vst3SdkRoot);
  }
  const buildRoot = resolveWithin(plan.paths.workspaceRoot, 'build');
  await mkdir(buildRoot, { recursive: true, mode: 0o700 });
  const faustIncludeRoot = resolve(options.faustIncludeRoot ?? doctor.paths.faustIncludeRoot);
  const run = options.run ?? defaultRun;
  const configure = await run('cmake', [
    '--fresh',
    '-S', plan.paths.generatedRoot,
    '-B', buildRoot,
    '-G', doctor.generator,
    `-DIPLUG2_DIR=${doctor.paths.iPlug2Root}`,
    `-DFAUST_INCLUDE_DIR=${faustIncludeRoot}`,
    '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_OSX_ARCHITECTURES=arm64',
    '-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0',
    '-DCMAKE_MAKE_PROGRAM=/opt/homebrew/bin/ninja',
    '-DIPLUG_DEPLOY_PLUGINS=OFF',
  ]);
  if (!configure.ok) {
    throw new NativeBuildError('native_configure_failed', `CMake configuration failed: ${configure.stderr || configure.stdout}`);
  }
  const build = await run('cmake', ['--build', buildRoot, '--target', 'BeatZGeneratedPlugin-vst3', '--parallel', '4']);
  if (!build.ok) {
    throw new NativeBuildError('native_compile_failed', `VST3 compilation failed: ${build.stderr || build.stdout}`);
  }
  const bundlePath = join(buildRoot, 'out', 'BeatZGeneratedPlugin.vst3');
  const artifactExists = options.artifactExists ?? defaultArtifactExists;
  if (!await artifactExists(bundlePath)) {
    throw new NativeBuildError('native_compile_failed', 'The compiler completed without producing the expected VST3 bundle.');
  }
  return { buildRoot, bundlePath, configure, build };
}
