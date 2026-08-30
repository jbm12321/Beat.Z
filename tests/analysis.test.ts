import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeStereo,
  loudnessMatchGain,
} from '../src/features/audio-builder/audio/analysis.ts';

test('offline analysis identifies silence, clipping, invalid samples, and stereo activity', () => {
  const silent = analyzeStereo([new Float32Array(1024), new Float32Array(1024)], 48000);
  assert.equal(silent.silent, true);
  assert.equal(silent.clipped, false);
  assert.equal(silent.valid, true);

  const left = Float32Array.from([0, 0.5, 1, Number.NaN]);
  const right = Float32Array.from([0, -0.5, -1.2, 0.25]);
  const unsafe = analyzeStereo([left, right], 48000);
  assert.equal(unsafe.valid, false);
  assert.equal(unsafe.clipped, true);
  assert.equal(unsafe.silent, false);
  assert.ok(unsafe.stereoActivity > 0);
  assert.ok(unsafe.summary.some((line) => /invalid/i.test(line)));
});

test('loudness matching reduces a level difference without mutating either render', () => {
  const dry = [Float32Array.from([0.1, -0.1, 0.1, -0.1]), Float32Array.from([0.1, -0.1, 0.1, -0.1])] as const;
  const wet = [Float32Array.from([0.4, -0.4, 0.4, -0.4]), Float32Array.from([0.4, -0.4, 0.4, -0.4])] as const;
  const drySnapshot = dry.map((channel) => [...channel]);
  const wetSnapshot = wet.map((channel) => [...channel]);
  const match = loudnessMatchGain(dry, wet);
  assert.ok(Math.abs(match.gain - 0.25) < 0.0001);
  assert.ok(Math.abs(match.gainDb + 12.0412) < 0.01);
  assert.deepEqual(dry.map((channel) => [...channel]), drySnapshot);
  assert.deepEqual(wet.map((channel) => [...channel]), wetSnapshot);
});
