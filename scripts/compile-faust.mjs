import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(root, 'public', 'faust');
const definitions = ['gain', 'filter', 'saturation', 'delay', 'reverb'];
const execFileAsync = promisify(execFile);
const toolchain = JSON.parse(await readFile(join(root, 'native', 'toolchain.lock.json'), 'utf8'));
const faustCommand = toolchain.faust.nativeCommand;
const faustCodegenFlags = toolchain.faust.codegenFlags;
const faustWasmRoot = join(root, 'node_modules', '@grame', 'faustwasm');
const faustWasmPackage = JSON.parse(await readFile(join(faustWasmRoot, 'package.json'), 'utf8'));
const browserRuntimePath = join(faustWasmRoot, 'dist', 'esm', 'index.js');
const browserRuntime = await readFile(browserRuntimePath);
const browserRuntimeSha256 = createHash('sha256').update(browserRuntime).digest('hex');
const modules = {};
const libraries = {};
let faustCompilerVersion = '';

await mkdir(outputRoot, { recursive: true });

if (faustWasmPackage.version !== toolchain.faust.browserPackageVersion) {
  throw new Error(`The pinned ${toolchain.faust.browserPackage} package is ${toolchain.faust.browserPackageVersion}, but ${faustWasmPackage.version ?? 'an unknown version'} is installed.`);
}

const versionResult = await execFileAsync(faustCommand, ['--version'], { encoding: 'utf8', timeout: 20_000 });
const installedVersion = `${versionResult.stdout}\n${versionResult.stderr}`.match(/FAUST Version\s+([^\s]+)/u)?.[1];
if (installedVersion !== toolchain.faust.version) {
  throw new Error(`The pinned Faust compiler is ${toolchain.faust.version}, but ${installedVersion ?? 'an unknown version'} is installed.`);
}

for (const id of definitions) {
  const sourcePath = join(root, 'faust', `${id}.dsp`);
  const outputPath = join(outputRoot, id);
  const source = await readFile(sourcePath, 'utf8');
  await mkdir(outputPath, { recursive: true });
  const compileRoot = await mkdtemp(join(tmpdir(), `beatz-faust-${id}-`));
  let wasm;
  let metadataSource;
  try {
    await execFileAsync(faustCommand, [
      '-lang', 'wasm-i',
      ...faustCodegenFlags,
      '-json',
      '-O', compileRoot,
      '-o', 'dsp-module.wasm',
      sourcePath,
    ], { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    [wasm, metadataSource] = await Promise.all([
      readFile(join(compileRoot, 'dsp-module.wasm')),
      readFile(join(compileRoot, 'dsp-module.json'), 'utf8'),
    ]);
  } finally {
    await rm(compileRoot, { recursive: true, force: true });
  }
  const dspMeta = JSON.parse(metadataSource);
  if (dspMeta.version !== toolchain.faust.version) {
    throw new Error(`Faust generated ${id} with unexpected compiler version ${String(dspMeta.version)}.`);
  }
  await Promise.all([
    writeFile(join(outputPath, 'dsp-module.wasm'), wasm),
    writeFile(join(outputPath, 'dsp-meta.json'), `${JSON.stringify(dspMeta, null, 2)}\n`),
  ]);
  faustCompilerVersion ||= dspMeta.version;
  for (const entry of dspMeta.meta ?? []) {
    for (const [key, value] of Object.entries(entry)) {
      if (key.endsWith('.lib/version')) libraries[key.replace('.lib/version', '')] = value;
    }
  }
  modules[id] = {
    definitionVersion: '0.1.0',
    source: `faust/${id}.dsp`,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    wasmSha256: createHash('sha256').update(wasm).digest('hex'),
    wasm: `/faust/${id}/dsp-module.wasm`,
    metadata: `/faust/${id}/dsp-meta.json`,
    inputs: dspMeta.inputs,
    outputs: dspMeta.outputs,
  };
}

const manifest = {
  effectDefinition: 'audio-effect-builder-faust',
  definitionVersion: '0.1.0',
  faustWasmVersion: faustWasmPackage.version,
  faustCompilerVersion,
  browserRuntime: {
    package: toolchain.faust.browserPackage,
    version: faustWasmPackage.version,
    path: '/faust/faustwasm-runtime.js',
    sha256: browserRuntimeSha256,
  },
  libraries: Object.fromEntries(Object.entries(libraries).sort(([left], [right]) => left.localeCompare(right))),
  generatedAt: 'deterministic-build',
  modules,
};

const license = await readFile(join(faustWasmRoot, 'COPYING.txt'), 'utf8');
await Promise.all([
  writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(join(outputRoot, 'faustwasm-runtime.js'), browserRuntime),
  writeFile(
    join(outputRoot, 'FAUSTWASM-LICENSE.txt'),
    `${license.split('\n').map((line) => line.trimEnd()).join('\n').trimEnd()}\n`,
  ),
]);
