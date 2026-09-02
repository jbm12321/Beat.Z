import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import type { LooseFaustDspFactory } from '@grame/faustwasm/dist/esm/index.js';
import {
  loadFaustFactoryFromBytes,
  renderFaustModuleOffline,
} from '../src/features/audio-builder/faust/runtime.ts';
import { MODULE_CATALOG, createNode } from '../src/features/audio-builder/domain/project.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const factories = new Map<string, Promise<LooseFaustDspFactory>>();

function loadFactory(type: 'gain' | 'filter' | 'saturation') {
  let promise = factories.get(type);
  if (!promise) {
    promise = Promise.all([
      readFile(join(root, 'public', 'faust', type, 'dsp-module.wasm')),
      readFile(join(root, 'public', 'faust', type, 'dsp-meta.json'), 'utf8'),
    ]).then(([wasm, json]) => loadFaustFactoryFromBytes(wasm, json));
    factories.set(type, promise);
  }
  return promise;
}

function sine(frequency: number, sampleRate: number, length: number, amplitude = 0.2) {
  return Float32Array.from({ length }, (_, index) => Math.sin(2 * Math.PI * frequency * index / sampleRate) * amplitude);
}

function rms(samples: Float32Array, start = 0) {
  let energy = 0;
  for (let index = start; index < samples.length; index += 1) energy += samples[index] ** 2;
  return Math.sqrt(energy / Math.max(1, samples.length - start));
}

test('committed Faust sources and metadata match the catalog fingerprints and stereo contract', async () => {
  for (const type of ['gain', 'filter', 'saturation'] as const) {
    const source = await readFile(join(root, 'faust', `${type}.dsp`));
    const metadata = JSON.parse(await readFile(join(root, 'public', 'faust', type, 'dsp-meta.json'), 'utf8'));
    assert.equal(createHash('sha256').update(source).digest('hex'), MODULE_CATALOG[type].sourceSha256);
    assert.equal(metadata.version, '2.86.2');
    assert.equal(metadata.inputs, 2);
    assert.equal(metadata.outputs, 2);
    const addresses = JSON.stringify(metadata.ui);
    MODULE_CATALOG[type].parameters.forEach((parameter) => assert.match(addresses, new RegExp(parameter.faustPath.replaceAll('/', '\\/'))));
  }
});

test('Faust Gain is unity at 0 dB and linked across stereo channels', async () => {
  const sampleRate = 48000;
  const input = sine(440, sampleRate, sampleRate / 2);
  const node = createNode('gain', 'gain-1');
  const unity = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('gain'));
  for (let index = 0; index < input.length; index += 1) {
    assert.ok(Math.abs(unity[0][index] - input[index]) < 1e-6);
    assert.equal(unity[0][index], unity[1][index]);
  }
  node.params.level = -12;
  const reduced = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('gain'));
  assert.ok(rms(reduced[0], 12000) < rms(input, 12000) * 0.3);
  assert.ok(rms(reduced[0], 12000) > rms(input, 12000) * 0.2);
  node.bypassed = true;
  const bypassed = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('gain'));
  assert.deepEqual(bypassed[0], input);
});

test('Faust unified Filter performs high-pass and low-pass shaping without changing its node identity', async () => {
  const sampleRate = 48000;
  const length = sampleRate;
  const low = sine(100, sampleRate, length);
  const high = sine(5000, sampleRate, length);
  const input = Float32Array.from({ length }, (_, index) => low[index] + high[index]);
  const node = createNode('filter', 'filter-1');
  node.params.cutoff = 1000;
  node.params.resonance = 0.7;
  node.params.mode = 0;
  const highPassed = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('filter'));
  const highPassLowTone = await renderFaustModuleOffline(node, [low, low], sampleRate, await loadFactory('filter'));
  const highPassHighTone = await renderFaustModuleOffline(node, [high, high], sampleRate, await loadFactory('filter'));
  node.params.mode = 1;
  const lowPassed = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('filter'));
  const lowPassLowTone = await renderFaustModuleOffline(node, [low, low], sampleRate, await loadFactory('filter'));
  const lowPassHighTone = await renderFaustModuleOffline(node, [high, high], sampleRate, await loadFactory('filter'));
  assert.equal(node.id, 'filter-1');
  assert.ok(rms(highPassed[0], 12000) > 0.02);
  assert.ok(rms(lowPassed[0], 12000) > 0.02);
  assert.ok(rms(highPassHighTone[0], 12000) > rms(highPassLowTone[0], 12000) * 5);
  assert.ok(rms(lowPassLowTone[0], 12000) > rms(lowPassHighTone[0], 12000) * 8);
  let difference = 0;
  for (let index = 12000; index < length; index += 1) difference += Math.abs(highPassed[0][index] - lowPassed[0][index]);
  assert.ok(difference / (length - 12000) > 0.05);
});

test('Faust Saturation is dry at 0% mix and remains finite at all supported sample rates', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const input = sine(330, sampleRate, Math.floor(sampleRate * 0.5), 0.18);
    const node = createNode('saturation', 'sat-1');
    node.params.drive = 24;
    node.params.tone = 16000;
    node.params.mix = 0;
    const dry = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('saturation'));
    let steadyError = 0;
    const start = Math.floor(sampleRate * 0.2);
    for (let index = start; index < input.length; index += 1) steadyError += Math.abs(dry[0][index] - input[index]);
    assert.ok(steadyError / (input.length - start) < 0.001);
    node.params.mix = 100;
    const wet = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('saturation'));
    assert.ok(wet.every((channel) => channel.every(Number.isFinite)));
    assert.ok(rms(wet[0], start) > 0.01);
  }
});

test('Faust Saturation drive and tone progressively change the processed signal', async () => {
  const sampleRate = 48000;
  const input = sine(3000, sampleRate, sampleRate / 2, 0.35);
  const node = createNode('saturation', 'sat-color');
  node.params.mix = 100;
  node.params.tone = 16000;
  node.params.drive = 0;
  const clean = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('saturation'));
  node.params.drive = 24;
  const driven = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('saturation'));
  node.params.tone = 200;
  const dark = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('saturation'));
  const start = 12000;
  let coloration = 0;
  for (let index = start; index < input.length; index += 1) coloration += Math.abs(driven[0][index] - clean[0][index]);
  assert.ok(coloration / (input.length - start) > 0.05);
  assert.ok(rms(dark[0], start) < rms(driven[0], start) * 0.2);
});

test('Faust Saturation characters are distinct, stable, and retain legacy Soft Clip defaults', async () => {
  const sampleRate = 48000;
  const input = sine(900, sampleRate, sampleRate, 0.65);
  const node = createNode('saturation', 'sat-characters');
  Object.assign(node.params, { drive: 18, tone: 12000, mix: 100, output: 0, bias: 0.3, clip: 0.3, age: 70, wow: 30 });
  const outputs: Float32Array[] = [];
  for (const character of [0, 1, 2, 3]) {
    node.params.character = character;
    const rendered = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('saturation'));
    assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
    outputs.push(rendered[0]);
  }
  const start = sampleRate / 4;
  for (let index = 0; index < outputs.length; index += 1) {
    for (let comparison = index + 1; comparison < outputs.length; comparison += 1) {
      let difference = 0;
      for (let sample = start; sample < input.length; sample += 1) difference += Math.abs(outputs[index][sample] - outputs[comparison][sample]);
      assert.ok(difference / (input.length - start) > 0.0005, `characters ${index} and ${comparison} should sound distinct`);
    }
  }
});
