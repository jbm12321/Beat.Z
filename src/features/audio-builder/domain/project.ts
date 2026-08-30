export type ModuleType = 'gain' | 'filter' | 'saturation';
export type ParameterScale = 'linear' | 'log';
export type ParameterKind = 'continuous' | 'choice';

export interface ParameterChoice {
  value: number;
  label: string;
}

export interface ParameterDefinition {
  id: string;
  name: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit: 'dB' | 'Hz' | '%' | 'Q' | 'mode';
  scale: ParameterScale;
  kind: ParameterKind;
  choices?: ParameterChoice[];
  mappable: boolean;
  faustPath: string;
}

export interface ModuleDefinition {
  type: ModuleType;
  name: string;
  shortName: string;
  description: string;
  definitionVersion: '0.1.0';
  sourceSha256: string;
  wasmPath: string;
  metadataPath: string;
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
  actor: 'human' | 'agent' | 'system';
  summary: string;
  timestamp: string;
}

export interface EngineProvenance {
  effectDefinition: 'audio-effect-builder-faust';
  definitionVersion: '0.1.0';
  faustWasmVersion: '0.16.6';
  faustCompilerVersion: '2.86.2';
  libraries: {
    basics: '1.23.0';
    filters: '1.7.1';
    maths: '2.9.0';
    platform: '1.3.0';
    signals: '1.6.0';
  };
  moduleSourceSha256: Record<ModuleType, string>;
}

export interface LegacyMigrationRecord {
  sourceSchemaVersion: 1;
  migratedAt: string;
  unsupportedModuleTypes: string[];
  legacyBackup: LegacyProjectV1;
}

export interface ProjectV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  revision: number;
  engine: EngineProvenance;
  chain: string[];
  nodes: Record<string, DspNode>;
  macros: MacroControl[];
  activity: ActivityItem[];
  migration?: LegacyMigrationRecord;
}

/** @deprecated Kept as a source-compatible alias for the original browser MVP. */
export type ProjectV1 = ProjectV2;

export interface LegacyDspNodeV1 {
  id: string;
  type: string;
  params: Record<string, number>;
  bypassed: boolean;
}

export interface LegacyProjectV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  chain: string[];
  nodes: Record<string, LegacyDspNodeV1>;
  macros: MacroControl[];
  activity: Array<Omit<ActivityItem, 'actor'> & { actor: 'human' | 'agent' }>;
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

const parameter = (
  id: string,
  name: string,
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  unit: ParameterDefinition['unit'],
  scale: ParameterScale,
  faustPath: string,
  options: Partial<Pick<ParameterDefinition, 'kind' | 'choices' | 'mappable'>> = {},
): ParameterDefinition => ({
  id,
  name,
  min,
  max,
  default: defaultValue,
  step,
  unit,
  scale,
  kind: options.kind ?? 'continuous',
  choices: options.choices,
  mappable: options.mappable ?? true,
  faustPath,
});

export const MODULE_CATALOG: Record<ModuleType, ModuleDefinition> = {
  gain: {
    type: 'gain', name: 'Gain', shortName: 'GAIN', description: 'Clean level adjustment.', definitionVersion: '0.1.0',
    sourceSha256: 'caca77ad2ac86cf0ef26f62a22d1d0c62a7d4b7f86c6c4e3fef77e9d19fbd35d',
    wasmPath: '/faust/gain/dsp-module.wasm', metadataPath: '/faust/gain/dsp-meta.json',
    parameters: [parameter('level', 'Level', -24, 24, 0, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Gain/Gain_Level')],
  },
  filter: {
    type: 'filter', name: 'Filter', shortName: 'FILT', description: 'Remove lows or highs with resonant shaping.', definitionVersion: '0.1.0',
    sourceSha256: '873e26b2ca7ac309783f154f4becd1fc479d046cd295d0ae732aa81cfbc931eb',
    wasmPath: '/faust/filter/dsp-module.wasm', metadataPath: '/faust/filter/dsp-meta.json',
    parameters: [
      parameter('mode', 'Mode', 0, 1, 0, 1, 'mode', 'linear', '/Audio_Effect_Builder_Filter/Filter_Mode', {
        kind: 'choice', choices: [{ value: 0, label: 'High Pass' }, { value: 1, label: 'Low Pass' }], mappable: false,
      }),
      parameter('cutoff', 'Cutoff', 20, 20000, 80, 1, 'Hz', 'log', '/Audio_Effect_Builder_Filter/Filter_Cutoff'),
      parameter('resonance', 'Resonance', 0.1, 20, 0.7, 0.1, 'Q', 'log', '/Audio_Effect_Builder_Filter/Filter_Resonance'),
    ],
  },
  saturation: {
    type: 'saturation', name: 'Saturation', shortName: 'SAT', description: 'Add harmonic color and weight.', definitionVersion: '0.1.0',
    sourceSha256: '238cd373e164ba480c6367ae7ef1c071205346361c7f597d6c1dc3878af0a75b',
    wasmPath: '/faust/saturation/dsp-module.wasm', metadataPath: '/faust/saturation/dsp-meta.json',
    parameters: [
      parameter('drive', 'Drive', 0, 24, 6, 0.1, 'dB', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Drive'),
      parameter('tone', 'Tone', 200, 16000, 8000, 1, 'Hz', 'log', '/Audio_Effect_Builder_Saturation/Saturation_Tone'),
      parameter('mix', 'Mix', 0, 100, 50, 1, '%', 'linear', '/Audio_Effect_Builder_Saturation/Saturation_Mix'),
    ],
  },
};

export const MODULE_TYPES = Object.keys(MODULE_CATALOG) as ModuleType[];
export const ENGINE_PROVENANCE: EngineProvenance = {
  effectDefinition: 'audio-effect-builder-faust', definitionVersion: '0.1.0', faustWasmVersion: '0.16.6', faustCompilerVersion: '2.86.2',
  libraries: { basics: '1.23.0', filters: '1.7.1', maths: '2.9.0', platform: '1.3.0', signals: '1.6.0' },
  moduleSourceSha256: Object.fromEntries(MODULE_TYPES.map((type) => [type, MODULE_CATALOG[type].sourceSha256])) as Record<ModuleType, string>,
};

export const STORAGE_KEY = 'audio-effect-builder.project.v2';
export const LAST_VALID_STORAGE_KEY = 'audio-effect-builder.project.v2.last-valid';
export const LEGACY_STORAGE_KEY = 'audio-effect-builder.project.v1';

export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createInitialProject(): ProjectV2 {
  return {
    schemaVersion: 2, id: makeId('project'), name: 'Untitled', revision: 0, engine: structuredClone(ENGINE_PROVENANCE),
    chain: [], nodes: {}, macros: [], activity: [],
  };
}

export function createNode(type: ModuleType, id = makeId('node')): DspNode {
  const params = Object.fromEntries(MODULE_CATALOG[type].parameters.map((definition) => [definition.id, definition.default]));
  return { id, type, params, bypassed: false };
}

export function getParameterDefinition(node: DspNode, paramId: string) {
  return MODULE_CATALOG[node.type].parameters.find((definition) => definition.id === paramId);
}

export function getMappingForParameter(project: ProjectV2, nodeId: string, paramId: string) {
  for (const macro of project.macros) {
    const mapping = macro.mappings.find((candidate) => candidate.nodeId === nodeId && candidate.paramId === paramId);
    if (mapping) return { macro, mapping };
  }
  return null;
}

export function interpolateParameter(definition: ParameterDefinition, min: number, max: number, normalized: number) {
  const t = clamp(normalized, 0, 1);
  if (definition.scale === 'log' && min > 0 && max > 0) return Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * t);
  return min + (max - min) * t;
}

export function getEffectiveParameter(project: ProjectV2, nodeId: string, paramId: string) {
  const node = project.nodes[nodeId];
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  const owner = getMappingForParameter(project, nodeId, paramId);
  if (!owner) return node.params[paramId];
  const definition = getParameterDefinition(node, paramId);
  if (!definition) throw new Error(`Unknown parameter: ${paramId}`);
  const t = owner.mapping.inverted ? 1 - owner.macro.value : owner.macro.value;
  return interpolateParameter(definition, owner.mapping.min, owner.mapping.max, t);
}

export function formatParameter(definition: ParameterDefinition, value: number) {
  if (definition.kind === 'choice') return definition.choices?.find((choice) => choice.value === value)?.label ?? String(value);
  if (definition.unit === 'Hz') return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kHz` : `${Math.round(value)} Hz`;
  if (definition.unit === '%') return `${Math.round(value)}%`;
  if (definition.unit === 'Q') return value.toFixed(2);
  return `${value.toFixed(1)} dB`;
}

function requireNode(project: ProjectV2, nodeId: string) {
  const node = project.nodes[nodeId];
  if (!node) throw new Error(`Module ${nodeId} does not exist.`);
  return node;
}

function requireMacro(project: ProjectV2, macroId: string) {
  const macro = project.macros.find((candidate) => candidate.id === macroId);
  if (!macro) throw new Error(`Macro ${macroId} does not exist.`);
  return macro;
}

function validateMacroName(project: ProjectV2, name: string, ignoreId?: string) {
  const clean = name.trim();
  if (!clean || clean.length > 24) throw new Error('Macro names must contain 1–24 characters.');
  if (project.macros.some((macro) => macro.id !== ignoreId && macro.name.toLowerCase() === clean.toLowerCase())) throw new Error('Macro names must be unique.');
  return clean;
}

function validateIndex(index: number, max: number, action: string) {
  if (!Number.isInteger(index) || index < 0 || index > max) throw new Error(`${action} index must be between 0 and ${max}.`);
  return index;
}

function validateNativeValue(definition: ParameterDefinition, value: number, label = definition.name) {
  if (!Number.isFinite(value) || value < definition.min || value > definition.max) throw new Error(`${label} must be between ${definition.min} and ${definition.max}.`);
  if (definition.kind === 'choice' && !definition.choices?.some((choice) => choice.value === value)) throw new Error(`${label} is not a supported choice.`);
  return value;
}

function validateMappingTarget(project: ProjectV2, nodeId: string, paramId: string, ignoreMappingId?: string) {
  const node = requireNode(project, nodeId);
  const definition = getParameterDefinition(node, paramId);
  if (!definition) throw new Error(`Parameter ${paramId} does not exist on ${MODULE_CATALOG[node.type].name}.`);
  if (!definition.mappable) throw new Error(`${definition.name} cannot be assigned to a macro in this version.`);
  const occupied = project.macros.some((macro) => macro.mappings.some((mapping) => mapping.id !== ignoreMappingId && mapping.nodeId === nodeId && mapping.paramId === paramId));
  if (occupied) throw new Error('A DSP parameter can be controlled by only one macro.');
  return definition;
}

function describeCommand(project: ProjectV2, command: ProjectCommand) {
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
  if (command.type === 'rename_macro') return 'Renamed a plugin control';
  if (command.type === 'set_macro_value') return `Adjusted ${requireMacro(project, command.macroId).name}`;
  if (command.type === 'add_mapping') return `Mapped ${requireMacro(project, command.macroId).name}`;
  if (command.type === 'update_mapping') return `Updated ${requireMacro(project, command.macroId).name} mapping`;
  if (command.type === 'remove_mapping') return `Removed ${requireMacro(project, command.macroId).name} mapping`;
  if (command.type === 'delete_macro') return `Deleted ${requireMacro(project, command.macroId).name}`;
  return 'Updated project';
}

function applyOne(project: ProjectV2, command: ProjectCommand) {
  switch (command.type) {
    case 'rename_project': {
      const name = command.name.trim();
      if (!name || name.length > 64) throw new Error('Project names must contain 1–64 characters.');
      project.name = name;
      return;
    }
    case 'add_module': {
      if (!MODULE_CATALOG[command.moduleType]) throw new Error(`Unknown module type: ${String(command.moduleType)}`);
      const node = createNode(command.moduleType, command.nodeId);
      if (project.nodes[node.id]) throw new Error(`Module ID ${node.id} already exists.`);
      const index = command.index === undefined ? project.chain.length : validateIndex(command.index, project.chain.length, 'Insert');
      project.nodes[node.id] = node;
      project.chain.splice(index, 0, node.id);
      return;
    }
    case 'set_parameter': {
      const node = requireNode(project, command.nodeId);
      const definition = getParameterDefinition(node, command.paramId);
      if (!definition) throw new Error(`Unknown parameter: ${command.paramId}`);
      if (getMappingForParameter(project, command.nodeId, command.paramId)) throw new Error('Mapped parameters must be adjusted through their macro.');
      node.params[command.paramId] = validateNativeValue(definition, command.value);
      return;
    }
    case 'move_module': {
      requireNode(project, command.nodeId);
      if (!project.chain.includes(command.nodeId)) throw new Error('Only connected modules can be reordered.');
      const remaining = project.chain.filter((id) => id !== command.nodeId);
      const index = validateIndex(command.index, remaining.length, 'Move');
      remaining.splice(index, 0, command.nodeId);
      project.chain = remaining;
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
      const remaining = project.chain.filter((id) => id !== command.nodeId);
      const index = command.index === undefined ? remaining.length : validateIndex(command.index, remaining.length, 'Connect');
      remaining.splice(index, 0, command.nodeId);
      project.chain = remaining;
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
      const name = validateMacroName(project, command.name ?? `Macro ${project.macros.length + 1}`);
      const id = command.macroId ?? makeId('macro');
      if (project.macros.some((macro) => macro.id === id)) throw new Error(`Macro ID ${id} already exists.`);
      project.macros.push({ id, name, value: 0.5, mappings: [] });
      return;
    }
    case 'rename_macro':
      requireMacro(project, command.macroId).name = validateMacroName(project, command.name, command.macroId);
      return;
    case 'set_macro_value':
      if (!Number.isFinite(command.value) || command.value < 0 || command.value > 1) throw new Error('Macro values must be between 0 and 1.');
      requireMacro(project, command.macroId).value = command.value;
      return;
    case 'add_mapping': {
      const macro = requireMacro(project, command.macroId);
      const definition = validateMappingTarget(project, command.nodeId, command.paramId);
      validateNativeValue(definition, command.min, 'Mapping minimum');
      validateNativeValue(definition, command.max, 'Mapping maximum');
      if (command.min > command.max) throw new Error('Mapping minimum must be less than or equal to its maximum.');
      const id = command.mappingId ?? makeId('mapping');
      if (project.macros.some((candidate) => candidate.mappings.some((mapping) => mapping.id === id))) throw new Error(`Mapping ID ${id} already exists.`);
      macro.mappings.push({ id, nodeId: command.nodeId, paramId: command.paramId, min: command.min, max: command.max, inverted: Boolean(command.inverted) });
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
      validateNativeValue(definition, min, 'Mapping minimum');
      validateNativeValue(definition, max, 'Mapping maximum');
      if (min > max) throw new Error('Mapping minimum must be less than or equal to its maximum.');
      Object.assign(mapping, { nodeId, paramId, min, max, inverted: command.inverted ?? mapping.inverted });
      return;
    }
    case 'remove_mapping': {
      const macro = requireMacro(project, command.macroId);
      const mapping = macro.mappings.find((candidate) => candidate.id === command.mappingId);
      if (!mapping) throw new Error(`Mapping ${command.mappingId} does not exist.`);
      requireNode(project, mapping.nodeId).params[mapping.paramId] = getEffectiveParameter(project, mapping.nodeId, mapping.paramId);
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

export function applyProjectCommands(source: ProjectV2, commands: ProjectCommand[], actor: ActivityItem['actor'], expectedRevision?: number): ProjectV2 {
  if (expectedRevision !== undefined && expectedRevision !== source.revision) throw new Error(`Stale revision ${expectedRevision}; current revision is ${source.revision}.`);
  if (!commands.length || commands.length > 50) throw new Error('A change batch must contain between 1 and 50 commands.');
  const project = structuredClone(source);
  const summaries: string[] = [];
  commands.forEach((command) => { summaries.push(describeCommand(project, command)); applyOne(project, command); });
  project.revision = source.revision + 1;
  project.activity = [{
    id: makeId('activity'), actor, summary: summaries.length === 1 ? summaries[0] : `${summaries.length} coordinated changes`, timestamp: new Date().toISOString(),
  }, ...project.activity].slice(0, 24);
  return validateProject(project);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateProject(value: unknown): ProjectV2 {
  if (!isRecord(value) || value.schemaVersion !== 2) throw new Error('This is not a supported Audio Effect Builder v0.1 project.');
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 64) throw new Error('The project metadata is invalid.');
  if (!Number.isInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.chain) || !isRecord(value.nodes) || !Array.isArray(value.macros) || !Array.isArray(value.activity)) throw new Error('The project structure is invalid.');
  const project = structuredClone(value) as unknown as ProjectV2;
  if (!sameJson(project.engine, ENGINE_PROVENANCE)) throw new Error('The project uses an unsupported Faust effect or library version.');

  const nodeIds = Object.keys(project.nodes);
  if (new Set(project.chain).size !== project.chain.length || project.chain.some((id) => typeof id !== 'string' || !project.nodes[id])) throw new Error('The signal chain contains an invalid module.');
  nodeIds.forEach((id) => {
    const node = project.nodes[id];
    if (!node || node.id !== id || !MODULE_CATALOG[node.type] || typeof node.bypassed !== 'boolean' || !isRecord(node.params)) throw new Error(`Module ${id} is invalid.`);
    const definitions = MODULE_CATALOG[node.type].parameters;
    if (Object.keys(node.params).length !== definitions.length || Object.keys(node.params).some((paramId) => !definitions.some((definition) => definition.id === paramId))) throw new Error(`Module ${id} has an unsupported parameter.`);
    definitions.forEach((definition) => validateNativeValue(definition, node.params[definition.id], `Module ${id} ${definition.name}`));
  });

  if (project.macros.length > 8) throw new Error('The project exposes more than eight macro controls.');
  const macroIds = new Set<string>();
  const mappingIds = new Set<string>();
  const names = new Set<string>();
  const targets = new Set<string>();
  project.macros.forEach((macro) => {
    if (!macro || typeof macro.id !== 'string' || typeof macro.name !== 'string' || !macro.name.trim() || macro.name.length > 24 || !Number.isFinite(macro.value) || macro.value < 0 || macro.value > 1 || !Array.isArray(macro.mappings)) throw new Error('A macro control is invalid.');
    if (macroIds.has(macro.id)) throw new Error('Macro IDs must be unique.');
    macroIds.add(macro.id);
    const lower = macro.name.toLowerCase();
    if (names.has(lower)) throw new Error('Macro names must be unique.');
    names.add(lower);
    macro.mappings.forEach((mapping) => {
      if (!mapping || typeof mapping.id !== 'string' || typeof mapping.nodeId !== 'string' || typeof mapping.paramId !== 'string' || typeof mapping.inverted !== 'boolean') throw new Error('A macro mapping is invalid.');
      if (mappingIds.has(mapping.id)) throw new Error('Mapping IDs must be unique.');
      mappingIds.add(mapping.id);
      const node = project.nodes[mapping.nodeId];
      const definition = node && getParameterDefinition(node, mapping.paramId);
      if (!definition || !definition.mappable || !Number.isFinite(mapping.min) || !Number.isFinite(mapping.max) || mapping.min < definition.min || mapping.max > definition.max || mapping.min > mapping.max) throw new Error('A macro mapping range is invalid.');
      const target = `${mapping.nodeId}:${mapping.paramId}`;
      if (targets.has(target)) throw new Error('A parameter is mapped more than once.');
      targets.add(target);
    });
  });

  project.activity.forEach((item) => {
    if (!item || typeof item.id !== 'string' || !['human', 'agent', 'system'].includes(item.actor) || typeof item.summary !== 'string' || !item.summary || typeof item.timestamp !== 'string' || Number.isNaN(Date.parse(item.timestamp))) throw new Error('The activity history is invalid.');
  });
  if (project.migration && (project.migration.sourceSchemaVersion !== 1 || typeof project.migration.migratedAt !== 'string' || !Array.isArray(project.migration.unsupportedModuleTypes) || !isRecord(project.migration.legacyBackup) || project.migration.legacyBackup.schemaVersion !== 1)) throw new Error('The migration record is invalid.');
  return project;
}

function validateLegacyProject(value: unknown): LegacyProjectV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || typeof value.name !== 'string' || !value.name.trim() || !Number.isInteger(value.revision) || !Array.isArray(value.chain) || !isRecord(value.nodes) || !Array.isArray(value.macros) || !Array.isArray(value.activity)) throw new Error('This legacy project is invalid.');
  const legacy = structuredClone(value) as unknown as LegacyProjectV1;
  if (new Set(legacy.chain).size !== legacy.chain.length || legacy.chain.some((id) => typeof id !== 'string' || !legacy.nodes[id])) throw new Error('The legacy signal chain is invalid.');
  Object.entries(legacy.nodes).forEach(([id, node]) => {
    if (!node || node.id !== id || typeof node.type !== 'string' || !isRecord(node.params) || Object.values(node.params).some((value) => !Number.isFinite(value)) || typeof node.bypassed !== 'boolean') throw new Error(`Legacy module ${id} is invalid.`);
  });
  return legacy;
}

export function migrateLegacyProject(value: unknown): ProjectV2 {
  const legacy = validateLegacyProject(value);
  const nodes: Record<string, DspNode> = {};
  const unsupportedModuleTypes = new Set<string>();
  Object.entries(legacy.nodes).forEach(([id, node]) => {
    if (node.type === 'gain') {
      const migrated = createNode('gain', id);
      if (Number.isFinite(node.params.level)) migrated.params.level = clamp(node.params.level, -24, 24);
      migrated.bypassed = node.bypassed;
      nodes[id] = migrated;
      return;
    }
    if (node.type === 'high_pass' || node.type === 'low_pass') {
      const migrated = createNode('filter', id);
      migrated.params.mode = node.type === 'high_pass' ? 0 : 1;
      if (Number.isFinite(node.params.cutoff)) migrated.params.cutoff = clamp(node.params.cutoff, 20, 20000);
      if (Number.isFinite(node.params.resonance)) migrated.params.resonance = clamp(node.params.resonance, 0.1, 20);
      migrated.bypassed = node.bypassed;
      nodes[id] = migrated;
      return;
    }
    if (node.type === 'saturation') {
      const migrated = createNode('saturation', id);
      MODULE_CATALOG.saturation.parameters.forEach((definition) => {
        if (Number.isFinite(node.params[definition.id])) migrated.params[definition.id] = clamp(node.params[definition.id], definition.min, definition.max);
      });
      migrated.bypassed = node.bypassed;
      nodes[id] = migrated;
      return;
    }
    unsupportedModuleTypes.add(node.type);
  });

  const macros = legacy.macros.map((macro) => ({
    ...macro,
    mappings: macro.mappings.filter((mapping) => {
      const node = nodes[mapping.nodeId];
      const definition = node && getParameterDefinition(node, mapping.paramId);
      return Boolean(definition?.mappable && mapping.min >= definition.min && mapping.max <= definition.max && mapping.min <= mapping.max);
    }),
  }));
  const migratedAt = new Date().toISOString();
  const project: ProjectV2 = {
    schemaVersion: 2,
    id: legacy.id,
    name: legacy.name,
    revision: legacy.revision + 1,
    engine: structuredClone(ENGINE_PROVENANCE),
    chain: legacy.chain.filter((id) => Boolean(nodes[id])),
    nodes,
    macros,
    activity: [{
      id: makeId('activity'), actor: 'system' as const,
      summary: unsupportedModuleTypes.size
        ? `Migrated to Faust v0.1; preserved ${unsupportedModuleTypes.size} unsupported module type${unsupportedModuleTypes.size === 1 ? '' : 's'} in the recovery record`
        : 'Migrated project to the Faust v0.1 engine',
      timestamp: migratedAt,
    }, ...legacy.activity].slice(0, 24),
    migration: { sourceSchemaVersion: 1, migratedAt, unsupportedModuleTypes: [...unsupportedModuleTypes].sort(), legacyBackup: legacy },
  };
  return validateProject(project);
}

export function parseProject(value: unknown): ProjectV2 {
  if (isRecord(value) && value.schemaVersion === 1) return migrateLegacyProject(value);
  return validateProject(value);
}

export function findAvailableMappingTarget(project: ProjectV2) {
  for (const nodeId of [...project.chain, ...Object.keys(project.nodes).filter((id) => !project.chain.includes(id))]) {
    const node = project.nodes[nodeId];
    for (const definition of MODULE_CATALOG[node.type].parameters) {
      if (definition.mappable && !getMappingForParameter(project, nodeId, definition.id)) return { nodeId, parameter: definition };
    }
  }
  return null;
}
