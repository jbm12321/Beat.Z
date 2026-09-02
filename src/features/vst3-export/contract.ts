import { hashProject, type FrozenProjectRevision } from '../audio-builder/domain/build.ts';
import { MODULE_CATALOG, validateProject, type EngineProvenance, type ModuleType, type ProjectV2 } from '../audio-builder/domain/project.ts';

export const PINNED_NATIVE_TOOLCHAIN = Object.freeze({
  platform: 'macos',
  architecture: 'arm64',
  deploymentTarget: '13.0',
  faust: { version: '2.85.5', codegenFlags: ['-single'] },
  cmake: { version: '4.3.1', generator: 'Ninja' },
  ninja: { version: '1.13.2' },
  iPlug2Revision: 'b64192fe18afd9bc9a1fe324db5aceb48f4a0eee',
  vst3SdkRevision: '58f8da7936800732561402d7936584ca4505de07',
  parity: { sampleRates: [44100, 48000, 96000], maxTolerance: 0.0005, rmsTolerance: 0.00015 },
});

export interface EffectiveDspNode {
  id: string;
  type: ModuleType;
  params: Record<string, number>;
}

export interface EffectiveMacroMapping {
  nodeId: string;
  paramId: string;
  min: number;
  max: number;
  inverted: boolean;
  scale: 'linear' | 'log';
  faustPath: string;
}

export interface EffectiveDspSpecV1 {
  schemaVersion: 1;
  projectId: string;
  pluginName: string;
  engine: EngineProvenance;
  chain: EffectiveDspNode[];
  macros: Array<{ id: string; name: string; value: number; mappings: EffectiveMacroMapping[] }>;
}

export interface NativeBuildRequestV1 {
  schemaVersion: 1;
  projectId: string;
  revision: number;
  approvalHash: string;
  dspHash: string;
  requestedAt: string;
  project: ProjectV2;
  dsp: EffectiveDspSpecV1;
  toolchain: typeof PINNED_NATIVE_TOOLCHAIN;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

export async function hashCanonical(value: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function lowerEffectiveDsp(input: ProjectV2): EffectiveDspSpecV1 {
  const project = validateProject(input);
  const chain = project.chain
    .map((nodeId) => project.nodes[nodeId])
    .filter((node) => !node.bypassed)
    .map((node) => ({ id: node.id, type: node.type, params: structuredClone(node.params) }));
  if (chain.length === 0) throw new Error('VST3 export requires at least one active module in the signal chain.');
  const activeNodeIds = new Set(chain.map((node) => node.id));
  const macros = project.macros.map((macro) => ({
    id: macro.id,
    name: macro.name,
    value: macro.value,
    mappings: macro.mappings
      .filter((mapping) => activeNodeIds.has(mapping.nodeId))
      .map((mapping) => {
        const node = project.nodes[mapping.nodeId];
        const parameter = MODULE_CATALOG[node.type].parameters.find((candidate) => candidate.id === mapping.paramId);
        if (!parameter) throw new Error(`Macro ${macro.name} targets an unknown parameter.`);
        return {
          nodeId: mapping.nodeId,
          paramId: mapping.paramId,
          min: mapping.min,
          max: mapping.max,
          inverted: mapping.inverted,
          scale: parameter.scale,
          faustPath: parameter.faustPath,
        };
      }),
  })).filter((macro) => macro.mappings.length > 0);
  return {
    schemaVersion: 1,
    projectId: project.id,
    pluginName: project.name,
    engine: structuredClone(project.engine),
    chain,
    macros,
  };
}

export async function validateFrozenSnapshot(value: unknown): Promise<FrozenProjectRevision> {
  if (!value || typeof value !== 'object') throw new Error('The approved project snapshot is missing.');
  const frozen = value as FrozenProjectRevision;
  const project = validateProject(frozen.project);
  const approvalHash = await hashProject(project);
  if (frozen.projectId !== project.id || frozen.revision !== project.revision) throw new Error('The approved snapshot identity does not match its project.');
  if (frozen.approvalHash !== approvalHash || frozen.contentHash !== approvalHash) throw new Error('The approved project snapshot has changed since validation.');
  return frozen;
}

export async function createNativeBuildRequest(input: FrozenProjectRevision): Promise<NativeBuildRequestV1> {
  const frozen = await validateFrozenSnapshot(input);
  const dsp = lowerEffectiveDsp(frozen.project);
  const dspHash = await hashCanonical({ dsp, toolchain: PINNED_NATIVE_TOOLCHAIN });
  return {
    schemaVersion: 1,
    projectId: frozen.projectId,
    revision: frozen.revision,
    approvalHash: frozen.approvalHash,
    dspHash,
    requestedAt: new Date().toISOString(),
    project: structuredClone(frozen.project),
    dsp,
    toolchain: PINNED_NATIVE_TOOLCHAIN,
  };
}
