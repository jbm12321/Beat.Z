import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyApprovedAgentProposal,
  authorizeAgentProposal,
  createAgentProposal,
  type AgentProposal,
} from '../src/features/audio-builder/agent/proposals.ts';
import { createPluginPlan, makeBuilderContextId } from '../src/features/audio-builder/agent/pluginToolPlans.ts';
import {
  registerWebMcpTools,
  type WebMcpDownloadState,
  type WebMcpTool,
} from '../src/features/audio-builder/agent/registerWebMcpTools.ts';
import { createInitialProject, type ProjectV2 } from '../src/features/audio-builder/domain/project.ts';
import { validateProjectForBuild } from '../src/features/audio-builder/domain/validation.ts';

function installToolRegistry() {
  const tools = new Map<string, WebMcpTool>();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { modelContext: { registerTool: async (tool: WebMcpTool) => { tools.set(tool.name, tool); } } },
  });
  return tools;
}

function downloadState(project: ProjectV2): WebMcpDownloadState {
  return { status: 'not-prepared', revision: project.revision, message: 'The current revision must be prepared.' };
}

test('WebMCP degrades cleanly when the experimental browser API is absent', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'document');
  const project = createInitialProject();
  const registration = await registerWebMcpTools({
    getProject: () => project,
    getValidation: () => validateProjectForBuild(project),
    getDownloadState: () => downloadState(project),
    getProposal: () => null,
    stageProposal: () => { throw new Error('unused'); },
    downloadPlugin: () => downloadState(project),
  });
  assert.equal(registration.supported, false);
  if (original) Object.defineProperty(globalThis, 'document', original);
});

test('five task-level tools create, edit, clear, inspect, and download through shared state', async () => {
  const tools = installToolRegistry();
  let project = createInitialProject();
  let proposal: AgentProposal | null = null;
  let downloadCalls = 0;
  const registration = await registerWebMcpTools({
    getProject: () => project,
    getValidation: () => validateProjectForBuild(project),
    getDownloadState: () => downloadState(project),
    getProposal: () => proposal,
    stageProposal: (input) => {
      proposal = createAgentProposal(project, input);
      return proposal;
    },
    downloadPlugin: () => {
      downloadCalls += 1;
      return { status: 'approval-required', revision: project.revision, message: 'Approve the visible build request.' };
    },
  });

  assert.equal(registration.supported, true);
  assert.deepEqual(registration.toolNames, [
    'inspect-builder',
    'create-plugin',
    'edit-plugin',
    'clear-plugin',
    'download-plugin',
  ]);
  assert.equal(tools.size, 5);
  for (const tool of tools.values()) {
    assert.ok(tool.name.length <= 30, `${tool.name} exceeds the recommended tool-name budget`);
    assert.ok(tool.description.length <= 500, `${tool.name} exceeds the recommended description budget`);
  }
  assert.equal(tools.get('inspect-builder')?.annotations?.readOnlyHint, true);
  for (const name of ['create-plugin', 'edit-plugin', 'clear-plugin', 'download-plugin']) {
    assert.equal(tools.get(name)?.annotations?.readOnlyHint, false);
  }

  const inspection = await tools.get('inspect-builder')!.execute({});
  const inspected = inspection.structuredContent as {
    contextId: string;
    plugin: { revision: number; chain: unknown[] };
    primitives: Array<{ type: string; params: unknown[] }>;
    controlRules: { defaultMappingsPerControl: number };
  };
  assert.equal(inspected.contextId, makeBuilderContextId(project));
  assert.equal(inspected.plugin.revision, 0);
  assert.equal(inspected.plugin.chain.length, 0);
  assert.equal(inspected.primitives.length, 14);
  assert.ok(inspected.primitives[0].params.length > 0);
  assert.equal(inspected.controlRules.defaultMappingsPerControl, 1);

  const missingContext = await tools.get('create-plugin')!.execute({
    prompt: 'Create a warm tape echo with adjustable time, feedback and mix.',
    plugin: { name: 'Warm Echo', chain: [], controls: [] },
  });
  assert.equal(missingContext.isError, true);
  assert.match(missingContext.content[0].text, /inspect-builder again/u);

  const created = await tools.get('create-plugin')!.execute({
    contextId: inspected.contextId,
    prompt: 'Create a warm tape echo with adjustable time, feedback and mix.',
    plugin: {
      name: 'Warm Echo',
      chain: [{ ref: 'echo', primitive: 'delay', settings: { mode: 'Tape', time: 340, feedback: 45, mix: 30 } }],
      controls: [
        { name: 'Echo Time', reason: 'Main echo timing', mappings: [{ primitiveRef: 'echo', parameter: 'time', min: 80, max: 650 }] },
        { name: 'Feedback', reason: 'Echo repeats', mappings: [{ primitiveRef: 'echo', parameter: 'feedback', min: 10, max: 75 }] },
        { name: 'Mix', mappings: [{ primitiveRef: 'echo', parameter: 'mix', min: 0, max: 65 }] },
      ],
    },
  });
  assert.equal(created.isError, undefined);
  assert.equal(project.revision, 0);
  assert.deepEqual(project.chain, []);
  assert.equal((proposal as unknown as AgentProposal).commands[0].type, 'clear_project');
  assert.deepEqual((created.structuredContent as { controls: string[] }).controls, ['Echo Time', 'Feedback', 'Mix']);
  assert.equal((created.structuredContent as { requiresHumanApproval: boolean }).requiresHumanApproval, true);

  proposal = authorizeAgentProposal(proposal!);
  project = applyApprovedAgentProposal(project, proposal).project;
  assert.equal(project.revision, 1);
  assert.equal(project.name, 'Warm Echo');
  assert.equal(project.chain.length, 1);
  assert.deepEqual(project.macros.map((control) => control.name), ['Echo Time', 'Feedback', 'Mix']);
  assert.ok(project.macros.every((control) => control.mappings.length === 1));
  assert.equal(project.nodes[project.chain[0]].params.mode, 2);

  const staleEdit = await tools.get('edit-plugin')!.execute({
    contextId: inspected.contextId,
    prompt: 'Make the echo darker.',
    changes: [{ action: 'set-parameter', primitiveId: project.chain[0], parameter: 'tone', value: 3500 }],
  });
  assert.equal(staleEdit.isError, true);
  assert.match(staleEdit.content[0].text, /stale/u);

  const refreshed = (await tools.get('inspect-builder')!.execute({})).structuredContent as { contextId: string };
  const edited = await tools.get('edit-plugin')!.execute({
    contextId: refreshed.contextId,
    prompt: 'Make the echo darker and add a separate warmth control.',
    changes: [
      { action: 'set-parameter', primitiveId: project.chain[0], parameter: 'tone', value: 3500 },
      { action: 'rename-plugin', name: 'Warm Echo Dark' },
      {
        action: 'set-control', name: 'Warmth', reason: 'Tone and mix together',
        mappings: [{ primitiveRef: project.chain[0], parameter: 'tone', min: 1200, max: 12000, inverted: true }],
      },
    ],
  });
  assert.equal(edited.isError, undefined);
  assert.equal(project.revision, 1);
  proposal = authorizeAgentProposal(proposal!);
  project = applyApprovedAgentProposal(project, proposal).project;
  assert.equal(project.revision, 2);
  assert.deepEqual(project.macros.map((control) => control.name), ['Echo Time', 'Feedback', 'Mix', 'Warmth']);

  const currentContext = makeBuilderContextId(project);
  const download = await tools.get('download-plugin')!.execute({ contextId: currentContext });
  assert.equal(downloadCalls, 1);
  assert.equal((download.structuredContent as WebMcpDownloadState).status, 'approval-required');

  const cleared = await tools.get('clear-plugin')!.execute({ contextId: currentContext });
  assert.equal(cleared.isError, undefined);
  assert.equal(project.chain.length, 1);
  proposal = authorizeAgentProposal(proposal!);
  project = applyApprovedAgentProposal(project, proposal).project;
  assert.equal(project.revision, 3);
  assert.deepEqual(project.chain, []);
  assert.deepEqual(project.macros, []);

  const alreadyEmpty = await tools.get('clear-plugin')!.execute({ contextId: makeBuilderContextId(project) });
  assert.equal((alreadyEmpty.structuredContent as { alreadyEmpty: boolean }).alreadyEmpty, true);
  registration.unregister();
  Reflect.deleteProperty(globalThis, 'document');
});

test('plugin plans accept optional Control reasons and up to four mappings', () => {
  const project = createInitialProject();
  const basePlugin = {
    name: 'Focused Delay',
    chain: [{ ref: 'echo', primitive: 'delay' }],
  };

  const combined = createPluginPlan(project, {
    prompt: 'Create a delay with a warmth control.',
    plugin: {
      ...basePlugin,
      controls: [{
        name: 'Warmth', reason: 'Moves drive, mix, tone, and feedback together',
        mappings: [
          { primitiveRef: 'echo', parameter: 'time', min: 50, max: 500 },
          { primitiveRef: 'echo', parameter: 'feedback', min: 10, max: 70 },
          { primitiveRef: 'echo', parameter: 'mix', min: 0, max: 100 },
          { primitiveRef: 'echo', parameter: 'tone', min: 1000, max: 12000 },
        ],
      }],
    },
  });
  assert.deepEqual(combined.controlNames, ['Warmth']);
  assert.equal(combined.proposal.commands.filter((command) => command.type === 'add_mapping').length, 4);
});
