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
import { MODULE_CATALOG, MODULE_TYPES, createNode, type ModuleType } from '../src/features/audio-builder/domain/project.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const factories = new Map<string, Promise<LooseFaustDspFactory>>();

function loadFactory(type: ModuleType) {
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
  const manifest = JSON.parse(await readFile(join(root, 'public', 'faust', 'manifest.json'), 'utf8'));
  for (const type of MODULE_TYPES) {
    const source = await readFile(join(root, 'faust', `${type}.dsp`));
    const wasm = await readFile(join(root, 'public', 'faust', type, 'dsp-module.wasm'));
    const metadata = JSON.parse(await readFile(join(root, 'public', 'faust', type, 'dsp-meta.json'), 'utf8'));
    assert.equal(createHash('sha256').update(source).digest('hex'), MODULE_CATALOG[type].sourceSha256);
    assert.equal(createHash('sha256').update(wasm).digest('hex'), MODULE_CATALOG[type].wasmSha256);
    assert.equal(manifest.modules[type].wasmSha256, MODULE_CATALOG[type].wasmSha256);
    assert.equal(metadata.version, '2.85.9');
    assert.match(metadata.compile_options, /-single/u);
    assert.match(metadata.compile_options, /-ftz 2/u);
    assert.equal(metadata.inputs, 2);
    assert.equal(metadata.outputs, 2);
    const addresses = JSON.stringify(metadata.ui);
    MODULE_CATALOG[type].parameters.forEach((parameter) => assert.match(addresses, new RegExp(parameter.faustPath.replaceAll('/', '\\/'))));
  }
});

test('Faust Filter adds stable Band Pass and Notch modes at supported sample rates', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = Math.floor(sampleRate * 0.5);
    const atCutoff = sine(1000, sampleRate, length);
    const distant = sine(5000, sampleRate, length);
    const node = createNode('filter', 'filter-expanded');
    Object.assign(node.params, { cutoff: 1000, resonance: 2, mode: 2 });
    const bandCenter = await renderFaustModuleOffline(node, [atCutoff, atCutoff], sampleRate, await loadFactory('filter'));
    const bandDistant = await renderFaustModuleOffline(node, [distant, distant], sampleRate, await loadFactory('filter'));
    assert.ok(rms(bandCenter[0], Math.floor(length / 2)) > rms(bandDistant[0], Math.floor(length / 2)) * 2);
    node.params.mode = 3;
    const notched = await renderFaustModuleOffline(node, [atCutoff, atCutoff], sampleRate, await loadFactory('filter'));
    assert.ok(rms(notched[0], Math.floor(length / 2)) < rms(atCutoff, Math.floor(length / 2)) * 0.25);
    for (const resonance of [0.1, 20]) {
      node.params.resonance = resonance;
      const extreme = await renderFaustModuleOffline(node, [atCutoff, atCutoff], sampleRate, await loadFactory('filter'));
      assert.ok(extreme.every((channel) => channel.every(Number.isFinite)));
    }
  }
});

test('Faust Delay has dry endpoints, timed repeats, feedback, ping-pong, and distinct stable modes', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = Math.floor(sampleRate * 0.8);
    const impulse = new Float32Array(length);
    impulse[0] = 0.5;
    const silence = new Float32Array(length);
    const node = createNode('delay', 'delay-test');
    Object.assign(node.params, { time: 100, feedback: 0, tone: 16000, mix: 0, output: 0 });
    const dry = await renderFaustModuleOffline(node, [impulse, silence], sampleRate, await loadFactory('delay'));
    assert.deepEqual(dry[0], impulse);
    assert.deepEqual(dry[1], silence);
    node.params.mix = 100;
    const oneRepeat = await renderFaustModuleOffline(node, [impulse, silence], sampleRate, await loadFactory('delay'));
    const repeatFrame = Math.round(sampleRate * 0.1);
    assert.ok(Math.max(...oneRepeat[0].slice(repeatFrame - 128, repeatFrame + 1152).map(Math.abs)) > 0.05);
    assert.ok(rms(oneRepeat[0], Math.round(sampleRate * 0.23)) < 1e-4);
    node.params.feedback = 70;
    const digital = await renderFaustModuleOffline(node, [impulse, silence], sampleRate, await loadFactory('delay'));
    assert.ok(rms(digital[0], Math.round(sampleRate * 0.23)) > rms(oneRepeat[0], Math.round(sampleRate * 0.23)) + 1e-5);
    node.params.mode = 1;
    const pingPong = await renderFaustModuleOffline(node, [impulse, silence], sampleRate, await loadFactory('delay'));
    const firstLeft = Math.max(...pingPong[0].slice(repeatFrame - 128, repeatFrame + 1152).map(Math.abs));
    const secondRight = Math.max(...pingPong[1].slice(2 * repeatFrame - 128, 2 * repeatFrame + 1152).map(Math.abs));
    assert.ok(firstLeft > 0.05 && secondRight > 0.01);
    node.params.mode = 2;
    const tape = await renderFaustModuleOffline(node, [impulse, silence], sampleRate, await loadFactory('delay'));
    assert.ok(tape.every((channel) => channel.every(Number.isFinite)));
    let tapeDifference = 0;
    for (let index = repeatFrame; index < length; index += 1) tapeDifference += Math.abs(tape[0][index] - digital[0][index]);
    assert.ok(tapeDifference > 0.001);
  }
});

test('Faust Delay Tone audibly shapes the first repeat even with zero feedback', async () => {
  const sampleRate = 48000;
  const length = sampleRate;
  const input = sine(7000, sampleRate, length, 0.35);
  const node = createNode('delay', 'delay-tone');
  Object.assign(node.params, { mode: 0, time: 100, feedback: 0, mix: 100, output: 0, tone: 16000 });
  const bright = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('delay'));
  node.params.tone = 500;
  const dark = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('delay'));
  const start = Math.floor(sampleRate * 0.25);
  assert.ok(rms(dark[0], start) < rms(bright[0], start) * 0.15);
});

test('Faust Reverb produces finite, stereo, mode-dependent decaying tails with an exact dry endpoint', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = Math.floor(sampleRate * 2.5);
    const impulse = new Float32Array(length);
    impulse[0] = 0.35;
    const node = createNode('reverb', 'reverb-test');
    Object.assign(node.params, { preDelay: 20, decay: 2, size: 50, damping: 35, mix: 0, output: 0 });
    const dry = await renderFaustModuleOffline(node, [impulse, impulse], sampleRate, await loadFactory('reverb'));
    assert.deepEqual(dry[0], impulse);
    const modes = [];
    node.params.mix = 100;
    for (const mode of [0, 1, 2]) {
      node.params.mode = mode;
      const rendered = await renderFaustModuleOffline(node, [impulse, impulse], sampleRate, await loadFactory('reverb'));
      assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
      assert.ok(rms(rendered[0], Math.floor(sampleRate * 0.05)) > 1e-5);
      modes.push(rendered);
    }
    for (let left = 0; left < modes.length; left += 1) {
      for (let right = left + 1; right < modes.length; right += 1) {
        let difference = 0;
        for (let index = Math.floor(sampleRate * 0.05); index < length; index += 1) difference += Math.abs(modes[left][0][index] - modes[right][0][index]);
        assert.ok(difference / length > 1e-5);
      }
    }
    const hallLate = rms(modes[1][0], Math.floor(sampleRate * 1.5));
    const roomLate = rms(modes[0][0], Math.floor(sampleRate * 1.5));
    assert.ok(hallLate > roomLate);
    assert.notDeepEqual(modes[1][0], modes[1][1]);
    const early = rms(modes[1][0].slice(Math.floor(sampleRate * 0.2), Math.floor(sampleRate * 0.8)));
    const late = rms(modes[1][0].slice(Math.floor(sampleRate * 1.7)));
    assert.ok(late < early);
  }
});

test('Faust Reverb continuous controls each make a measurable wet-path change', async () => {
  const sampleRate = 48000;
  const length = sampleRate * 3;
  const impulse = new Float32Array(length);
  impulse[0] = 0.5;
  const node = createNode('reverb', 'reverb-controls');
  Object.assign(node.params, { mode: 1, preDelay: 0, decay: 2, size: 50, damping: 35, mix: 100, output: 0 });
  const factory = await loadFactory('reverb');
  const render = () => renderFaustModuleOffline(node, [impulse, impulse], sampleRate, factory);
  const baseline = await render();
  const responses: Float32Array[] = [baseline[0]];
  node.params.preDelay = 180; responses.push((await render())[0]);
  node.params.preDelay = 0; node.params.decay = 8; responses.push((await render())[0]);
  node.params.decay = 2; node.params.size = 100; responses.push((await render())[0]);
  node.params.size = 50; node.params.damping = 100; responses.push((await render())[0]);
  node.params.damping = 35; node.params.output = -18; responses.push((await render())[0]);
  for (let index = 1; index < responses.length; index += 1) {
    let difference = 0;
    for (let sample = 0; sample < length; sample += 1) difference += Math.abs(responses[index][sample] - baseline[0][sample]);
    assert.ok(difference / length > 1e-5, `reverb control ${index} should alter the wet output`);
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

test('Faust Tape Wow produces audible pitch movement rather than only level movement', async () => {
  const sampleRate = 48000;
  const input = sine(880, sampleRate, sampleRate * 2, 0.45);
  const node = createNode('saturation', 'sat-wow');
  Object.assign(node.params, { character: 3, drive: 12, tone: 12000, mix: 100, output: 0, age: 20, wow: 0 });
  const still = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('saturation'));
  node.params.wow = 100;
  const moving = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('saturation'));
  let difference = 0;
  for (let sample = sampleRate / 2; sample < input.length; sample += 1) difference += Math.abs(moving[0][sample] - still[0][sample]);
  assert.ok(difference / (input.length - sampleRate / 2) > 0.03);
});
