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

function rmsRange(samples: Float32Array, start: number, end: number) {
  let energy = 0;
  for (let index = start; index < end; index += 1) energy += samples[index] ** 2;
  return Math.sqrt(energy / Math.max(1, end - start));
}

function meanAbsoluteDifference(left: Float32Array, right: Float32Array, start = 0) {
  let difference = 0;
  for (let index = start; index < Math.min(left.length, right.length); index += 1) difference += Math.abs(left[index] - right[index]);
  return difference / Math.max(1, Math.min(left.length, right.length) - start);
}

function peakAbsolute(samples: Float32Array) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

function firstFrameAbove(samples: Float32Array, threshold: number) {
  return samples.findIndex((sample) => Math.abs(sample) > threshold);
}

function fractionalDelayReference(samples: Float32Array, delay: number) {
  const whole = Math.floor(delay);
  const fraction = delay - whole;
  return Float32Array.from({ length: samples.length }, (_, frame) => {
    const recent = frame - whole >= 0 ? samples[frame - whole] : 0;
    const older = frame - whole - 1 >= 0 ? samples[frame - whole - 1] : 0;
    return recent * (1 - fraction) + older * fraction;
  });
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

test('the deployed Faust browser runtime is the exact pinned untransformed module', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'public', 'faust', 'manifest.json'), 'utf8'));
  const packageJson = JSON.parse(await readFile(join(root, 'node_modules', '@grame', 'faustwasm', 'package.json'), 'utf8'));
  const upstream = await readFile(join(root, 'node_modules', '@grame', 'faustwasm', 'dist', 'esm', 'index.js'));
  const deployed = await readFile(join(root, 'public', 'faust', 'faustwasm-runtime.js'));
  const sha256 = createHash('sha256').update(deployed).digest('hex');

  assert.deepEqual(deployed, upstream);
  assert.equal(packageJson.version, '0.16.6');
  assert.deepEqual(manifest.browserRuntime, {
    package: '@grame/faustwasm',
    version: '0.16.6',
    path: '/faust/faustwasm-runtime.js',
    sha256,
  });
  const source = deployed.toString('utf8');
  assert.match(source, /var FaustBaseWebAudioDsp = class _FaustBaseWebAudioDsp/u);
  assert.match(source, /var FaustMonoWebAudioDsp = class extends FaustBaseWebAudioDsp/u);
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

test('Faust Chorus has an exact dry endpoint and finite, distinct stereo modes at every supported sample rate', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const input = sine(440, sampleRate, sampleRate, 0.3);
    const node = createNode('chorus', 'chorus-modes');
    node.params.mix = 0;
    const dry = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('chorus'));
    assert.deepEqual(dry[0], input);
    assert.deepEqual(dry[1], input);

    node.params.mix = 100;
    const modes: Float32Array[][] = [];
    for (const mode of [0, 1, 2]) {
      node.params.mode = mode;
      const rendered = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('chorus'));
      assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
      assert.ok(rms(rendered[0], Math.floor(sampleRate * 0.25)) > 0.01);
      assert.notDeepEqual(rendered[0], rendered[1]);
      modes.push(rendered);
    }
    for (let index = 0; index < modes.length; index += 1) {
      for (let comparison = index + 1; comparison < modes.length; comparison += 1) {
        let difference = 0;
        for (let sample = Math.floor(sampleRate * 0.25); sample < input.length; sample += 1) difference += Math.abs(modes[index][0][sample] - modes[comparison][0][sample]);
        assert.ok(difference / input.length > 0.001);
      }
    }
  }
});

test('Faust Chorus Rate, Depth, Delay, and Output each change the wet signal', async () => {
  const sampleRate = 48000;
  const input = sine(700, sampleRate, sampleRate * 2, 0.3);
  const node = createNode('chorus', 'chorus-controls');
  Object.assign(node.params, { mode: 2, rate: 0.8, depth: 35, delay: 15, mix: 100, output: 0 });
  const factory = await loadFactory('chorus');
  const render = () => renderFaustModuleOffline(node, [input, input], sampleRate, factory);
  const baseline = (await render())[0];
  const alternatives: Float32Array[] = [];
  node.params.rate = 4; alternatives.push((await render())[0]);
  node.params.rate = 0.8; node.params.depth = 100; alternatives.push((await render())[0]);
  node.params.depth = 35; node.params.delay = 30; alternatives.push((await render())[0]);
  node.params.delay = 15; node.params.output = -12; alternatives.push((await render())[0]);
  for (const alternative of alternatives) {
    let difference = 0;
    for (let sample = sampleRate / 2; sample < input.length; sample += 1) difference += Math.abs(alternative[sample] - baseline[sample]);
    assert.ok(difference / (input.length - sampleRate / 2) > 0.001);
  }
});

test('Faust Phaser has an exact dry endpoint and distinct stable modes', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = sampleRate * 2;
    const input = Float32Array.from({ length }, (_, index) => (
      Math.sin(2 * Math.PI * 173 * index / sampleRate) * 0.22
      + Math.sin(2 * Math.PI * 997 * index / sampleRate) * 0.16
      + Math.sin(2 * Math.PI * 3100 * index / sampleRate) * 0.08
    ));
    const node = createNode('phaser', 'phaser-modes');
    Object.assign(node.params, { rate: 0.7, depth: 75, center: 700, feedback: 35, mix: 0, output: 0 });
    const factory = await loadFactory('phaser');
    const dry = await renderFaustModuleOffline(node, [input, input], sampleRate, factory);
    assert.deepEqual(dry[0], input);
    assert.deepEqual(dry[1], input);

    node.params.mix = 50;
    const modes: Float32Array[][] = [];
    for (const mode of [0, 1, 2]) {
      node.params.mode = mode;
      const rendered = await renderFaustModuleOffline(node, [input, input], sampleRate, factory);
      assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
      assert.ok(rms(rendered[0], sampleRate) > 0.01);
      modes.push(rendered);
    }
    assert.deepEqual(modes[0][0], modes[0][1]);
    assert.notDeepEqual(modes[1][0], modes[1][1]);
    assert.notDeepEqual(modes[2][0], modes[2][1]);
    for (let index = 0; index < modes.length; index += 1) {
      for (let comparison = index + 1; comparison < modes.length; comparison += 1) {
        let difference = 0;
        for (let sample = sampleRate; sample < length; sample += 1) difference += Math.abs(modes[index][0][sample] - modes[comparison][0][sample]);
        assert.ok(difference / sampleRate > 0.001);
      }
    }
  }
});

test('Faust Phaser Rate, Depth, Center, Feedback, Mix, and Output each change the signal', async () => {
  const sampleRate = 48000;
  const length = sampleRate * 2;
  const input = sine(880, sampleRate, length, 0.3);
  const node = createNode('phaser', 'phaser-controls');
  Object.assign(node.params, { mode: 2, rate: 0.5, depth: 60, center: 700, feedback: 15, mix: 50, output: 0 });
  const factory = await loadFactory('phaser');
  const render = () => renderFaustModuleOffline(node, [input, input], sampleRate, factory);
  const baseline = (await render())[0];
  const alternatives: Float32Array[] = [];
  node.params.rate = 3; alternatives.push((await render())[0]);
  node.params.rate = 0.5; node.params.depth = 0; alternatives.push((await render())[0]);
  node.params.depth = 60; node.params.center = 1600; alternatives.push((await render())[0]);
  node.params.center = 700; node.params.feedback = -70; alternatives.push((await render())[0]);
  node.params.feedback = 15; node.params.mix = 100; alternatives.push((await render())[0]);
  node.params.mix = 50; node.params.output = -12; alternatives.push((await render())[0]);
  for (const alternative of alternatives) {
    let difference = 0;
    for (let sample = sampleRate / 2; sample < length; sample += 1) difference += Math.abs(alternative[sample] - baseline[sample]);
    assert.ok(difference / (length - sampleRate / 2) > 0.0001);
  }
});

test('Faust Compressor has an exact dry endpoint and linked finite stereo gain reduction', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = sampleRate * 2;
    const loud = sine(220, sampleRate, length, 0.8);
    const quiet = sine(330, sampleRate, length, 0.08);
    const node = createNode('compressor', 'compressor-linked');
    Object.assign(node.params, { threshold: -24, ratio: 8, attack: 1, release: 100, makeup: 0, mix: 0 });
    const dry = await renderFaustModuleOffline(node, [loud, quiet], sampleRate, await loadFactory('compressor'));
    assert.deepEqual(dry[0], loud);
    assert.deepEqual(dry[1], quiet);

    node.params.mix = 100;
    const compressed = await renderFaustModuleOffline(node, [loud, quiet], sampleRate, await loadFactory('compressor'));
    const start = Math.floor(sampleRate * 0.75);
    assert.ok(compressed.every((channel) => channel.every(Number.isFinite)));
    assert.ok(rms(compressed[0], start) < rms(loud, start) * 0.65);
    assert.ok(rms(compressed[1], start) < rms(quiet, start) * 0.65);
  }
});

test('Faust Compressor ratio, attack, release, and makeup produce measurable dynamics changes', async () => {
  const sampleRate = 48000;
  const length = sampleRate * 3;
  const input = new Float32Array(length);
  for (let sample = 0; sample < length; sample += 1) {
    const sectionAmplitude = sample < sampleRate ? 0.05 : sample < sampleRate * 2 ? 0.85 : 0.05;
    input[sample] = Math.sin(2 * Math.PI * 180 * sample / sampleRate) * sectionAmplitude;
  }
  const node = createNode('compressor', 'compressor-controls');
  Object.assign(node.params, { threshold: -24, ratio: 4, attack: 20, release: 250, makeup: 0, mix: 100 });
  const factory = await loadFactory('compressor');
  const render = () => renderFaustModuleOffline(node, [input, input], sampleRate, factory);
  const baseline = (await render())[0];
  const alternatives: Float32Array[] = [];
  node.params.ratio = 20; alternatives.push((await render())[0]);
  node.params.ratio = 4; node.params.attack = 0.1; alternatives.push((await render())[0]);
  node.params.attack = 20; node.params.release = 2000; alternatives.push((await render())[0]);
  node.params.release = 250; node.params.makeup = 12; alternatives.push((await render())[0]);
  for (const alternative of alternatives) {
    let difference = 0;
    for (let sample = sampleRate; sample < input.length; sample += 1) difference += Math.abs(alternative[sample] - baseline[sample]);
    assert.ok(difference / (input.length - sampleRate) > 0.0001);
  }
});

test('Faust Compressor Clean preserves the pre-mode render within tight floating-point tolerance', async () => {
  const expected = new Map([
    [44100, [[0.2907471928, 0.1083875667, 0.1083424820], [0.0654385988, 0.1816216597, 0.1815461187]]],
    [48000, [[0.2907486371, 0.1083862275, 0.1083410300], [0.0654390818, 0.1816194144, 0.1815436830]]],
    [96000, [[0.2907851234, 0.1083957599, 0.1083503814], [0.0654482153, 0.1816353906, 0.1815593596]]],
  ]);
  for (const sampleRate of expected.keys()) {
    const length = sampleRate * 2;
    const left = Float32Array.from({ length }, (_, index) => Math.sin(2 * Math.PI * 173 * index / sampleRate) * (index < sampleRate / 5 ? 0.8 : 0.37));
    const right = Float32Array.from({ length }, (_, index) => Math.sin(2 * Math.PI * 271 * index / sampleRate) * (index < sampleRate / 3 ? 0.18 : 0.62));
    const node = createNode('compressor', 'legacy-clean');
    Object.assign(node.params, { mode: 0, threshold: -21.7, ratio: 5.3, attack: 13.4, release: 317, makeup: 2.5, mix: 73 });
    const rendered = await renderFaustModuleOffline(node, [left, right], sampleRate, await loadFactory('compressor'));
    const measured = rendered.map((channel) => [
      rmsRange(channel, 0, Math.floor(sampleRate * 0.2)),
      rmsRange(channel, Math.floor(sampleRate * 0.5), sampleRate),
      rmsRange(channel, sampleRate, length),
    ]);
    measured.forEach((channel, channelIndex) => channel.forEach((value, index) => {
      assert.ok(Math.abs(value - expected.get(sampleRate)![channelIndex][index]) < 2e-6);
    }));
  }
});

test('Faust Compressor Clean, Punch, and Glue use measurably different linked detectors', async () => {
  const sampleRate = 48000;
  const length = sampleRate * 4;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let sample = 0; sample < length; sample += 1) {
    const transient = sample % Math.floor(sampleRate * 0.5) < 240 ? Math.exp(-(sample % Math.floor(sampleRate * 0.5)) / 55) * 0.9 : 0;
    const body = sample > sampleRate / 2 ? Math.sin(2 * Math.PI * 70 * sample / sampleRate) * 0.65 : 0;
    const sustained = sample > sampleRate ? Math.sin(2 * Math.PI * 700 * sample / sampleRate) * 0.22 : 0;
    left[sample] = body + sustained + transient;
    right[sample] = body * 0.8 + sustained * 0.7 + transient * 0.4;
  }
  const node = createNode('compressor', 'compressor-modes');
  Object.assign(node.params, { threshold: -24, ratio: 8, attack: 10, release: 300, makeup: 0, mix: 100 });
  const factory = await loadFactory('compressor');
  const modes: Float32Array[][] = [];
  for (const mode of [0, 1, 2]) {
    node.params.mode = mode;
    const rendered = await renderFaustModuleOffline(node, [left, right], sampleRate, factory);
    assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
    modes.push(rendered);
  }
  for (let index = 0; index < modes.length; index += 1) {
    for (let comparison = index + 1; comparison < modes.length; comparison += 1) {
      let difference = 0;
      for (let sample = sampleRate; sample < length; sample += 1) difference += Math.abs(modes[index][0][sample] - modes[comparison][0][sample]);
      assert.ok(difference / (length - sampleRate) > 0.0001);
    }
  }
  const transientStart = sampleRate * 2;
  const peak = (samples: Float32Array) => Math.max(...samples.slice(transientStart, transientStart + 240).map(Math.abs));
  assert.ok(peak(modes[1][0]) > peak(modes[0][0]));
});

test('Faust Auto Wah has an exact dry endpoint and four finite non-Band-Pass modes', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = sampleRate;
    const input = Float32Array.from({ length }, (_, index) => (
      Math.sin(2 * Math.PI * 180 * index / sampleRate) * 0.24
      + Math.sin(2 * Math.PI * 1400 * index / sampleRate) * 0.13
      + Math.sin(2 * Math.PI * 5200 * index / sampleRate) * 0.06
    ));
    const node = createNode('autowah', 'autowah-modes');
    const factory = await loadFactory('autowah');
    node.params.mix = 0;
    const dry = await renderFaustModuleOffline(node, [input, input], sampleRate, factory);
    assert.deepEqual(dry[0], input);
    assert.deepEqual(dry[1], input);

    node.params.mix = 100;
    const modes: Float32Array[][] = [];
    for (const mode of [0, 1, 2, 3]) {
      node.params.mode = mode;
      const rendered = await renderFaustModuleOffline(node, [input, input], sampleRate, factory);
      assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
      assert.ok(rms(rendered[0], Math.floor(sampleRate * 0.25)) > 0.001);
      modes.push(rendered);
    }
    for (let index = 0; index < modes.length; index += 1) {
      for (let comparison = index + 1; comparison < modes.length; comparison += 1) {
        let difference = 0;
        for (let sample = Math.floor(sampleRate * 0.25); sample < length; sample += 1) difference += Math.abs(modes[index][0][sample] - modes[comparison][0][sample]);
        assert.ok(difference / (length - Math.floor(sampleRate * 0.25)) > 0.0001);
      }
    }
  }
});

test('Faust Auto Wah sensitivity and linked stereo envelope change the filter response', async () => {
  const sampleRate = 48000;
  const length = sampleRate * 2;
  const loudLeft = Float32Array.from({ length }, (_, index) => Math.sin(2 * Math.PI * 190 * index / sampleRate) * (index < sampleRate ? 0.04 : 0.65));
  const quietRight = sine(1800, sampleRate, length, 0.04);
  const node = createNode('autowah', 'autowah-envelope');
  Object.assign(node.params, { mode: 0, sensitivity: -12, attack: 10, release: 180, frequency: 300, range: 100, resonance: 3, mix: 100, output: 0 });
  const factory = await loadFactory('autowah');
  const lowSensitivity = await renderFaustModuleOffline(node, [loudLeft, quietRight], sampleRate, factory);
  node.params.sensitivity = 24;
  const highSensitivity = await renderFaustModuleOffline(node, [loudLeft, quietRight], sampleRate, factory);
  let leftDifference = 0;
  let rightDifference = 0;
  for (let sample = sampleRate; sample < length; sample += 1) {
    leftDifference += Math.abs(highSensitivity[0][sample] - lowSensitivity[0][sample]);
    rightDifference += Math.abs(highSensitivity[1][sample] - lowSensitivity[1][sample]);
  }
  assert.ok(leftDifference / sampleRate > 0.001);
  assert.ok(rightDifference / sampleRate > 0.001);
});

test('Faust Stutter repeats, gates, reverses, and ping-pongs captured stereo slices', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const rate = 8;
    const sliceLength = Math.floor(sampleRate / rate);
    const length = sliceLength * 5;
    const left = Float32Array.from({ length }, (_, index) => (
      Math.sin(index * 0.071) * 0.17 + Math.sin(index * 0.013) * 0.05
    ));
    const right = Float32Array.from({ length }, (_, index) => (
      Math.cos(index * 0.043) * 0.13 + Math.sin(index * 0.019) * 0.04
    ));
    const node = createNode('stutter', 'stutter-modes');
    Object.assign(node.params, { mode: 0, rate, repeats: 3, gate: 100, mix: 0, output: 0 });
    const factory = await loadFactory('stutter');
    const dry = await renderFaustModuleOffline(node, [left, right], sampleRate, factory);
    assert.deepEqual(dry[0], left);
    assert.deepEqual(dry[1], right);

    node.params.mix = 100;
    const renders: Float32Array[][] = [];
    for (const mode of [0, 1, 2, 3]) {
      node.params.mode = mode;
      const rendered = await renderFaustModuleOffline(node, [left, right], sampleRate, factory);
      assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
      assert.ok(rms(rendered[0]) > 0.001);
      renders.push(rendered);
    }

    const margin = Math.ceil(sampleRate * 0.003);
    for (let sample = margin; sample < sliceLength - margin; sample += 1) {
      assert.equal(renders[0][0][sample], renders[0][0][sliceLength + sample]);
      assert.equal(renders[0][1][sample], renders[0][1][sliceLength + sample]);
      assert.equal(renders[2][0][sliceLength + sample], renders[0][0][sliceLength + sliceLength - 1 - sample]);
      assert.equal(renders[2][1][sliceLength + sample], renders[0][1][sliceLength + sliceLength - 1 - sample]);
      assert.equal(renders[3][0][sliceLength + sample], renders[0][1][sliceLength + sample]);
      assert.equal(renders[3][1][sliceLength + sample], renders[0][0][sliceLength + sample]);
    }
    assert.notDeepEqual(renders[1][0], renders[0][0]);
  }
});

test('Faust 3-Band EQ is exactly neutral and independently shapes low, mid, and high bands', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = Math.floor(sampleRate * 0.6);
    const neutralInput = sine(731, sampleRate, length, 0.2);
    const node = createNode('equalizer', 'equalizer-test');
    const neutral = await renderFaustModuleOffline(node, [neutralInput, neutralInput], sampleRate, await loadFactory('equalizer'));
    assert.deepEqual(neutral[0], neutralInput);
    assert.deepEqual(neutral[1], neutralInput);

    const start = Math.floor(length * 0.5);
    const low = sine(90, sampleRate, length, 0.1);
    const high = sine(Math.min(9000, sampleRate * 0.2), sampleRate, length, 0.1);
    Object.assign(node.params, { lowGain: 12, lowFrequency: 180 });
    const lowBoost = await renderFaustModuleOffline(node, [low, low], sampleRate, await loadFactory('equalizer'));
    const lowOnHigh = await renderFaustModuleOffline(node, [high, high], sampleRate, await loadFactory('equalizer'));
    assert.ok(rms(lowBoost[0], start) > rms(low, start) * 2.2);
    assert.ok(rms(lowOnHigh[0], start) < rms(high, start) * 1.15);

    Object.assign(node.params, { lowGain: 0, highGain: 12, highFrequency: 6000 });
    const highBoost = await renderFaustModuleOffline(node, [high, high], sampleRate, await loadFactory('equalizer'));
    const highOnLow = await renderFaustModuleOffline(node, [low, low], sampleRate, await loadFactory('equalizer'));
    assert.ok(rms(highBoost[0], start) > rms(high, start) * 2.2);
    assert.ok(rms(highOnLow[0], start) < rms(low, start) * 1.15);

    const middle = sine(1000, sampleRate, length, 0.1);
    Object.assign(node.params, { highGain: 0, midGain: 12, midFrequency: 1000, midQ: 4 });
    const midBoost = await renderFaustModuleOffline(node, [middle, middle], sampleRate, await loadFactory('equalizer'));
    assert.ok(rms(midBoost[0], start) > rms(middle, start) * 2.2);

    Object.assign(node.params, { lowGain: -18, lowFrequency: 500, midGain: 18, midFrequency: 8000, midQ: 10, highGain: -18, highFrequency: 16000, output: 12 });
    const extreme = await renderFaustModuleOffline(node, [neutralInput, neutralInput], sampleRate, await loadFactory('equalizer'));
    assert.ok(extreme.every((channel) => channel.every(Number.isFinite)));
  }
});

test('Faust Limiter preserves quiet audio with deterministic lookahead and enforces a linked stereo ceiling', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = Math.floor(sampleRate * 0.5);
    const quiet = sine(440, sampleRate, length, 0.1);
    const node = createNode('limiter', 'limiter-test');
    Object.assign(node.params, { mode: 0, input: 0, ceiling: -1, lookahead: 5, release: 100, softness: 20 });
    const quietLimited = await renderFaustModuleOffline(node, [quiet, quiet], sampleRate, await loadFactory('limiter'));
    const latency = sampleRate * 0.005;
    const expectedQuiet = fractionalDelayReference(quiet, latency);
    assert.ok(meanAbsoluteDifference(quietLimited[0], expectedQuiet, Math.ceil(latency)) < 1e-7);

    const hotLeft = sine(997, sampleRate, length, 0.95);
    const hotRight = sine(997, sampleRate, length, 0.25);
    Object.assign(node.params, { mode: 2, input: 12, ceiling: -6, lookahead: 10, release: 50, softness: 0 });
    const limited = await renderFaustModuleOffline(node, [hotLeft, hotRight], sampleRate, await loadFactory('limiter'));
    const ceiling = 10 ** (-6 / 20);
    assert.ok(limited.every((channel) => channel.every(Number.isFinite)));
    assert.ok(Math.max(peakAbsolute(limited[0]), peakAbsolute(limited[1])) <= ceiling + 1e-6);
    const linkedStart = Math.floor(sampleRate * 0.15);
    let ratioError = 0;
    let ratioSamples = 0;
    for (let frame = linkedStart; frame < length; frame += 1) {
      const sourceFrame = frame - Math.round(sampleRate * 0.010);
      if (sourceFrame < 0 || Math.abs(hotRight[sourceFrame]) < 0.05) continue;
      const leftGain = limited[0][frame] / hotLeft[sourceFrame];
      const rightGain = limited[1][frame] / hotRight[sourceFrame];
      ratioError += Math.abs(leftGain - rightGain);
      ratioSamples += 1;
    }
    assert.ok(ratioError / Math.max(1, ratioSamples) < 0.03);
  }
});

test('Faust Limiter modes are distinct and Lookahead controls deterministic render latency', async () => {
  const sampleRate = 48000;
  const length = sampleRate;
  const transient = Float32Array.from({ length }, (_, index) => (index % 2400 < 240 ? 1.1 * Math.sin(2 * Math.PI * 330 * index / sampleRate) : 0));
  const node = createNode('limiter', 'limiter-modes');
  Object.assign(node.params, { input: 6, ceiling: -6, lookahead: 5, release: 120, softness: 55 });
  const modes = [];
  for (const mode of [0, 1, 2, 3]) {
    node.params.mode = mode;
    const rendered = await renderFaustModuleOffline(node, [transient, transient], sampleRate, await loadFactory('limiter'));
    assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
    assert.ok(peakAbsolute(rendered[0]) <= 10 ** (-6 / 20) + 1e-6);
    modes.push(rendered[0]);
  }
  for (let left = 0; left < modes.length; left += 1) {
    for (let right = left + 1; right < modes.length; right += 1) assert.ok(meanAbsoluteDifference(modes[left], modes[right]) > 1e-5);
  }

  const impulse = new Float32Array(length);
  impulse[0] = 0.1;
  Object.assign(node.params, { mode: 0, input: 0, ceiling: 0, softness: 20, lookahead: 0 });
  const zeroLookahead = await renderFaustModuleOffline(node, [impulse, impulse], sampleRate, await loadFactory('limiter'));
  node.params.lookahead = 10;
  const maximumLookahead = await renderFaustModuleOffline(node, [impulse, impulse], sampleRate, await loadFactory('limiter'));
  assert.equal(firstFrameAbove(zeroLookahead[0], 0.05), 0);
  assert.ok(Math.abs(firstFrameAbove(maximumLookahead[0], 0.05) - sampleRate * 0.010) <= 1);
});

test('Faust Flanger has an exact dry endpoint and four finite distinct stereo modes', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = Math.floor(sampleRate * 0.8);
    const left = sine(330, sampleRate, length, 0.2);
    const right = sine(517, sampleRate, length, 0.17);
    const node = createNode('flanger', 'flanger-test');
    Object.assign(node.params, { rate: 0.7, depth: 80, delay: 2.5, feedback: 95, stereo: 120, mix: 0, output: 0 });
    const dry = await renderFaustModuleOffline(node, [left, right], sampleRate, await loadFactory('flanger'));
    assert.deepEqual(dry[0], left);
    assert.deepEqual(dry[1], right);

    node.params.mix = 100;
    const modes = [];
    for (const mode of [0, 1, 2, 3]) {
      node.params.mode = mode;
      const rendered = await renderFaustModuleOffline(node, [left, right], sampleRate, await loadFactory('flanger'));
      assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
      modes.push(rendered);
    }
    const start = Math.floor(sampleRate * 0.2);
    for (let first = 0; first < modes.length; first += 1) {
      for (let second = first + 1; second < modes.length; second += 1) assert.ok(meanAbsoluteDifference(modes[first][0], modes[second][0], start) > 1e-5);
    }
    assert.ok(meanAbsoluteDifference(modes[1][0], modes[1][1], start) > 1e-4);
  }
});

test('Faust Flanger remains distinct from Chorus, Phaser, and Delay fixtures', async () => {
  const sampleRate = 48000;
  const length = sampleRate;
  const input = sine(440, sampleRate, length, 0.2);
  const flanger = createNode('flanger', 'flanger-distinct');
  Object.assign(flanger.params, { mode: 2, rate: 0.45, depth: 85, delay: 2, feedback: 70, stereo: 90, mix: 70, output: 0 });
  const flanged = await renderFaustModuleOffline(flanger, [input, input], sampleRate, await loadFactory('flanger'));
  for (const type of ['chorus', 'phaser', 'delay'] as const) {
    const comparison = await renderFaustModuleOffline(createNode(type, `${type}-fixture`), [input, input], sampleRate, await loadFactory(type));
    assert.ok(meanAbsoluteDifference(flanged[0], comparison[0], Math.floor(sampleRate * 0.2)) > 1e-4);
  }
});

test('Faust Tremolo has exact dry and zero-depth endpoints with four finite distinct modes', async () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const length = Math.floor(sampleRate * 0.8);
    const input = sine(431, sampleRate, length, 0.2);
    const node = createNode('tremolo', 'tremolo-modes');
    Object.assign(node.params, { rate: 4, depth: 85, shape: 60, stereo: 90, mix: 0, output: 0 });
    const dry = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('tremolo'));
    assert.deepEqual(dry[0], input);
    assert.deepEqual(dry[1], input);

    node.params.mix = 100;
    for (const mode of [0, 1, 2, 3]) {
      node.params.mode = mode;
      node.params.depth = 0;
      const unity = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('tremolo'));
      assert.deepEqual(unity[0], input);
      assert.deepEqual(unity[1], input);
    }

    node.params.depth = 85;
    const modes = [];
    for (const mode of [0, 1, 2, 3]) {
      node.params.mode = mode;
      const rendered = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('tremolo'));
      assert.ok(rendered.every((channel) => channel.every(Number.isFinite)));
      modes.push(rendered);
    }
    const start = Math.floor(sampleRate * 0.2);
    for (let first = 0; first < modes.length; first += 1) {
      for (let second = first + 1; second < modes.length; second += 1) {
        const stereoDifference = Math.max(
          meanAbsoluteDifference(modes[first][0], modes[second][0], start),
          meanAbsoluteDifference(modes[first][1], modes[second][1], start),
        );
        assert.ok(stereoDifference > 1e-4);
      }
    }
    assert.ok(meanAbsoluteDifference(modes[0][0], modes[0][1], start) < 1e-8);
    assert.ok(meanAbsoluteDifference(modes[3][0], modes[3][1], start) < 1e-8);
    assert.ok(meanAbsoluteDifference(modes[1][0], modes[1][1], start) > 1e-4);
    assert.ok(meanAbsoluteDifference(modes[2][0], modes[2][1], start) > 1e-4);
  }
});

test('Faust Tremolo controls materially change movement, pulse width, stereo phase, mix, and output', async () => {
  const sampleRate = 48000;
  const length = sampleRate;
  const input = sine(389, sampleRate, length, 0.2);
  const node = createNode('tremolo', 'tremolo-controls');
  Object.assign(node.params, { mode: 2, rate: 2, depth: 60, shape: 20, stereo: 90, mix: 100, output: 0 });
  const baseline = await renderFaustModuleOffline(node, [input, input], sampleRate, await loadFactory('tremolo'));
  const start = Math.floor(sampleRate * 0.2);

  const alternatives: Array<[keyof typeof node.params, number]> = [
    ['rate', 8], ['depth', 90], ['shape', 90], ['stereo', 180], ['mix', 40], ['output', -12],
  ];
  for (const [parameter, value] of alternatives) {
    const changed = createNode('tremolo', `tremolo-${parameter}`);
    Object.assign(changed.params, node.params, { [parameter]: value });
    const rendered = await renderFaustModuleOffline(changed, [input, input], sampleRate, await loadFactory('tremolo'));
    assert.ok(Math.max(
      meanAbsoluteDifference(baseline[0], rendered[0], start),
      meanAbsoluteDifference(baseline[1], rendered[1], start),
    ) > 1e-4);
  }

  const broadPulse = createNode('tremolo', 'tremolo-broad-pulse');
  Object.assign(broadPulse.params, { mode: 3, rate: 4, depth: 100, shape: 0, stereo: 90, mix: 100, output: 0 });
  const narrowPulse = createNode('tremolo', 'tremolo-narrow-pulse');
  Object.assign(narrowPulse.params, broadPulse.params, { shape: 100 });
  const broad = await renderFaustModuleOffline(broadPulse, [input, input], sampleRate, await loadFactory('tremolo'));
  const narrow = await renderFaustModuleOffline(narrowPulse, [input, input], sampleRate, await loadFactory('tremolo'));
  assert.ok(rms(broad[0], start) > rms(narrow[0], start) * 1.4);
});
