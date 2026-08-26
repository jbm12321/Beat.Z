import { MODULE_CATALOG } from '../domain/catalog';
import type { ModuleType, ProjectCommand, ProjectV1 } from '../domain/types';

type JsonSchema = Record<string, unknown>;
type ToolResult = { content: Array<{ type: 'text'; text: string }>; structuredContent?: unknown; isError?: boolean };
type WebMcpTool = {
  name: string;
  description: string;
  inputSchema?: JsonSchema;
  execute: (input: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
};
type ModelContext = {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void>;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export interface WebMcpAdapter {
  getProject: () => ProjectV1;
  applyCommands: (commands: ProjectCommand[]) => ProjectV1;
}

const objectSchema = (properties: Record<string, unknown>, required: string[] = []): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const textResult = (text: string, structuredContent?: unknown): ToolResult => ({
  content: [{ type: 'text', text }],
  structuredContent,
});

const mutationResult = (project: ProjectV1) => {
  const activity = project.activity[0];
  return textResult(activity?.summary ?? 'Project updated.', {
    revision: project.revision,
    summary: activity?.summary ?? 'Project updated.',
    projectName: project.name,
  });
};

function asString(value: unknown, field: string) {
  if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
  return value;
}

function asNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
  return value;
}

function optionalNumber(value: unknown, field: string) {
  return value === undefined ? undefined : asNumber(value, field);
}

function toolFailure(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'The requested project change could not be applied.';
  return { content: [{ type: 'text', text: message }], structuredContent: { error: message }, isError: true };
}

export async function registerWebMcpTools(adapter: WebMcpAdapter) {
  const modelContext = document.modelContext;
  if (!modelContext?.registerTool) return { supported: false, unregister: () => undefined };
  const controller = new AbortController();
  const moduleTypes = Object.keys(MODULE_CATALOG);

  const safely = (execute: WebMcpTool['execute']): WebMcpTool['execute'] => async (input) => {
    try {
      return await execute(input);
    } catch (error) {
      return toolFailure(error);
    }
  };

  const tools: WebMcpTool[] = [
    {
      name: 'inspect-audio-project',
      description: 'Returns the current visual audio-effect project, including connected and disconnected modules, parameter values, macros, and revision.',
      inputSchema: objectSchema({}),
      execute: () => textResult('Current audio-effect project.', adapter.getProject()),
    },
    {
      name: 'list-audio-modules',
      description: 'Lists every DSP module and its valid parameter IDs, ranges, units, defaults, and scaling.',
      inputSchema: objectSchema({}),
      execute: () => textResult('Available DSP module catalog.', MODULE_CATALOG),
    },
    {
      name: 'add-audio-module',
      description: 'Adds one DSP module to the signal chain at an optional zero-based position.',
      inputSchema: objectSchema({
        moduleType: { type: 'string', enum: moduleTypes },
        index: { type: 'integer', minimum: 0 },
      }, ['moduleType']),
      execute: safely((input) => mutationResult(adapter.applyCommands([{
        type: 'add_module',
        moduleType: asString(input.moduleType, 'moduleType') as ModuleType,
        index: optionalNumber(input.index, 'index'),
      }]))),
    },
    {
      name: 'update-audio-module',
      description: 'Updates one module’s DSP parameters and/or bypass state using catalog parameter IDs.',
      inputSchema: objectSchema({
        nodeId: { type: 'string' },
        parameters: { type: 'object', additionalProperties: { type: 'number' } },
        bypassed: { type: 'boolean' },
      }, ['nodeId']),
      execute: safely((input) => {
        const nodeId = asString(input.nodeId, 'nodeId');
        const commands: ProjectCommand[] = [];
        if (input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters)) {
          Object.entries(input.parameters as Record<string, unknown>).forEach(([paramId, value]) => commands.push({ type: 'set_parameter', nodeId, paramId, value: asNumber(value, paramId) }));
        }
        if (typeof input.bypassed === 'boolean') commands.push({ type: 'set_bypass', nodeId, bypassed: input.bypassed });
        if (!commands.length) throw new Error('Provide at least one parameter or bypass state.');
        return mutationResult(adapter.applyCommands(commands));
      }),
    },
    {
      name: 'arrange-audio-module',
      description: 'Moves, disconnects, reconnects, or permanently deletes one DSP module.',
      inputSchema: objectSchema({
        nodeId: { type: 'string' },
        action: { type: 'string', enum: ['move', 'disconnect', 'connect', 'delete'] },
        index: { type: 'integer', minimum: 0 },
      }, ['nodeId', 'action']),
      execute: safely((input) => {
        const nodeId = asString(input.nodeId, 'nodeId');
        const action = asString(input.action, 'action');
        const index = optionalNumber(input.index, 'index');
        let command: ProjectCommand;
        if (action === 'move') {
          if (index === undefined) throw new Error('Moving a module requires an index.');
          command = { type: 'move_module', nodeId, index };
        } else if (action === 'disconnect') command = { type: 'disconnect_module', nodeId };
        else if (action === 'connect') command = { type: 'connect_module', nodeId, index };
        else if (action === 'delete') command = { type: 'delete_module', nodeId };
        else throw new Error(`Unknown arrangement action: ${action}`);
        return mutationResult(adapter.applyCommands([command]));
      }),
    },
    {
      name: 'create-plugin-control',
      description: 'Creates one user-facing normalized macro control. A plugin can expose at most eight controls.',
      inputSchema: objectSchema({ name: { type: 'string', minLength: 1, maxLength: 24 } }),
      execute: safely((input) => mutationResult(adapter.applyCommands([{ type: 'create_macro', name: input.name === undefined ? undefined : asString(input.name, 'name') }]))),
    },
    {
      name: 'update-plugin-control',
      description: 'Renames a macro control and/or sets its normalized value from 0 to 1.',
      inputSchema: objectSchema({
        macroId: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 24 },
        value: { type: 'number', minimum: 0, maximum: 1 },
      }, ['macroId']),
      execute: safely((input) => {
        const macroId = asString(input.macroId, 'macroId');
        const commands: ProjectCommand[] = [];
        if (input.name !== undefined) commands.push({ type: 'rename_macro', macroId, name: asString(input.name, 'name') });
        if (input.value !== undefined) commands.push({ type: 'set_macro_value', macroId, value: asNumber(input.value, 'value') });
        if (!commands.length) throw new Error('Provide a macro name or value.');
        return mutationResult(adapter.applyCommands(commands));
      }),
    },
    {
      name: 'map-plugin-control',
      description: 'Maps a macro to one DSP parameter with native-unit minimum and maximum values and optional inversion.',
      inputSchema: objectSchema({
        macroId: { type: 'string' }, nodeId: { type: 'string' }, paramId: { type: 'string' },
        min: { type: 'number' }, max: { type: 'number' }, inverted: { type: 'boolean' },
      }, ['macroId', 'nodeId', 'paramId', 'min', 'max']),
      execute: safely((input) => mutationResult(adapter.applyCommands([{
        type: 'add_mapping',
        macroId: asString(input.macroId, 'macroId'),
        nodeId: asString(input.nodeId, 'nodeId'),
        paramId: asString(input.paramId, 'paramId'),
        min: asNumber(input.min, 'min'),
        max: asNumber(input.max, 'max'),
        inverted: Boolean(input.inverted),
      }]))),
    },
    {
      name: 'delete-plugin-control',
      description: 'Deletes one macro control and freezes every mapped DSP parameter at its current effective value.',
      inputSchema: objectSchema({ macroId: { type: 'string' } }, ['macroId']),
      execute: safely((input) => mutationResult(adapter.applyCommands([{ type: 'delete_macro', macroId: asString(input.macroId, 'macroId') }]))),
    },
    {
      name: 'apply-audio-project-batch',
      description: 'Atomically applies an ordered batch of Audio Effect Builder project commands. The entire batch is rejected when any command is invalid.',
      inputSchema: objectSchema({
        commands: {
          type: 'array', minItems: 1, maxItems: 50,
          items: { type: 'object', required: ['type'], properties: { type: { type: 'string' } }, additionalProperties: true },
        },
      }, ['commands']),
      execute: safely((input) => {
        if (!Array.isArray(input.commands)) throw new Error('commands must be an array.');
        return mutationResult(adapter.applyCommands(input.commands as ProjectCommand[]));
      }),
    },
  ];

  await Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal })));
  return { supported: true, unregister: () => controller.abort() };
}
