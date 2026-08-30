import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import faust2wasmFiles from '@grame/faustwasm/src/faust2wasmFiles.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(root, 'public', 'faust');
const definitions = ['gain', 'filter', 'saturation'];
const modules = {};
const libraries = {};
let faustCompilerVersion = '';

await mkdir(outputRoot, { recursive: true });

for (const id of definitions) {
  const sourcePath = join(root, 'faust', `${id}.dsp`);
  const outputPath = join(outputRoot, id);
  const source = await readFile(sourcePath, 'utf8');
  await mkdir(outputPath, { recursive: true });
  const { dspMeta } = await faust2wasmFiles(sourcePath, outputPath, ['-single'], false);
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
    wasm: `/faust/${id}/dsp-module.wasm`,
    metadata: `/faust/${id}/dsp-meta.json`,
    inputs: dspMeta.inputs,
    outputs: dspMeta.outputs,
  };
}

const packageJson = JSON.parse(await readFile(join(root, 'node_modules', '@grame', 'faustwasm', 'package.json'), 'utf8'));
const manifest = {
  effectDefinition: 'audio-effect-builder-faust',
  definitionVersion: '0.1.0',
  faustWasmVersion: packageJson.version,
  faustCompilerVersion,
  libraries: Object.fromEntries(Object.entries(libraries).sort(([left], [right]) => left.localeCompare(right))),
  generatedAt: 'deterministic-build',
  modules,
};

await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const license = await readFile(join(root, 'node_modules', '@grame', 'faustwasm', 'COPYING.txt'), 'utf8');
await writeFile(
  join(outputRoot, 'FAUSTWASM-LICENSE.txt'),
  `${license.split('\n').map((line) => line.trimEnd()).join('\n').trimEnd()}\n`,
);
