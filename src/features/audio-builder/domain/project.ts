export type ModuleType =
  | 'gain'
  | 'high_pass'
  | 'low_pass'
  | 'parametric_eq'
  | 'compressor'
  | 'saturation'
  | 'delay'
  | 'reverb'
  | 'chorus'
  | 'limiter';

export type ParameterScale = 'linear' | 'log';

export interface ParameterDefinition {
  id: string;
  name: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit: 'dB' | 'Hz' | 'ms' | 's' | '%' | 'ratio' | 'Q';
  scale: ParameterScale;
}

export interface ModuleDefinition {
  type: ModuleType;
  name: string;
  shortName: string;
  description: string;
  parameters: ParameterDefinition[];
}

export interface DspNode {
  id: string;
  type: ModuleType;
  params: Record<string, number>;
  bypassed: boolean;
}

export interface MacroMapping {
  id: string;
  nodeId: string;
  paramId: string;
  min: number;
  max: number;
  inverted: boolean;
}

export interface MacroControl {
  id: string;
  name: string;
  value: number;
  mappings: MacroMapping[];
}

export interface ActivityItem {
  id: string;
  actor: 'human' | 'agent';
  summary: string;
  timestamp: string;
}

export interface ProjectV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  chain: string[];
  nodes: Record<string, DspNode>;
  macros: MacroControl[];
  activity: ActivityItem[];
}

export type ProjectCommand =
  | { type: 'rename_project'; name: string }
  | { type: 'add_module'; moduleType: ModuleType; index?: number; nodeId?: string }
  | { type: 'set_parameter'; nodeId: string; paramId: string; value: number }
  | { type: 'move_module'; nodeId: string; index: number }
  | { type: 'set_bypass'; nodeId: string; bypassed: boolean }
  | { type: 'disconnect_module'; nodeId: string }
  | { type: 'connect_module'; nodeId: string; index?: number }
  | { type: 'delete_module'; nodeId: string }
  | { type: 'create_macro'; name?: string; macroId?: string }
  | { type: 'rename_macro'; macroId: string; name: string }
  | { type: 'set_macro_value'; macroId: string; value: number }
  | {
      type: 'add_mapping';
      macroId: string;
      nodeId: string;
      paramId: string;
      min: number;
      max: number;
      inverted?: boolean;
      mappingId?: string;
    }
  | {
      type: 'update_mapping';
      macroId: string;
      mappingId: string;
      nodeId?: string;
      paramId?: string;
      min?: number;
      max?: number;
      inverted?: boolean;
    }
  | { type: 'remove_mapping'; macroId: string; mappingId: string }
  | { type: 'delete_macro'; macroId: string };

const linear = (
  id: string,
  name: string,
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  unit: ParameterDefinition['unit'],
): ParameterDefinition => ({ id, name, min, max, default: defaultValue, step, unit, scale: 'linear' });

const log = (
  id: string,
  name: string,
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  unit: ParameterDefinition['unit'],
): ParameterDefinition => ({ id, name, min, max, default: defaultValue, step, unit, scale: 'log' });

export const MODULE_CATALOG: Record<ModuleType, ModuleDefinition> = {
  gain: {
    type: 'gain', name: 'Gain', shortName: 'GAIN', description: 'Clean level adjustment.',
    parameters: [linear('level', 'Level', -24, 24, 0, 0.1, 'dB')],
  },
  high_pass: {
    type: 'high_pass', name: 'High Pass', shortName: 'HPF', description: 'Remove low-frequency energy.',
    parameters: [log('cutoff', 'Cutoff', 20, 20000, 80, 1, 'Hz'), log('resonance', 'Resonance', 0.1, 20, 0.7, 0.1, 'Q')],
  },
  low_pass: {
    type: 'low_pass', name: 'Low Pass', shortName: 'LPF', description: 'Soften high-frequency energy.',
    parameters: [log('cutoff', 'Cutoff', 20, 20000, 18000, 1, 'Hz'), log('resonance', 'Resonance', 0.1, 20, 0.7, 0.1, 'Q')],
  },
  parametric_eq: {
    type: 'parametric_eq', name: 'Parametric EQ', shortName: 'EQ', description: 'Shape one focused frequency band.',
    parameters: [log('frequency', 'Frequency', 20, 20000, 1000, 1, 'Hz'), linear('gain', 'Gain', -18, 18, 0, 0.1, 'dB'), log('q', 'Q', 0.1, 18, 1, 0.1, 'Q')],
  },
  compressor: {
    type: 'compressor', name: 'Compressor', shortName: 'COMP', description: 'Control dynamics and add density.',
    parameters: [linear('threshold', 'Threshold', -60, 0, -18, 0.1, 'dB'), linear('ratio', 'Ratio', 1, 20, 4, 0.1, 'ratio'), log('attack', 'Attack', 3, 1000, 20, 1, 'ms'), log('release', 'Release', 30, 1000, 250, 1, 'ms'), linear('makeup', 'Makeup', 0, 24, 0, 0.1, 'dB')],
  },
  saturation: {
    type: 'saturation', name: 'Saturation', shortName: 'SAT', description: 'Add harmonic color and weight.',
    parameters: [linear('drive', 'Drive', 0, 24, 6, 0.1, 'dB'), log('tone', 'Tone', 200, 16000, 8000, 1, 'Hz'), linear('mix', 'Mix', 0, 100, 50, 1, '%')],
  },
  delay: {
    type: 'delay', name: 'Delay', shortName: 'DLY', description: 'Create rhythmic repeats and space.',
    parameters: [log('time', 'Time', 20, 1000, 250, 1, 'ms'), linear('feedback', 'Feedback', 0, 90, 35, 1, '%'), log('tone', 'Tone', 200, 16000, 6000, 1, 'Hz'), linear('mix', 'Mix', 0, 100, 25, 1, '%')],
  },
  reverb: {
    type: 'reverb', name: 'Reverb', shortName: 'VERB', description: 'Place the sound in an acoustic space.',
    parameters: [log('decay', 'Decay', 0.1, 8, 2.2, 0.1, 's'), log('tone', 'Tone', 500, 18000, 9000, 1, 'Hz'), linear('mix', 'Mix', 0, 100, 25, 1, '%')],
  },
  chorus: {
    type: 'chorus', name: 'Chorus', shortName: 'CHOR', description: 'Add animated width and movement.',
    parameters: [log('rate', 'Rate', 0.05, 5, 0.8, 0.01, 'Hz'), log('depth', 'Depth', 1, 20, 6, 0.1, 'ms'), linear('mix', 'Mix', 0, 100, 35, 1, '%')],
  },
  limiter: {
    type: 'limiter', name: 'Limiter', shortName: 'LIM', description: 'Contain peaks at the end of the chain.',
    parameters: [linear('ceiling', 'Ceiling', -12, 0, -0.5, 0.1, 'dB'), log('release', 'Release', 10, 1000, 120, 1, 'ms')],
  },
};

export const MODULE_TYPES = Object.keys(MODULE_CATALOG) as ModuleType[];
export const STORAGE_KEY = 'audio-effect-builder.project.v1';

export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createInitialProject(): ProjectV1 {
  return {
    schemaVersion: 1,
    id: makeId('project'),
    name: 'Untitled',
    revision: 0,
    chain: [],
    nodes: {},
    macros: [],
    activity: [],
  };
}

export function createNode(type: ModuleType, id = makeId('node')): DspNode {
  const params = Object.fromEntries(MODULE_CATALOG[type].parameters.map((parameter) => [parameter.id, parameter.default]));
  return { id, type, params, bypassed: false };
}

export function getParameterDefinition(node: DspNode, paramId: string) {
  return MODULE_CATALOG[node.type].parameters.find((parameter) => parameter.id === paramId);
}

export function getMappingForParameter(project: ProjectV1, nodeId: string, paramId: string) {
  for (const macro of project.macros) {
    const mapping = macro.mappings.find((candidate) => candidate.nodeId === nodeId && candidate.paramId === paramId);
    if (mapping) return { macro, mapping };
  }
  return null;
}

export function interpolateParameter(definition: ParameterDefinition, min: number, max: number, normalized: number) {
  const t = clamp(normalized, 0, 1);
  if (definition.scale === 'log' && min > 0 && max > 0) {
    return Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * t);
  }
  return min + (max - min) * t;
}

export function getEffectiveParameter(project: ProjectV1, nodeId: string, paramId: string) {
  const node = project.nodes[nodeId];
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  const mappingOwner = getMappingForParameter(project, nodeId, paramId);
  if (!mappingOwner) return node.params[paramId];
  const definition = getParameterDefinition(node, paramId);
  if (!definition) throw new Error(`Unknown parameter: ${paramId}`);
  const t = mappingOwner.mapping.inverted ? 1 - mappingOwner.macro.value : mappingOwner.macro.value;
  return interpolateParameter(definition, mappingOwner.mapping.min, mappingOwner.mapping.max, t);
}

export function formatParameter(definition: ParameterDefinition, value: number) {
  if (definition.unit === 'Hz') return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kHz` : `${Math.round(value)} Hz`;
  if (definition.unit === 'ms') return `${Math.round(value)} ms`;
  if (definition.unit === 's') return `${value.toFixed(value < 1 ? 2 : 1)} s`;
  if (definition.unit === '%') return `${Math.round(value)}%`;
  if (definition.unit === 'ratio') return `${value.toFixed(1)}:1`;
  if (definition.unit === 'Q') return value.toFixed(2);
  return `${value.toFixed(1)} dB`;
}

function requireNode(project: ProjectV1, nodeId: string) {
  const node = project.nodes[nodeId];
  if (!node) throw new Error(`Module ${nodeId} does not exist.`);
  return node;
}

function requireMacro(project: ProjectV1, macroId: string) {
  const macro = project.macros.find((candidate) => candidate.id === macroId);
  if (!macro) throw new Error(`Macro ${macroId} does not exist.`);
  return macro;
}

function validateMacroName(project: ProjectV1, name: string, ignoreId?: string) {
  const clean = name.trim();
  if (!clean || clean.length > 24) throw new Error('Macro names must contain 1–24 characters.');
  if (project.macros.some((macro) => macro.id !== ignoreId && macro.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('Macro names must be unique.');
  }
  return clean;
}

function validateMappingTarget(project: ProjectV1, nodeId: string, paramId: string, ignoreMappingId?: string) {
  const node = requireNode(project, nodeId);
  const definition = getParameterDefinition(node, paramId);
  if (!definition) throw new Error(`Parameter ${paramId} does not exist on ${MODULE_CATALOG[node.type].name}.`);
  const occupied = project.macros.some((macro) => macro.mappings.some((mapping) => mapping.id !== ignoreMappingId && mapping.nodeId === nodeId && mapping.paramId === paramId));
  if (occupied) throw new Error('A DSP parameter can be controlled by only one macro.');
  return definition;
}

function describeCommand(project: ProjectV1, command: ProjectCommand) {
  if (command.type === 'rename_project') return `Renamed project to ${command.name.trim()}`;
  if (command.type === 'add_module') return `Added ${MODULE_CATALOG[command.moduleType].name}`;
  if ('nodeId' in command && typeof command.nodeId === 'string' && project.nodes[command.nodeId]) {
    const moduleName = MODULE_CATALOG[project.nodes[command.nodeId].type].name;
    if (command.type === 'set_parameter') return `Adjusted ${moduleName}`;
    if (command.type === 'move_module') return `Reordered ${moduleName}`;
    if (command.type === 'set_bypass') return `${command.bypassed ? 'Bypassed' : 'Enabled'} ${moduleName}`;
    if (command.type === 'disconnect_module') return `Disconnected ${moduleName}`;
    if (command.type === 'connect_module') return `Reconnected ${moduleName}`;
    if (command.type === 'delete_module') return `Deleted ${moduleName}`;
  }
  if (command.type === 'create_macro') return 'Created a plugin control';
  if (command.type === 'rename_macro') return `Renamed a plugin control`;
  if (command.type === 'set_macro_value') return `Adjusted ${requireMacro(project, command.macroId).name}`;
  if (command.type === 'add_mapping') return `Mapped ${requireMacro(project, command.macroId).name}`;
  if (command.type === 'update_mapping') return `Updated ${requireMacro(project, command.macroId).name} mapping`;
  if (command.type === 'remove_mapping') return `Removed ${requireMacro(project, command.macroId).name} mapping`;
  if (command.type === 'delete_macro') return `Deleted ${requireMacro(project, command.macroId).name}`;
  return 'Updated project';
}

function applyOne(project: ProjectV1, command: ProjectCommand) {
  switch (command.type) {
    case 'rename_project': {
      const name = command.name.trim();
      if (!name || name.length > 64) throw new Error('Project names must contain 1–64 characters.');
      project.name = name;
      return;
    }
    case 'add_module': {
      if (!MODULE_CATALOG[command.moduleType]) throw new Error(`Unknown module type: ${command.moduleType}`);
      const node = createNode(command.moduleType, command.nodeId);
      if (project.nodes[node.id]) throw new Error(`Module ID ${node.id} already exists.`);
      project.nodes[node.id] = node;
      const index = clamp(Math.round(command.index ?? project.chain.length), 0, project.chain.length);
      project.chain.splice(index, 0, node.id);
      return;
    }
    case 'set_parameter': {
      const node = requireNode(project, command.nodeId);
      const definition = getParameterDefinition(node, command.paramId);
      if (!definition) throw new Error(`Unknown parameter: ${command.paramId}`);
      if (getMappingForParameter(project, command.nodeId, command.paramId)) throw new Error('Mapped parameters must be adjusted through their macro.');
      if (!Number.isFinite(command.value)) throw new Error('Parameter values must be finite numbers.');
      node.params[command.paramId] = clamp(command.value, definition.min, definition.max);
      return;
    }
    case 'move_module': {
      requireNode(project, command.nodeId);
      if (!project.chain.includes(command.nodeId)) throw new Error('Only connected modules can be reordered.');
      project.chain = project.chain.filter((id) => id !== command.nodeId);
      project.chain.splice(clamp(Math.round(command.index), 0, project.chain.length), 0, command.nodeId);
      return;
    }
    case 'set_bypass':
      requireNode(project, command.nodeId).bypassed = Boolean(command.bypassed);
      return;
    case 'disconnect_module':
      requireNode(project, command.nodeId);
      project.chain = project.chain.filter((id) => id !== command.nodeId);
      return;
    case 'connect_module': {
      requireNode(project, command.nodeId);
      project.chain = project.chain.filter((id) => id !== command.nodeId);
      project.chain.splice(clamp(Math.round(command.index ?? project.chain.length), 0, project.chain.length), 0, command.nodeId);
      return;
    }
    case 'delete_module':
      requireNode(project, command.nodeId);
      project.chain = project.chain.filter((id) => id !== command.nodeId);
      delete project.nodes[command.nodeId];
      project.macros.forEach((macro) => { macro.mappings = macro.mappings.filter((mapping) => mapping.nodeId !== command.nodeId); });
      return;
    case 'create_macro': {
      if (project.macros.length >= 8) throw new Error('A plugin can expose at most eight macro controls.');
      const fallback = `Macro ${project.macros.length + 1}`;
      const name = validateMacroName(project, command.name ?? fallback);
      const id = command.macroId ?? makeId('macro');
      if (project.macros.some((macro) => macro.id === id)) throw new Error(`Macro ID ${id} already exists.`);
      project.macros.push({ id, name, value: 0.5, mappings: [] });
      return;
    }
    case 'rename_macro':
      requireMacro(project, command.macroId).name = validateMacroName(project, command.name, command.macroId);
      return;
    case 'set_macro_value':
      if (!Number.isFinite(command.value)) throw new Error('Macro values must be finite numbers.');
      requireMacro(project, command.macroId).value = clamp(command.value, 0, 1);
      return;
    case 'add_mapping': {
      const macro = requireMacro(project, command.macroId);
      const definition = validateMappingTarget(project, command.nodeId, command.paramId);
      if (!Number.isFinite(command.min) || !Number.isFinite(command.max) || command.min > command.max) throw new Error('Mapping minimum must be less than or equal to its maximum.');
      const min = clamp(command.min, definition.min, definition.max);
      const max = clamp(command.max, definition.min, definition.max);
      if (min > max) throw new Error('Mapping range falls outside the parameter range.');
      macro.mappings.push({ id: command.mappingId ?? makeId('mapping'), nodeId: command.nodeId, paramId: command.paramId, min, max, inverted: Boolean(command.inverted) });
      return;
    }
    case 'update_mapping': {
      const macro = requireMacro(project, command.macroId);
      const mapping = macro.mappings.find((candidate) => candidate.id === command.mappingId);
      if (!mapping) throw new Error(`Mapping ${command.mappingId} does not exist.`);
      const nodeId = command.nodeId ?? mapping.nodeId;
      const paramId = command.paramId ?? mapping.paramId;
      const definition = validateMappingTarget(project, nodeId, paramId, mapping.id);
      const min = command.min ?? mapping.min;
      const max = command.max ?? mapping.max;
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) throw new Error('Mapping minimum must be less than or equal to its maximum.');
      mapping.nodeId = nodeId;
      mapping.paramId = paramId;
      mapping.min = clamp(min, definition.min, definition.max);
      mapping.max = clamp(max, definition.min, definition.max);
      mapping.inverted = command.inverted ?? mapping.inverted;
      return;
    }
    case 'remove_mapping': {
      const macro = requireMacro(project, command.macroId);
      const mapping = macro.mappings.find((candidate) => candidate.id === command.mappingId);
      if (!mapping) throw new Error(`Mapping ${command.mappingId} does not exist.`);
      const node = requireNode(project, mapping.nodeId);
      node.params[mapping.paramId] = getEffectiveParameter(project, mapping.nodeId, mapping.paramId);
      macro.mappings = macro.mappings.filter((candidate) => candidate.id !== command.mappingId);
      return;
    }
    case 'delete_macro': {
      const macro = requireMacro(project, command.macroId);
      macro.mappings.forEach((mapping) => {
        const node = project.nodes[mapping.nodeId];
        if (node) node.params[mapping.paramId] = getEffectiveParameter(project, mapping.nodeId, mapping.paramId);
      });
      project.macros = project.macros.filter((candidate) => candidate.id !== command.macroId);
      return;
    }
  }
}

export function applyProjectCommands(source: ProjectV1, commands: ProjectCommand[], actor: ActivityItem['actor']): ProjectV1 {
  if (!commands.length || commands.length > 50) throw new Error('A change batch must contain between 1 and 50 commands.');
  const project = structuredClone(source);
  const summaries: string[] = [];
  commands.forEach((command) => {
    summaries.push(describeCommand(project, command));
    applyOne(project, command);
  });
  project.revision += 1;
  project.activity = [{ id: makeId('activity'), actor, summary: summaries.length === 1 ? summaries[0] : `${summaries.length} coordinated changes`, timestamp: new Date().toISOString() }, ...project.activity].slice(0, 24);
  return validateProject(project);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateProject(value: unknown): ProjectV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('This is not a supported Audio Effect Builder project.');
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 64) throw new Error('The project metadata is invalid.');
  if (!Number.isInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.chain) || !isRecord(value.nodes) || !Array.isArray(value.macros) || !Array.isArray(value.activity)) throw new Error('The project structure is invalid.');
  const project = structuredClone(value) as unknown as ProjectV1;
  const nodeIds = Object.keys(project.nodes);
  if (new Set(project.chain).size !== project.chain.length || project.chain.some((id) => typeof id !== 'string' || !project.nodes[id])) throw new Error('The signal chain contains an invalid module.');
  nodeIds.forEach((id) => {
    const node = project.nodes[id];
    if (!node || node.id !== id || !MODULE_CATALOG[node.type] || typeof node.bypassed !== 'boolean' || !isRecord(node.params)) throw new Error(`Module ${id} is invalid.`);
    MODULE_CATALOG[node.type].parameters.forEach((definition) => {
      const parameterValue = node.params[definition.id];
      if (!Number.isFinite(parameterValue) || parameterValue < definition.min || parameterValue > definition.max) throw new Error(`Module ${id} has an invalid ${definition.name} value.`);
    });
  });
  if (project.macros.length > 8) throw new Error('The project exposes more than eight macro controls.');
  const names = new Set<string>();
  const targets = new Set<string>();
  project.macros.forEach((macro) => {
    if (!macro || typeof macro.id !== 'string' || typeof macro.name !== 'string' || !macro.name.trim() || macro.name.length > 24 || !Number.isFinite(macro.value) || macro.value < 0 || macro.value > 1 || !Array.isArray(macro.mappings)) throw new Error('A macro control is invalid.');
    const lower = macro.name.toLowerCase();
    if (names.has(lower)) throw new Error('Macro names must be unique.');
    names.add(lower);
    macro.mappings.forEach((mapping) => {
      if (!mapping || typeof mapping.id !== 'string' || typeof mapping.nodeId !== 'string' || typeof mapping.paramId !== 'string' || typeof mapping.inverted !== 'boolean') throw new Error('A macro mapping is invalid.');
      const node = project.nodes[mapping.nodeId];
      const definition = node && getParameterDefinition(node, mapping.paramId);
      if (!definition || !Number.isFinite(mapping.min) || !Number.isFinite(mapping.max) || mapping.min < definition.min || mapping.max > definition.max || mapping.min > mapping.max) throw new Error('A macro mapping range is invalid.');
      const target = `${mapping.nodeId}:${mapping.paramId}`;
      if (targets.has(target)) throw new Error('A parameter is mapped more than once.');
      targets.add(target);
    });
  });
  return project;
}

export function findAvailableMappingTarget(project: ProjectV1) {
  for (const nodeId of [...project.chain, ...Object.keys(project.nodes).filter((id) => !project.chain.includes(id))]) {
    const node = project.nodes[nodeId];
    for (const parameter of MODULE_CATALOG[node.type].parameters) {
      if (!getMappingForParameter(project, nodeId, parameter.id)) return { nodeId, parameter };
    }
  }
  return null;
}
