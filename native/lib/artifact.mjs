import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { NativeBuildError } from './errors.mjs';

const execFileAsync = promisify(execFile);

async function hashBundle(root) {
  const hash = createHash('sha256');
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path);
      if (entry.isSymbolicLink()) throw new NativeBuildError('invalid_artifact', 'VST3 bundle contains an unsupported symbolic link.');
      hash.update(entry.isDirectory() ? 'D\0' : 'F\0');
      hash.update(relativePath);
      hash.update('\0');
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) hash.update(await readFile(path));
      else throw new NativeBuildError('invalid_artifact', 'VST3 bundle contains an unsupported filesystem entry.');
    }
  }
  await visit(root);
  return hash.digest('hex');
}

async function defaultInspectArchitecture(bundlePath) {
  const executableRoot = join(bundlePath, 'Contents', 'MacOS');
  const executables = await readdir(executableRoot, { withFileTypes: true });
  const files = executables.filter((entry) => entry.isFile());
  if (files.length !== 1) throw new NativeBuildError('invalid_artifact', 'VST3 bundle must contain exactly one executable.');
  try {
    const result = await execFileAsync('lipo', ['-archs', join(executableRoot, files[0].name)], { encoding: 'utf8', timeout: 10_000 });
    return result.stdout.trim();
  } catch {
    throw new NativeBuildError('invalid_artifact', 'VST3 executable architecture could not be inspected.');
  }
}

export async function saveVerifiedVst3Bundle(sourceBundle, exportRoot, filename, options = {}) {
  if (basename(filename) !== filename || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.vst3$/u.test(filename)) {
    throw new NativeBuildError('unsafe_path', 'VST3 artifact filename is unsafe.');
  }
  const source = resolve(sourceBundle);
  const destinationRoot = resolve(exportRoot);
  const destination = join(destinationRoot, filename);
  const architecture = await (options.inspectArchitecture ?? defaultInspectArchitecture)(source);
  if (architecture !== 'arm64') throw new NativeBuildError('invalid_artifact', `VST3 architecture must be arm64, found ${architecture}.`);
  const sourceBundleSha256 = await hashBundle(source);
  await mkdir(destinationRoot, { recursive: true, mode: 0o700 });
  try {
    await access(destination, constants.F_OK);
    const existingBundleSha256 = await hashBundle(destination);
    if (existingBundleSha256 === sourceBundleSha256) {
      return { path: destination, bundleSha256: existingBundleSha256, architecture, reused: true };
    }
    throw new NativeBuildError('artifact_conflict', `Refusing to replace existing VST3 at ${destination}.`);
  } catch (error) {
    if (error instanceof NativeBuildError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  const temporary = join(destinationRoot, `.${filename}.tmp-${randomUUID()}`);
  try {
    await cp(source, temporary, { recursive: true, errorOnExist: true, force: false });
    const bundleSha256 = await hashBundle(temporary);
    if (bundleSha256 !== sourceBundleSha256) throw new NativeBuildError('invalid_artifact', 'The copied VST3 does not match the verified source bundle.');
    await rename(temporary, destination);
    return { path: destination, bundleSha256, architecture, reused: false };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
