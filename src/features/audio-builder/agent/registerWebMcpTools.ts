import { MODULE_CATALOG, type ProjectCommand, type ProjectV2 } from '../domain/project.ts';
import type { ProjectValidationResult } from '../domain/validation.ts';
import type { NativeBuildGate } from '../domain/build.ts';
import type { OfflineComparison } from '../audio/compare.ts';
import type { AgentProposal, AgentProposalInput } from './proposals.ts';

type JsonSchema = Record<string, unknown>;
export type ToolResult = { content: Array<{ type: 'text'; text: string }>; structuredContent?: unknown; isError?: boolean };
export type WebMcpTool = {
  name: string;
  description: string;
  inputSchema?: JsonSchema;
  execute: (input: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
};
type ModelContext = { registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void> };

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export interface WebMcpAdapter {
  getProject: () => ProjectV2;
  getValidation: () => ProjectValidationResult;
  stageProposal: (input: AgentProposalInput) => AgentProposal;
  applyProposal: (proposalId: string, expectedRevision: number) => ProjectV2;
  analyze: () => Promise<OfflineComparison>;
  requestBuild: () => Promise<NativeBuildGate> | NativeBuildGate;
}

const objectSchema = (properties: Record<string, unknown>, required: string[] = []): JsonSchema => ({
  type: 'object', properties, required, additionalProperties: false,
});

const textResult = (text: string, structuredContent?: unknown): ToolResult => ({ content: [{ type: 'text', text }], structuredContent });

function asString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value;
}

function asRevision(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error('expectedRevision must be a non-negative integer.');
  return Number(value);
}

function failure(error: unknown, currentRevision: number): ToolResult {
  const message = error instanceof Error ? error.message : 'The requested audio-project action could not be completed.';
  return { content: [{ type: 'text', text: message }], structuredContent: { error: message, currentRevision }, isError: true };
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
      return failure(error, adapter.getProject().revision);
    }
  };

  const commandSchema = {
    type: 'array', minItems: 1, maxItems: 50,
    items: { type: 'object', required: ['type'], properties: { type: { type: 'string' } }, additionalProperties: true },
  };

  const tools: WebMcpTool[] = [
    {
      name: 'inspect-audio-project',
      description: 'Inspect the current Faust audio-effect project, revision, macros, recent activity, and latest validation state without changing anything.',
      inputSchema: objectSchema({}),
      execute: () => textResult('Current Faust audio-effect project.', { project: adapter.getProject(), validation: adapter.getValidation() }),
    },
    {
      name: 'list-audio-primitives',
      description: 'List the supported Faust primitives, parameter ranges, scaling, choices, canonical source fingerprints, and macro limits.',
      inputSchema: objectSchema({}),
      execute: () => textResult('Supported Faust v0.1 primitives.', { primitives: MODULE_CATALOG, limits: { macros: 8, parameterOwnership: 'one-macro-per-parameter' } }),
    },
    {
      name: 'propose-audio-project-patch',
      description: 'Stage an atomic project patch with a musical explanation. This does not mutate the project; a human must explicitly approve it in the page.',
      inputSchema: objectSchema({
        expectedRevision: { type: 'integer', minimum: 0 },
        summary: { type: 'string', minLength: 1, maxLength: 120 },
        musicalPurpose: { type: 'string', minLength: 1, maxLength: 360 },
        commands: commandSchema,
      }, ['expectedRevision', 'summary', 'musicalPurpose', 'commands']),
      execute: safely((input) => {
        const expectedRevision = asRevision(input.expectedRevision);
        const project = adapter.getProject();
        if (expectedRevision !== project.revision) throw new Error(`Stale revision ${expectedRevision}; current revision is ${project.revision}.`);
        if (!Array.isArray(input.commands)) throw new Error('commands must be an array.');
        const proposal = adapter.stageProposal({
          summary: asString(input.summary, 'summary'),
          musicalPurpose: asString(input.musicalPurpose, 'musicalPurpose'),
          commands: input.commands as ProjectCommand[],
        });
        return textResult('Proposal staged for human review. The project was not changed.', { proposal, revision: project.revision, requiresHumanApproval: true });
      }),
    },
    {
      name: 'apply-approved-audio-project-patch',
      description: 'Apply a previously staged patch only after the page records explicit human approval. The expected revision prevents stale writes.',
      inputSchema: objectSchema({ proposalId: { type: 'string' }, expectedRevision: { type: 'integer', minimum: 0 } }, ['proposalId', 'expectedRevision']),
      execute: safely((input) => {
        const project = adapter.applyProposal(asString(input.proposalId, 'proposalId'), asRevision(input.expectedRevision));
        return textResult(project.activity[0]?.summary ?? 'Approved agent patch applied.', { revision: project.revision, activity: project.activity[0] });
      }),
    },
    {
      name: 'render-and-analyze-audio-project',
      description: 'Render the current project offline with its selected in-memory audition source and report dry, processed, loudness-matched, clipping, silence, and stereo results.',
      inputSchema: objectSchema({}),
      execute: safely(async () => {
        const comparison = await adapter.analyze();
        return textResult(comparison.plainLanguageSummary.join(' '), comparison);
      }),
    },
    {
      name: 'inspect-audio-project-validation',
      description: 'Inspect the current project validation result and exact Faust definition, compiler, library, and source versions.',
      inputSchema: objectSchema({}),
      execute: () => {
        const validation = adapter.getValidation();
        return textResult(`Validation is ${validation.status} for revision ${validation.revision}.`, validation);
      },
    },
    {
      name: 'request-audio-plugin-build',
      description: 'Request native VST3 preparation for the exact approved frozen revision. The browser never fabricates an artifact when no native service is configured.',
      inputSchema: objectSchema({}),
      execute: safely(async () => {
        const result = await adapter.requestBuild();
        return textResult(result.message, result);
      }),
    },
  ];

  await Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal })));
  return { supported: true, unregister: () => controller.abort(), toolNames: tools.map((tool) => tool.name) };
}
