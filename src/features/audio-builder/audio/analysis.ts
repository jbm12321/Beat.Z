import type { StereoSamples } from '../faust/runtime.ts';

export const SILENCE_DBFS = -80;
export const CLIP_AMPLITUDE = 1;

export interface AudioAnalysis {
  sampleRate: number;
  frames: number;
  durationSeconds: number;
  peak: number;
  peakDb: number;
  rms: number;
  averageDb: number;
  stereoActivity: number;
  clipped: boolean;
  silent: boolean;
  valid: boolean;
  invalidSamples: number;
  summary: string[];
}

const amplitudeToDb = (value: number) => value > 0 ? 20 * Math.log10(value) : Number.NEGATIVE_INFINITY;

export function analyzeStereo(input: ReadonlyArray<Float32Array>, sampleRate: number): AudioAnalysis {
  const left = input[0] ?? new Float32Array();
  const right = input[1] ?? left;
  const frames = Math.max(left.length, right.length);
  let peak = 0;
  let energy = 0;
  let differenceEnergy = 0;
  let finiteSamples = 0;
  let invalidSamples = 0;

  for (let index = 0; index < frames; index += 1) {
    const leftSample = left[index] ?? 0;
    const rightSample = right[index] ?? 0;
    if (!Number.isFinite(leftSample)) invalidSamples += 1;
    if (!Number.isFinite(rightSample)) invalidSamples += 1;
    if (!Number.isFinite(leftSample) || !Number.isFinite(rightSample)) continue;
    peak = Math.max(peak, Math.abs(leftSample), Math.abs(rightSample));
    energy += leftSample ** 2 + rightSample ** 2;
    differenceEnergy += (leftSample - rightSample) ** 2;
    finiteSamples += 2;
  }

  const rms = finiteSamples ? Math.sqrt(energy / finiteSamples) : 0;
  const differenceRms = frames ? Math.sqrt(differenceEnergy / frames) : 0;
  const averageDb = amplitudeToDb(rms);
  const clipped = peak >= CLIP_AMPLITUDE;
  const silent = averageDb < SILENCE_DBFS;
  const valid = invalidSamples === 0;
  const summary: string[] = [];
  if (!valid) summary.push(`The render contains ${invalidSamples} invalid audio sample${invalidSamples === 1 ? '' : 's'}.`);
  if (silent) summary.push('The render is effectively silent.');
  else summary.push(`Average level is ${averageDb.toFixed(1)} dBFS.`);
  if (clipped) summary.push('The output reaches or exceeds full scale and may clip.');
  else summary.push(`Peak level is ${amplitudeToDb(peak).toFixed(1)} dBFS.`);
  summary.push(differenceRms > 0.0001 ? 'Stereo movement is present.' : 'The render is effectively mono.');

  return {
    sampleRate,
    frames,
    durationSeconds: sampleRate > 0 ? frames / sampleRate : 0,
    peak,
    peakDb: amplitudeToDb(peak),
    rms,
    averageDb,
    stereoActivity: differenceRms,
    clipped,
    silent,
    valid,
    invalidSamples,
    summary,
  };
}

function stereoRms(input: ReadonlyArray<Float32Array>) {
  let energy = 0;
  let count = 0;
  input.forEach((channel) => channel.forEach((sample) => {
    if (!Number.isFinite(sample)) return;
    energy += sample ** 2;
    count += 1;
  }));
  return count ? Math.sqrt(energy / count) : 0;
}

export function loudnessMatchGain(
  dry: ReadonlyArray<Float32Array>,
  wet: ReadonlyArray<Float32Array>,
  maximumAdjustmentDb = 18,
) {
  const dryRms = stereoRms(dry);
  const wetRms = stereoRms(wet);
  if (dryRms <= 0 || wetRms <= 0) return { gain: 1, gainDb: 0, limited: false };
  const rawDb = 20 * Math.log10(dryRms / wetRms);
  const gainDb = Math.max(-maximumAdjustmentDb, Math.min(maximumAdjustmentDb, rawDb));
  return { gain: 10 ** (gainDb / 20), gainDb, limited: gainDb !== rawDb };
}

export function applyStereoGain(input: ReadonlyArray<Float32Array>, gain: number): StereoSamples {
  return [
    Float32Array.from(input[0] ?? [], (sample) => sample * gain),
    Float32Array.from(input[1] ?? input[0] ?? [], (sample) => sample * gain),
  ];
}
