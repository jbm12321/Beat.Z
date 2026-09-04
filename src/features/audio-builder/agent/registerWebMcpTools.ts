import { MODULE_CATALOG, MODULE_TYPES, type ProjectV2 } from '../domain/project.ts';
import type { ProjectValidationResult } from '../domain/validation.ts';
import type { AgentProposal, AgentProposalInput } from './proposals.ts';
import {
  assertBuilderContext,
  createPluginPlan,
  editPluginPlan,
  makeBuilderContextId,
} from './pluginToolPlans.ts';

type JsonSchema = Record<string, unknown>;
export type ToolResult = { content: Array<{ type: 'text'; text: string }>; structuredContent?: unknown; isError?: boolean };
export type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: JsonSchema;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
};
type ModelContext = { registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void> | void };

const MAX_CONTROLS = 8;
const MAX_MAPPINGS_PER_CONTROL = 4;
const MAX_CHAIN_LENGTH = 12;

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export type WebMcpDownloadState = {
  status: 'not-prepared' | 'approval-required' | 'starting' | 'queued' | 'building' | 'ready' | 'failed';
  message: string;
  revision: number;
  jobId?: string;
  filename?: string;
  downloadUrl?: string;
  downloadStarted?: boolean;
  error?: string;
};

export interface WebMcpAdapter {
  getProject: () => ProjectV2;
  getValidation: () => ProjectValidationResult;
  getDownloadState: () => WebMcpDownloadState;
  getProposal: () => AgentProposal | null;
  stageProposal: (input: AgentProposalInput) => AgentProposal;
  downloadPlugin: () => Promise<WebMcpDownloadState> | WebMcpDownloadState;
}

const objectSchema = (properties: Record<string, unknown>, required: string[] = []): JsonSchema => ({
  type: 'object', properties, required, additionalProperties: false,
});

const textResult = (text: string, structuredContent?: unknown): ToolResult => ({ content: [{ type: 'text', text }], structuredContent });

function failure(error: unknown, project: ProjectV2): ToolResult {
  const message = error instanceof Error ? error.message : 'The requested Beat.Z action could not be completed.';
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { error: message, currentRevision: project.revision, contextId: makeBuilderContextId(project) },
    isError: true,
  };
}

const settingValueSchema = { oneOf: [{ type: 'number' }, { type: 'string', minLength: 1, maxLength: 64 }] };
const settingsSchema = { type: 'object', description: 'Primitive parameter values from inspect-builder.', additionalProperties: settingValueSchema };
const mappingSchema = objectSchema({
  primitiveRef: { type: 'string', minLength: 1, maxLength: 120, description: 'A chain ref or inspected primitive ID.' },
  parameter: { type: 'string', minLength: 1, maxLength: 64, description: 'A mappable parameter ID from inspect-builder.' },
  min: { type: 'number', description: 'Value at the low end of the Control.' },
  max: { type: 'number', description: 'Value at the high end of the Control.' },
  inverted: { type: 'boolean', description: 'Reverse the Control direction when true.' },
}, ['primitiveRef', 'parameter', 'min', 'max']);

const controlProperties = {
  controlId: { type: 'string', minLength: 1, maxLength: 120, description: 'Existing Control ID when replacing a Control.' },
  name: { type: 'string', minLength: 1, maxLength: 24, description: 'Visible Control label derived from the prompt.' },
  reason: { type: 'string', minLength: 1, maxLength: 160, description: 'Optional short reason for this Control.' },
  value: { type: 'number', minimum: 0, maximum: 1, description: 'Optional initial Control position.' },
  mappings: { type: 'array', minItems: 1, maxItems: MAX_MAPPINGS_PER_CONTROL, items: mappingSchema },
};

const createControlSchema = objectSchema(controlProperties, ['name', 'mappings']);
const editControlSchema = objectSchema({ action: { const: 'set-control' }, ...controlProperties }, ['action', 'name', 'mappings']);
const createPrimitiveSchema = objectSchema({
  ref: { type: 'string', minLength: 1, maxLength: 64, description: 'Short reference used by Control mappings.' },
  primitive: { type: 'string', enum: MODULE_TYPES },
  settings: settingsSchema,
}, ['ref', 'primitive']);

const editChangeSchema = {
  oneOf: [
    objectSchema({ action: { const: 'rename-plugin' }, name: { type: 'string', minLength: 1, maxLength: 64 } }, ['action', 'name']),
    objectSchema({
      action: { const: 'add-primitive' },
      ref: { type: 'string', minLength: 1, maxLength: 64 },
      primitive: { type: 'string', enum: MODULE_TYPES },
      index: { type: 'integer', minimum: 0 },
      settings: settingsSchema,
    }, ['action', 'ref', 'primitive']),
    objectSchema({ action: { const: 'remove-primitive' }, primitiveId: { type: 'string', minLength: 1, maxLength: 120 } }, ['action', 'primitiveId']),
    objectSchema({ action: { const: 'move-primitive' }, primitiveId: { type: 'string', minLength: 1, maxLength: 120 }, index: { type: 'integer', minimum: 0 } }, ['action', 'primitiveId', 'index']),
    objectSchema({
      action: { const: 'set-parameter' },
      primitiveId: { type: 'string', minLength: 1, maxLength: 120 },
      parameter: { type: 'string', minLength: 1, maxLength: 64 },
      value: settingValueSchema,
    }, ['action', 'primitiveId', 'parameter', 'value']),
    objectSchema({ action: { const: 'set-bypass' }, primitiveId: { type: 'string', minLength: 1, maxLength: 120 }, bypassed: { type: 'boolean' } }, ['action', 'primitiveId', 'bypassed']),
    editControlSchema,
    objectSchema({ action: { const: 'remove-control' }, controlId: { type: 'string', minLength: 1, maxLength: 120 } }, ['action', 'controlId']),
  ],
};

const contextProperty = {
  type: 'string', minLength: 1, maxLength: 240,
  description: 'Current contextId returned by inspect-builder.',
};

function proposalResult(proposal: AgentProposal, controlNames: string[], verb: string) {
  return textResult(
    `${verb} proposal staged for approval at revision ${proposal.baseRevision}. The plugin has not changed yet.`,
    {
      proposalId: proposal.id,
      baseRevision: proposal.baseRevision,
      summary: proposal.summary,
      controls: controlNames,
      actionCount: proposal.commands.length,
      requiresHumanApproval: true,
    },
  );
}

function inspectPrimitives() {
  return MODULE_TYPES.map((type) => {
    const definition = MODULE_CATALOG[type];
    return {
      type: definition.type,
      name: definition.name,
      shortName: definition.shortName,
      description: definition.description,
      params: definition.parameters.map((parameter) => ({
        id: parameter.id,
        name: parameter.name,
        min: parameter.min,
        max: parameter.max,
        default: parameter.default,
        step: parameter.step,
        unit: parameter.unit,
        scale: parameter.scale,
        mappable: parameter.mappable,
        ...(parameter.choices ? { choices: parameter.choices.map((choice) => choice.label) } : {}),
      })),
    };
  });
}

function inspectPlugin(project: ProjectV2) {
  return {
    name: project.name,
    revision: project.revision,
    chain: project.chain.map((id) => {
      const node = project.nodes[id];
      return { id: node.id, type: node.type, bypassed: node.bypassed, settings: node.params };
    }),
    controls: project.macros.map((control) => ({ id: control.id, name: control.name, value: control.value, mappings: control.mappings })),
  };
}

function inspectValidation(adapter: WebMcpAdapter) {
  const validation = adapter.getValidation();
  return { status: validation.status, issues: validation.issues };
}

export async function registerWebMcpTools(adapter: WebMcpAdapter) {
  if (typeof document === 'undefined') return { supported: false, unregister: () => undefined, toolNames: [] as string[] };
  const modelContext = document.modelContext;
  if (!modelContext?.registerTool) return { supported: false, unregister: () => undefined, toolNames: [] as string[] };
  const controller = new AbortController();

  const safely = (execute: WebMcpTool['execute']): WebMcpTool['execute'] => async (input) => {
    try {
      return await execute(input);
    } catch (error) {
      return failure(error, adapter.getProject());
    }
  };

  const writeAnnotations = { readOnlyHint: false, untrustedContentHint: false };
  const tools: WebMcpTool[] = [
    {
      name: 'inspect-builder',
      title: 'Inspect builder',
      description: 'Read the current Beat.Z builder and primitive parameters before creating, editing, or clearing. Does not change anything.',
      inputSchema: objectSchema({}),
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const project = adapter.getProject();
        const contextId = makeBuilderContextId(project);
        const proposal = adapter.getProposal();
        return textResult(`Inspected Beat.Z revision ${project.revision}.\nUse contextId for the next action.`, {
          contextId,
          plugin: inspectPlugin(project),
          primitives: inspectPrimitives(),
          controlRules: {
            maximum: MAX_CONTROLS,
            defaultMappingsPerControl: 1,
            reason: 'Optional short explanation; no prompt phrase matching is required.',
            parameterOwnership: 'A DSP parameter can belong to only one Control.',
            discreteModesMappable: false,
          },
          validation: inspectValidation(adapter),
          download: adapter.getDownloadState(),
          proposal: proposal ? { id: proposal.id, status: proposal.status, baseRevision: proposal.baseRevision } : null,
          limits: { controls: MAX_CONTROLS, mappingsPerControl: MAX_MAPPINGS_PER_CONTROL, chain: MAX_CHAIN_LENGTH },
        });
      },
    },
    {
      name: 'create-plugin',
      title: 'Create plugin',
      description: 'Create a complete Beat.Z plugin from the user prompt. Requires a current inspect-builder context. Creates separate prompt-related Controls and stages one atomic design for visible approval.',
      inputSchema: objectSchema({
        contextId: contextProperty,
        prompt: { type: 'string', minLength: 1, maxLength: 2_000, description: 'The user request being implemented.' },
        plugin: objectSchema({
          name: { type: 'string', minLength: 1, maxLength: 64 },
          chain: { type: 'array', minItems: 1, maxItems: MAX_CHAIN_LENGTH, items: createPrimitiveSchema },
          controls: { type: 'array', minItems: 1, maxItems: MAX_CONTROLS, items: createControlSchema },
        }, ['name', 'chain', 'controls']),
      }, ['contextId', 'prompt', 'plugin']),
      annotations: writeAnnotations,
      execute: safely((input) => {
        const project = adapter.getProject();
        assertBuilderContext(project, input.contextId);
        const plan = createPluginPlan(project, input);
        return proposalResult(adapter.stageProposal(plan.proposal), plan.controlNames, 'Creation');
      }),
    },
    {
      name: 'edit-plugin',
      title: 'Edit plugin',
      description: 'Edit the inspected Beat.Z plugin without replacing unrelated work. Requires current context, preserves existing state, and stages one atomic proposal for visible approval.',
      inputSchema: objectSchema({
        contextId: contextProperty,
        prompt: { type: 'string', minLength: 1, maxLength: 2_000, description: 'The requested edit in the user’s words.' },
        changes: { type: 'array', minItems: 1, maxItems: MAX_CHAIN_LENGTH, items: editChangeSchema },
      }, ['contextId', 'prompt', 'changes']),
      annotations: writeAnnotations,
      execute: safely((input) => {
        const project = adapter.getProject();
        assertBuilderContext(project, input.contextId);
        const plan = editPluginPlan(project, input);
        return proposalResult(adapter.stageProposal(plan.proposal), plan.controlNames, 'Edit');
      }),
    },
    {
      name: 'clear-plugin',
      title: 'Clear plugin',
      description: 'Stage removal of every primitive and Control from the current Beat.Z plugin. Nothing is erased until the user approves the proposal in the visible page.',
      inputSchema: objectSchema({ contextId: contextProperty }, ['contextId']),
      annotations: writeAnnotations,
      execute: safely((input) => {
        const project = adapter.getProject();
        assertBuilderContext(project, input.contextId);
        const primitiveCount = Object.keys(project.nodes).length;
        const controlCount = project.macros.length;
        if (primitiveCount === 0 && controlCount === 0) {
          return textResult('The Beat.Z builder is already empty.', { alreadyEmpty: true, revision: project.revision });
        }
        const proposal = adapter.stageProposal({
          summary: 'Clear the current plugin',
          musicalPurpose: 'Start again from an empty Beat.Z builder.',
          commands: [{ type: 'clear_project' }],
        });
        return textResult(
          `Clear proposal staged for approval. ${primitiveCount} primitives and ${controlCount} Controls would be removed.`,
          { proposalId: proposal.id, baseRevision: proposal.baseRevision, primitiveCount, controlCount, requiresHumanApproval: true },
        );
      }),
    },
  ];

  await Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal })));
  return { supported: true, unregister: () => controller.abort(), toolNames: tools.map((tool) => tool.name) };
}
