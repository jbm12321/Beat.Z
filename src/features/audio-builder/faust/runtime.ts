import type { LooseFaustDspFactory } from '@grame/faustwasm/dist/esm/index.js';
import {
  MODULE_CATALOG,
  getEffectiveParameter,
  type DspNode,
  type ModuleType,
  type ProjectV2,
} from '../domain/project.ts';

export type StereoSamples = [Float32Array, Float32Array];
export type FaustFactoryLoader = (type: ModuleType) => Promise<LooseFaustDspFactory>;
export type FaustRealtimeNode = AudioNode & { destroy(): void; setParamValue(path: string, value: number): void };

const browserFactoryCache = new Map<ModuleType, Promise<LooseFaustDspFactory>>();
const browserRuntimePath = '/faust/faustwasm-runtime.js';
const nodeRuntimeSpecifier = '@grame/faustwasm/dist/esm/index.js';
type FaustRuntimeModule = Pick<typeof import('@grame/faustwasm/dist/esm/index.js'), 'FaustMonoDspGenerator'>;
let faustRuntimePromise: Promise<FaustRuntimeModule> | null = null;

function loadFaustRuntime(): Promise<FaustRuntimeModule> {
  if (faustRuntimePromise) return faustRuntimePromise;
  const viteEnvironment = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  const isViteDevelopment = typeof window !== 'undefined' && viteEnvironment?.DEV === true;
  const specifier = typeof window === 'undefined' || isViteDevelopment ? nodeRuntimeSpecifier : browserRuntimePath;
  const runtimeImport = isViteDevelopment
    ? import('@grame/faustwasm/dist/esm/index.js')
    : import(/* @vite-ignore */ specifier);
  faustRuntimePromise = runtimeImport
    .then((runtime: FaustRuntimeModule) => {
      if (typeof runtime.FaustMonoDspGenerator !== 'function') {
        throw new Error('FaustMonoDspGenerator is missing from the runtime module.');
      }
      return runtime;
    })
    .catch((cause: unknown) => {
      faustRuntimePromise = null;
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Faust runtime ${specifier} could not be loaded: ${detail}`);
    });
  return faustRuntimePromise;
}

export async function loadFaustFactoryFromBytes(wasmBytes: ArrayBuffer | Uint8Array, json: string): Promise<LooseFaustDspFactory> {
  const code = wasmBytes instanceof Uint8Array ? Uint8Array.from(wasmBytes) : new Uint8Array(wasmBytes.slice(0));
  const wasmModule = await WebAssembly.compile(code);
  return { code, module: wasmModule, json };
}

export function loadFaustFactory(type: ModuleType) {
  let pending = browserFactoryCache.get(type);
  if (!pending) {
    const definition = MODULE_CATALOG[type];
    pending = Promise.all([
      fetch(definition.wasmPath).then((response) => {
        if (!response.ok) throw new Error(`Faust processor ${type} could not be loaded.`);
        return response.arrayBuffer();
      }),
      fetch(definition.metadataPath).then((response) => {
        if (!response.ok) throw new Error(`Faust metadata ${type} could not be loaded.`);
        return response.text();
      }),
    ]).then(([wasm, json]) => loadFaustFactoryFromBytes(wasm, json));
    browserFactoryCache.set(type, pending);
  }
  return pending;
}

export function setFaustParameters(target: Pick<FaustRealtimeNode, 'setParamValue'>, node: DspNode, project?: ProjectV2) {
  MODULE_CATALOG[node.type].parameters.forEach((definition) => {
    const value = project ? getEffectiveParameter(project, node.id, definition.id) : node.params[definition.id];
    target.setParamValue(definition.faustPath, value);
  });
}

export async function createFaustAudioNode(context: BaseAudioContext, node: DspNode, project: ProjectV2): Promise<FaustRealtimeNode> {
  const factory = await loadFaustFactory(node.type);
  const { FaustMonoDspGenerator } = await loadFaustRuntime();
  const generator = new FaustMonoDspGenerator();
  const processorName = `aeb-${node.type}-${MODULE_CATALOG[node.type].definitionVersion.replaceAll('.', '-')}`;
  const faustNode = await generator.createNode(context, node.type, factory, false, 1024, processorName);
  if (!faustNode) throw new Error(`${MODULE_CATALOG[node.type].name} could not start its Faust processor.`);
  setFaustParameters(faustNode, node, project);
  return faustNode as FaustRealtimeNode;
}

export async function renderFaustModuleOffline(
  node: DspNode,
  input: ReadonlyArray<Float32Array>,
  sampleRate: number,
  factory: LooseFaustDspFactory,
  project?: ProjectV2,
): Promise<StereoSamples> {
  const left = input[0] ?? new Float32Array();
  const right = input[1] ?? left;
  if (left.length !== right.length) throw new Error('Offline stereo channels must contain the same number of frames.');
  if (node.bypassed) return [Float32Array.from(left), Float32Array.from(right)];
  const { FaustMonoDspGenerator } = await loadFaustRuntime();
  const generator = new FaustMonoDspGenerator();
  const processor = await generator.createOfflineProcessor(sampleRate, 128, factory);
  if (!processor) throw new Error(`${MODULE_CATALOG[node.type].name} could not create an offline Faust processor.`);
  try {
    setFaustParameters(processor, node, project);
    const output = processor.render([left, right], left.length);
    if (!output[0] || !output[1]) throw new Error(`${MODULE_CATALOG[node.type].name} did not produce stereo audio.`);
    return [Float32Array.from(output[0]), Float32Array.from(output[1])];
  } finally {
    processor.destroy();
  }
}

export async function renderFaustProjectOffline(
  project: ProjectV2,
  input: ReadonlyArray<Float32Array>,
  sampleRate: number,
  loadFactory: FaustFactoryLoader = loadFaustFactory,
): Promise<StereoSamples> {
  let output: StereoSamples = [Float32Array.from(input[0] ?? []), Float32Array.from(input[1] ?? input[0] ?? [])];
  for (const nodeId of project.chain) {
    const node = project.nodes[nodeId];
    if (!node || node.bypassed) continue;
    output = await renderFaustModuleOffline(node, output, sampleRate, await loadFactory(node.type), project);
  }
  return output;
}
