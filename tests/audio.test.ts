import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BrowserAudioEngine,
  createDemoSamples,
  makeSaturationCurve,
  normalizedMixGains,
  projectTopologyKey,
} from '../src/features/audio-builder/audio/BrowserAudioEngine.ts';
import { applyProjectCommands, createInitialProject } from '../src/features/audio-builder/domain/project.ts';

test('the audition loop is finite, non-silent, stereo, and deterministic', () => {
  const first = createDemoSamples(12000, 1);
  const second = createDemoSamples(12000, 1);
  assert.equal(first.left.length, 12000);
  assert.deepEqual(first.left, second.left);
  let energy = 0;
  let stereoDifference = 0;
  for (let index = 0; index < first.left.length; index += 1) {
    assert.ok(Number.isFinite(first.left[index]));
    assert.ok(Number.isFinite(first.right[index]));
    energy += first.left[index] ** 2 + first.right[index] ** 2;
    stereoDifference += Math.abs(first.left[index] - first.right[index]);
  }
  assert.ok(Math.sqrt(energy / (first.left.length * 2)) > 0.05);
  assert.ok(stereoDifference / first.left.length > 0.005);
});

test('the saturation curve is finite, symmetric, bounded, and nonlinear', () => {
  const curve = makeSaturationCurve(18, 1025);
  assert.equal(curve.length, 1025);
  assert.ok(Math.abs(curve[0] + 1) < 0.001);
  assert.ok(Math.abs(curve[curve.length - 1] - 1) < 0.001);
  assert.ok(Math.abs(curve[512]) < 0.001);
  assert.ok(curve[768] > 0.5);
  for (const sample of curve) assert.ok(Number.isFinite(sample) && sample >= -1.001 && sample <= 1.001);
});

test('wet and dry mix gains cannot sum above unity', () => {
  for (let index = 0; index <= 100; index += 1) {
    const gains = normalizedMixGains(index / 100);
    assert.ok(gains.dry >= 0 && gains.wet >= 0);
    assert.ok(gains.dry + gains.wet <= 1.000001);
  }
  assert.deepEqual(normalizedMixGains(0), { dry: 1, wet: 0 });
  const fullyWet = normalizedMixGains(1);
  assert.ok(fullyWet.dry < 0.000001);
  assert.ok(Math.abs(fullyWet.wet - 1) < 0.000001);
});

test('parameter edits update the live graph without rebuilding its topology', () => {
  const initial = createInitialProject();
  const withGain = applyProjectCommands(initial, [{ type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' }], 'human');
  const adjusted = applyProjectCommands(withGain, [{ type: 'set_parameter', nodeId: 'gain-1', paramId: 'level', value: 8 }], 'human');
  const bypassed = applyProjectCommands(adjusted, [{ type: 'set_bypass', nodeId: 'gain-1', bypassed: true }], 'human');
  assert.equal(projectTopologyKey(withGain), projectTopologyKey(adjusted));
  assert.notEqual(projectTopologyKey(adjusted), projectTopologyKey(bypassed));

  const engine = new BrowserAudioEngine();
  const internals = engine as unknown as {
    context: object | null;
    rebuildGraph: () => void;
    updateGraphParameters: () => void;
  };
  let rebuilds = 0;
  let liveUpdates = 0;
  internals.context = {};
  internals.rebuildGraph = () => { rebuilds += 1; };
  internals.updateGraphParameters = () => { liveUpdates += 1; };

  engine.setProject(withGain);
  engine.setProject(adjusted);
  engine.setProject(bypassed);
  assert.equal(rebuilds, 2);
  assert.equal(liveUpdates, 1);
});

test('a rejected AudioWorklet reports the failure without using a compatibility backend', async () => {
  const engine = new BrowserAudioEngine();
  const internals = engine as unknown as {
    rebuildGraph: () => void;
    buildGraphPath: (generation: number) => Promise<void>;
  };
  let attempts = 0;
  let status = '';
  internals.buildGraphPath = async () => {
    attempts += 1;
    throw new Error('Faust worklet initialization failed.');
  };
  engine.setStatusListener((next) => { status = next.message; });

  internals.rebuildGraph();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(attempts, 1);
  assert.equal(engine.lastError, 'Faust worklet initialization failed.');
  assert.match(status, /Low-latency effects are unavailable: Faust worklet initialization failed\./i);
});
