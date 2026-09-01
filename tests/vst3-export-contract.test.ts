import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeStereo, type AudioAnalysis } from '../src/features/audio-builder/audio/analysis.ts';
import { freezeProjectRevision } from '../src/features/audio-builder/domain/build.ts';
import { applyProjectCommands, createInitialProject, type ProjectV2 } from '../src/features/audio-builder/domain/project.ts';
import { validateProjectForBuild } from '../src/features/audio-builder/domain/validation.ts';
import { createNativeBuildRequest, lowerEffectiveDsp } from '../src/features/vst3-export/contract.ts';

function healthyAnalysis(): AudioAnalysis {
  const signal = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(index * 0.1) * 0.2);
  return analyzeStereo([signal, signal], 48000);
}

async function freeze(project: ProjectV2) {
  return freezeProjectRevision(project, validateProjectForBuild(project, healthyAnalysis()));
}

test('approval and effective DSP hashes have separate responsibilities', async () => {
  const project = applyProjectCommands(createInitialProject(), [
    { type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' },
    { type: 'add_module', moduleType: 'saturation', nodeId: 'sat-unused' },
    { type: 'disconnect_module', nodeId: 'sat-unused' },
  ], 'human');
  const activityOnly = structuredClone(project);
  activityOnly.revision += 1;
  activityOnly.activity.push({ id: 'activity-only', actor: 'human', summary: 'Viewed the project', timestamp: new Date().toISOString() });

  const first = await createNativeBuildRequest(await freeze(project));
  const second = await createNativeBuildRequest(await freeze(activityOnly));
  assert.notEqual(first.approvalHash, second.approvalHash);
  assert.equal(first.dspHash, second.dspHash);

  const audibleEdit = applyProjectCommands(project, [
    { type: 'set_parameter', nodeId: 'gain-1', paramId: 'level', value: 6 },
  ], 'human');
  const third = await createNativeBuildRequest(await freeze(audibleEdit));
  assert.notEqual(first.dspHash, third.dspHash);
});

test('effective DSP keeps only audible topology and does not invent macros', () => {
  const project = applyProjectCommands(createInitialProject(), [
    { type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' },
    { type: 'add_module', moduleType: 'gain', nodeId: 'gain-bypassed' },
    { type: 'set_bypass', nodeId: 'gain-bypassed', bypassed: true },
  ], 'human');
  const dsp = lowerEffectiveDsp(project);
  assert.deepEqual(dsp.chain.map((node) => node.id), ['filter-1']);
  assert.deepEqual(dsp.macros, []);
});

test('effective DSP preserves macro defaults, ranges, inversion, and logarithmic mapping', () => {
  const project = applyProjectCommands(createInitialProject(), [
    { type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' },
    { type: 'create_macro', macroId: 'macro-1', name: 'Sweep' },
    { type: 'set_macro_value', macroId: 'macro-1', value: 0.25 },
    { type: 'add_mapping', macroId: 'macro-1', mappingId: 'mapping-1', nodeId: 'filter-1', paramId: 'cutoff', min: 80, max: 12000, inverted: true },
  ], 'human');
  const dsp = lowerEffectiveDsp(project);
  assert.equal(dsp.macros[0].value, 0.25);
  assert.deepEqual(dsp.macros[0].mappings[0], {
    nodeId: 'filter-1', paramId: 'cutoff', min: 80, max: 12000, inverted: true,
    scale: 'log', faustPath: '/Audio_Effect_Builder_Filter/Filter_Cutoff',
  });
});
