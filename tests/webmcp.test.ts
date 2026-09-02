import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeStereo } from '../src/features/audio-builder/audio/analysis.ts';
import type { OfflineComparison } from '../src/features/audio-builder/audio/compare.ts';
import {
  applyApprovedAgentProposal,
  authorizeAgentProposal,
  createAgentProposal,
  type AgentProposal,
} from '../src/features/audio-builder/agent/proposals.ts';
import { registerWebMcpTools, type WebMcpTool } from '../src/features/audio-builder/agent/registerWebMcpTools.ts';
import { createInitialProject } from '../src/features/audio-builder/domain/project.ts';
import { validateProjectForBuild } from '../src/features/audio-builder/domain/validation.ts';

test('WebMCP degrades cleanly when the experimental browser API is absent', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'document');
  const project = createInitialProject();
  const registration = await registerWebMcpTools({
    getProject: () => project,
    getValidation: () => validateProjectForBuild(project),
    stageProposal: () => { throw new Error('unused'); },
    applyProposal: () => { throw new Error('unused'); },
    analyze: async () => { throw new Error('unused'); },
    requestBuild: () => { throw new Error('unused'); },
  });
  assert.equal(registration.supported, false);
  if (original) Object.defineProperty(globalThis, 'document', original);
});

test('registered tools share revision-safe project state and cannot bypass human proposal approval', async () => {
  const tools = new Map<string, WebMcpTool>();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { modelContext: { registerTool: async (tool: WebMcpTool) => { tools.set(tool.name, tool); } } },
  });
  let project = createInitialProject();
  let proposal: AgentProposal | null = null;
  const signal = Float32Array.from([0.1, -0.1, 0.2, -0.2]);
  const analysis = analyzeStereo([signal, signal], 48000);
  const comparison: OfflineComparison = {
    revision: project.revision,
    sampleRate: 48000,
    dry: analysis,
    processed: analysis,
    loudnessMatched: analysis,
    loudnessMatch: { gain: 1, gainDb: 0, limited: false },
    plainLanguageSummary: ['Dry and processed levels match.'],
  };

  const registration = await registerWebMcpTools({
    getProject: () => project,
    getValidation: () => validateProjectForBuild(project, analysis),
    stageProposal: (input) => {
      proposal = createAgentProposal(project, input);
      return proposal;
    },
    applyProposal: (proposalId, expectedRevision) => {
      if (!proposal || proposal.id !== proposalId) throw new Error('Unknown proposal.');
      if (expectedRevision !== project.revision) throw new Error(`Stale revision ${expectedRevision}; current revision is ${project.revision}.`);
      const result = applyApprovedAgentProposal(project, proposal);
      project = result.project;
      proposal = result.proposal;
      return project;
    },
    analyze: async () => ({ ...comparison, revision: project.revision }),
    requestBuild: () => ({
      status: 'unavailable', code: 'native_build_unavailable', projectId: project.id, revision: project.revision, contentHash: 'f'.repeat(64),
      message: 'No native service is configured.',
    }),
  });

  assert.equal(registration.supported, true);
  assert.deepEqual(registration.toolNames, [
    'inspect-audio-project',
    'list-audio-primitives',
    'propose-audio-project-patch',
    'apply-approved-audio-project-patch',
    'render-and-analyze-audio-project',
    'inspect-audio-project-validation',
    'request-audio-plugin-build',
  ]);

  const primitives = await tools.get('list-audio-primitives')!.execute({});
  const primitiveCatalog = (primitives.structuredContent as { primitives: Record<string, { parameters: Array<{ id: string; choices?: Array<{ label: string }> }> }> }).primitives;
  assert.deepEqual(Object.keys(primitiveCatalog), ['gain', 'filter', 'saturation', 'delay', 'reverb', 'chorus', 'compressor']);
  assert.deepEqual(primitiveCatalog.delay.parameters[0].choices?.map((choice) => choice.label), ['Digital', 'Ping-Pong', 'Tape']);
  assert.deepEqual(primitiveCatalog.reverb.parameters[0].choices?.map((choice) => choice.label), ['Room', 'Hall', 'Plate']);
  assert.deepEqual(primitiveCatalog.chorus.parameters[0].choices?.map((choice) => choice.label), ['Classic', 'Wide', 'Ensemble']);
  assert.deepEqual(primitiveCatalog.compressor.parameters.map((parameter) => parameter.id), ['threshold', 'ratio', 'attack', 'release', 'makeup', 'mix']);

  const propose = await tools.get('propose-audio-project-patch')!.execute({
    expectedRevision: 0,
    summary: 'Remove rumble',
    musicalPurpose: 'Make space below the bass.',
    commands: [{ type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' }],
  });
  assert.equal(propose.isError, undefined);
  assert.equal(project.revision, 0);
  assert.deepEqual(project.chain, []);

  const rejected = await tools.get('apply-approved-audio-project-patch')!.execute({ proposalId: proposal!.id, expectedRevision: 0 });
  assert.equal(rejected.isError, true);
  assert.equal(project.revision, 0);

  proposal = authorizeAgentProposal(proposal!);
  const applied = await tools.get('apply-approved-audio-project-patch')!.execute({ proposalId: proposal.id, expectedRevision: 0 });
  assert.equal(applied.isError, undefined);
  assert.equal(project.revision, 1);
  assert.deepEqual(project.chain, ['filter-1']);

  const stale = await tools.get('propose-audio-project-patch')!.execute({
    expectedRevision: 0,
    summary: 'Stale change',
    musicalPurpose: 'Should not overwrite newer work.',
    commands: [{ type: 'add_module', moduleType: 'gain' }],
  });
  assert.equal(stale.isError, true);
  assert.equal((stale.structuredContent as { currentRevision: number }).currentRevision, 1);

  const pair1 = await tools.get('propose-audio-project-patch')!.execute({
    expectedRevision: 1,
    summary: 'Add echo and space',
    musicalPurpose: 'Stage Tape delay and Hall reverb without applying them.',
    commands: [
      { type: 'add_module', moduleType: 'delay', nodeId: 'delay-1' },
      { type: 'set_parameter', nodeId: 'delay-1', paramId: 'mode', value: 2 },
      { type: 'set_parameter', nodeId: 'delay-1', paramId: 'time', value: 340 },
      { type: 'add_module', moduleType: 'reverb', nodeId: 'reverb-1' },
      { type: 'set_parameter', nodeId: 'reverb-1', paramId: 'mode', value: 1 },
      { type: 'set_parameter', nodeId: 'reverb-1', paramId: 'decay', value: 3.8 },
    ],
  });
  assert.equal(pair1.isError, undefined);
  assert.equal((pair1.structuredContent as { requiresHumanApproval: boolean }).requiresHumanApproval, true);
  assert.deepEqual(project.chain, ['filter-1']);

  for (const commands of [
    [{ type: 'add_module', moduleType: 'delay', nodeId: 'bad-delay' }, { type: 'set_parameter', nodeId: 'bad-delay', paramId: 'mode', value: 4 }],
    [{ type: 'add_module', moduleType: 'reverb', nodeId: 'bad-reverb' }, { type: 'set_parameter', nodeId: 'bad-reverb', paramId: 'decay', value: 20 }],
    [{ type: 'add_module', moduleType: 'chorus', nodeId: 'bad-chorus' }, { type: 'set_parameter', nodeId: 'bad-chorus', paramId: 'mode', value: 3 }],
    [{ type: 'add_module', moduleType: 'compressor', nodeId: 'bad-compressor' }, { type: 'set_parameter', nodeId: 'bad-compressor', paramId: 'ratio', value: 40 }],
  ]) {
    const invalid = await tools.get('propose-audio-project-patch')!.execute({
      expectedRevision: 1, summary: 'Invalid Pair 1 request', musicalPurpose: 'Must be rejected atomically.', commands,
    });
    assert.equal(invalid.isError, true);
    assert.deepEqual(project.chain, ['filter-1']);
  }
  registration.unregister();
  Reflect.deleteProperty(globalThis, 'document');
});
