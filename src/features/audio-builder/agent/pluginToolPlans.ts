import {
  MODULE_CATALOG,
  MODULE_TYPES,
  makeId,
  type ModuleType,
  type ParameterDefinition,
  type ProjectCommand,
  type ProjectV2,
} from '../domain/project.ts';
import type { AgentProposalInput } from './proposals.ts';

type UnknownRecord = Record<string, unknown>;

export interface PluginToolPlan {
  proposal: AgentProposalInput;
  controlNames: string[];
}

const MAX_PROMPT_LENGTH = 2_000;
const MAX_PROMPT_BASIS_LENGTH = 160;
const COMBINED_CONTROL_LANGUAGE = /\b(one[- ]knob|single control|combined|linked|together|morph|simultaneous(?:ly)?|at once)\b/iu;

function compactHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

const CATALOG_CONTEXT = compactHash(MODULE_TYPES.map((type) => {
  const definition = MODULE_CATALOG[type];
  return `${type}:${definition.sourceSha256}:${definition.parameters.map((parameter) => parameter.id).join(',')}`;
}).join('|'));

export function makeBuilderContextId(project: ProjectV2) {
  return `ctx_${compactHash(project.id)}_${project.revision}_${CATALOG_CONTEXT}`;
}

export function assertBuilderContext(project: ProjectV2, value: unknown) {
  if (typeof value !== 'string' || value !== makeBuilderContextId(project)) {
    throw new Error('Builder context is missing or stale. Call inspect-builder again before continuing.');
  }
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as UnknownRecord;
}

function asArray(value: unknown, field: string, minimum = 1, maximum = 64) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${field} must contain ${minimum}–${maximum} items.`);
  }
  return value;
}

function asString(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new Error(`${field} must contain 1–${maximum} characters.`);
  }
  return value.trim();
}

function asOptionalInteger(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${field} must be a non-negative integer.`);
  return Number(value);
}

function asOptionalBoolean(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${field} must be true or false.`);
  return value;
}

function asOptionalControlValue(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('Control value must be between 0 and 1.');
  }
  return value;
}

function asModuleType(value: unknown): ModuleType {
  if (typeof value !== 'string' || !MODULE_TYPES.includes(value as ModuleType)) {
    throw new Error(`primitive must be one of: ${MODULE_TYPES.join(', ')}.`);
  }
  return value as ModuleType;
}

function asPrompt(value: unknown) {
  return asString(value, 'prompt', MAX_PROMPT_LENGTH);
}

function proposalPurpose(prompt: string) {
  return prompt.length <= 360 ? prompt : `${prompt.slice(0, 357)}…`;
}

function requirePromptBasis(prompt: string, value: unknown) {
  const basis = asString(value, 'promptBasis', MAX_PROMPT_BASIS_LENGTH);
  const normalizedPrompt = prompt.toLocaleLowerCase().replace(/\s+/gu, ' ');
  const normalizedBasis = basis.toLocaleLowerCase().replace(/\s+/gu, ' ');
  if (!normalizedPrompt.includes(normalizedBasis)) {
    throw new Error(`Control promptBasis "${basis}" must quote an exact phrase from the user prompt.`);
  }
  return basis;
}

function getParameter(type: ModuleType, paramId: unknown) {
  const id = asString(paramId, 'parameter', 64);
  const definition = MODULE_CATALOG[type].parameters.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`${MODULE_CATALOG[type].name} does not have a ${id} parameter.`);
  return definition;
}

function normalizeParameterValue(definition: ParameterDefinition, value: unknown, field: string) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && definition.choices) {
    const choice = definition.choices.find((candidate) => candidate.label.toLocaleLowerCase() === value.trim().toLocaleLowerCase());
    if (choice) return choice.value;
  }
  throw new Error(`${field} must be a finite number${definition.choices ? ' or a supported choice label' : ''}.`);
}

function appendSettings(commands: ProjectCommand[], type: ModuleType, nodeId: string, value: unknown, field: string) {
  if (value === undefined) return;
  const settings = asRecord(value, field);
  for (const [paramId, rawValue] of Object.entries(settings)) {
    const definition = getParameter(type, paramId);
    commands.push({
      type: 'set_parameter',
      nodeId,
      paramId,
      value: normalizeParameterValue(definition, rawValue, `${field}.${paramId}`),
    });
  }
}

type NodeReference = { nodeId: string; type: ModuleType };

function appendControl(
  commands: ProjectCommand[],
  controls: string[],
  prompt: string,
  rawControl: unknown,
  nodeReferences: Map<string, NodeReference>,
  project: ProjectV2,
) {
  const control = asRecord(rawControl, 'control');
  const name = asString(control.name, 'Control name', 24);
  const promptBasis = requirePromptBasis(prompt, control.promptBasis);
  const mappings = asArray(control.mappings, `${name} mappings`, 1, 8);
  const combined = asOptionalBoolean(control.combined, `${name}.combined`) ?? false;
  if (mappings.length > 1 && (!combined || !COMBINED_CONTROL_LANGUAGE.test(`${prompt} ${promptBasis}`))) {
    throw new Error(`${name} maps several parameters. Multi-parameter Controls require combined=true and explicit combined-control language in the prompt.`);
  }

  const requestedControlId = control.controlId;
  const existingControl = requestedControlId === undefined
    ? undefined
    : project.macros.find((candidate) => candidate.id === asString(requestedControlId, 'controlId', 120));
  if (requestedControlId !== undefined && !existingControl) throw new Error(`Control ${String(requestedControlId)} does not exist.`);

  const macroId = existingControl?.id ?? makeId('macro');
  if (existingControl) {
    existingControl.mappings.forEach((mapping) => commands.push({ type: 'remove_mapping', macroId, mappingId: mapping.id }));
    if (existingControl.name !== name) commands.push({ type: 'rename_macro', macroId, name });
  } else {
    commands.push({ type: 'create_macro', macroId, name });
  }

  const controlValue = asOptionalControlValue(control.value);
  if (controlValue !== undefined) commands.push({ type: 'set_macro_value', macroId, value: controlValue });

  for (const rawMapping of mappings) {
    const mapping = asRecord(rawMapping, `${name} mapping`);
    const primitiveRef = asString(mapping.primitiveRef, 'primitiveRef', 120);
    const target = nodeReferences.get(primitiveRef);
    if (!target) throw new Error(`Primitive reference ${primitiveRef} does not exist in the inspected plugin or this proposal.`);
    const definition = getParameter(target.type, mapping.parameter);
    if (!definition.mappable) throw new Error(`${definition.name} cannot be assigned to a Control.`);
    const minimum = normalizeParameterValue(definition, mapping.min, `${name} mapping minimum`);
    const maximum = normalizeParameterValue(definition, mapping.max, `${name} mapping maximum`);
    commands.push({
      type: 'add_mapping',
      macroId,
      nodeId: target.nodeId,
      paramId: definition.id,
      min: minimum,
      max: maximum,
      inverted: asOptionalBoolean(mapping.inverted, `${name}.inverted`),
    });
  }
  controls.push(name);
}

function currentNodeReferences(project: ProjectV2) {
  return new Map(Object.values(project.nodes).map((node) => [node.id, { nodeId: node.id, type: node.type }]));
}

export function createPluginPlan(project: ProjectV2, input: UnknownRecord): PluginToolPlan {
  if (Object.keys(project.nodes).length > 0 || project.macros.length > 0) {
    throw new Error('A plugin already exists. Use edit-plugin or clear-plugin first.');
  }
  const prompt = asPrompt(input.prompt);
  const plugin = asRecord(input.plugin, 'plugin');
  const name = asString(plugin.name, 'Plugin name', 64);
  const chain = asArray(plugin.chain, 'plugin.chain', 1, 64);
  const rawControls = asArray(plugin.controls, 'plugin.controls', 1, 8);
  const commands: ProjectCommand[] = [{ type: 'rename_project', name }];
  const nodeReferences = new Map<string, NodeReference>();

  chain.forEach((rawPrimitive, index) => {
    const primitive = asRecord(rawPrimitive, `plugin.chain[${index}]`);
    const ref = asString(primitive.ref, `plugin.chain[${index}].ref`, 64);
    if (nodeReferences.has(ref)) throw new Error(`Primitive reference ${ref} is duplicated.`);
    const type = asModuleType(primitive.primitive);
    const nodeId = makeId('node');
    nodeReferences.set(ref, { nodeId, type });
    commands.push({ type: 'add_module', moduleType: type, nodeId });
    appendSettings(commands, type, nodeId, primitive.settings, `plugin.chain[${index}].settings`);
  });

  const controlNames: string[] = [];
  rawControls.forEach((control) => appendControl(commands, controlNames, prompt, control, nodeReferences, project));
  return {
    proposal: { summary: `Create ${name}`, musicalPurpose: proposalPurpose(prompt), commands },
    controlNames,
  };
}

export function editPluginPlan(project: ProjectV2, input: UnknownRecord): PluginToolPlan {
  if (Object.keys(project.nodes).length === 0 && project.macros.length === 0) {
    throw new Error('The builder is empty. Use create-plugin to make the first plugin.');
  }
  const prompt = asPrompt(input.prompt);
  const changes = asArray(input.changes, 'changes', 1, 50);
  const commands: ProjectCommand[] = [];
  const controlNames: string[] = [];
  const nodeReferences = currentNodeReferences(project);

  changes.forEach((rawChange, index) => {
    const change = asRecord(rawChange, `changes[${index}]`);
    const action = asString(change.action, `changes[${index}].action`, 40);
    if (action === 'rename-plugin') {
      commands.push({ type: 'rename_project', name: asString(change.name, 'Plugin name', 64) });
      return;
    }
    if (action === 'add-primitive') {
      const ref = asString(change.ref, 'ref', 64);
      if (nodeReferences.has(ref)) throw new Error(`Primitive reference ${ref} is duplicated.`);
      const type = asModuleType(change.primitive);
      const nodeId = makeId('node');
      nodeReferences.set(ref, { nodeId, type });
      commands.push({ type: 'add_module', moduleType: type, nodeId, index: asOptionalInteger(change.index, 'index') });
      appendSettings(commands, type, nodeId, change.settings, `changes[${index}].settings`);
      return;
    }

    if (action === 'set-control') {
      appendControl(commands, controlNames, prompt, change, nodeReferences, project);
      return;
    }
    if (action === 'remove-control') {
      commands.push({ type: 'delete_macro', macroId: asString(change.controlId, 'controlId', 120) });
      return;
    }

    const nodeId = asString(change.primitiveId, 'primitiveId', 120);
    const node = project.nodes[nodeId];
    if (!node) throw new Error(`Primitive ${nodeId} does not exist in the inspected plugin.`);
    if (action === 'remove-primitive') {
      commands.push({ type: 'delete_module', nodeId });
      nodeReferences.delete(nodeId);
      return;
    }
    if (action === 'move-primitive') {
      commands.push({ type: 'move_module', nodeId, index: asOptionalInteger(change.index, 'index') ?? 0 });
      return;
    }
    if (action === 'set-parameter') {
      const definition = getParameter(node.type, change.parameter);
      commands.push({ type: 'set_parameter', nodeId, paramId: definition.id, value: normalizeParameterValue(definition, change.value, 'value') });
      return;
    }
    if (action === 'set-bypass') {
      if (typeof change.bypassed !== 'boolean') throw new Error('bypassed must be true or false.');
      commands.push({ type: 'set_bypass', nodeId, bypassed: change.bypassed });
      return;
    }
    throw new Error(`Unsupported edit action: ${action}.`);
  });

  return {
    proposal: { summary: 'Edit the current plugin', musicalPurpose: proposalPurpose(prompt), commands },
    controlNames,
  };
}
