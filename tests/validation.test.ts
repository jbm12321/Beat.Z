import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeStereo,
  type AudioAnalysis,
} from '../src/features/audio-builder/audio/analysis.ts';
import {
  validateProjectForBuild,
} from '../src/features/audio-builder/domain/validation.ts';
import {
  freezeProjectRevision,
  requestPluginBuild,
} from '../src/features/audio-builder/domain/build.ts';
import {
  applyProjectCommands,
  createInitialProject,
} from '../src/features/audio-builder/domain/project.ts';

function healthyAnalysis(): AudioAnalysis {
  const signal = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(index * 0.1) * 0.2);
  return analyzeStereo([signal, signal], 48000);
}

test('build validation distinguishes blocking audio failures from artistic warnings', () => {
  const empty = createInitialProject();
  const unchecked = validateProjectForBuild(empty);
  assert.equal(unchecked.status, 'needs-analysis');
  assert.ok(unchecked.issues.some((issue) => issue.severity === 'warning' && /empty/i.test(issue.message)));

  const valid = validateProjectForBuild(empty, healthyAnalysis());
  assert.equal(valid.status, 'valid');
  const clipped = { ...healthyAnalysis(), clipped: true, peak: 1.1, peakDb: 0.8 };
  const unsafe = validateProjectForBuild(empty, clipped);
  assert.equal(unsafe.status, 'invalid');
  assert.ok(unsafe.issues.some((issue) => issue.severity === 'error' && /clip|full scale/i.test(issue.message)));
});

test('a validated revision freezes into an immutable content-addressed snapshot', async () => {
  const project = applyProjectCommands(createInitialProject(), [{ type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' }], 'human');
  const validation = validateProjectForBuild(project, healthyAnalysis());
  const frozen = await freezeProjectRevision(project, validation);
  assert.equal(frozen.projectId, project.id);
  assert.equal(frozen.revision, project.revision);
  assert.match(frozen.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(frozen.project), true);

  const edited = applyProjectCommands(project, [{ type: 'set_parameter', nodeId: 'gain-1', paramId: 'level', value: 6 }], 'human');
  assert.equal(frozen.project.nodes['gain-1'].params.level, 0);
  assert.equal(edited.nodes['gain-1'].params.level, 6);
  assert.equal(frozen.revision, project.revision);
});

test('freezing rejects different content even when the revision number matches', async () => {
  const project = applyProjectCommands(createInitialProject(), [{ type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' }], 'human');
  const validation = validateProjectForBuild(project, healthyAnalysis());
  const different = structuredClone(project);
  different.nodes['gain-1'].params.level = 6;
  await assert.rejects(() => freezeProjectRevision(different, validation), /project changed after analysis/i);
});

test('native build requests stay truthfully gated and name the exact frozen revision', async () => {
  const project = createInitialProject();
  const frozen = await freezeProjectRevision(project, validateProjectForBuild(project, healthyAnalysis()));
  const withoutApproval = requestPluginBuild(frozen, false);
  assert.equal(withoutApproval.code, 'approval_required');
  const unavailable = requestPluginBuild(frozen, true);
  assert.equal(unavailable.code, 'native_build_unavailable');
  assert.equal(unavailable.revision, frozen.revision);
  assert.equal(unavailable.contentHash, frozen.contentHash);
  assert.equal('artifact' in unavailable, false);
});
