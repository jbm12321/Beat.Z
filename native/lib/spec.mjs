import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256Canonical } from './canonical.mjs';
import { NATIVE_MODULE_CATALOG, SOURCE_FINGERPRINTS } from './catalog.mjs';
import { NativeBuildError } from './errors.mjs';
import { assertDisplayName, assertSafeId, assertSha256 } from './safety.mjs';

const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message, options = {}) {
  throw new NativeBuildError('invalid_build_request', message, options);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function number(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} is outside its supported range.`);
  return value;
}

function validateDsp(dsp) {
  object(dsp, 'dsp');
  if (dsp.schemaVersion !== 1) fail('Unsupported DSP schema.');
  assertSafeId(dsp.projectId, 'DSP project id');
  assertDisplayName(dsp.pluginName, 'Plugin name');
  if (!Array.isArray(dsp.chain) || dsp.chain.length < 1 || dsp.chain.length > 64) fail('DSP chain must contain 1-64 active modules.');
  const nodes = new Map();
  for (const node of dsp.chain) {
    object(node, 'DSP node');
    assertSafeId(node.id, 'DSP node id');
    if (nodes.has(node.id)) fail(`DSP node ${node.id} is duplicated.`);
    const definition = NATIVE_MODULE_CATALOG[node.type];
    if (!definition) fail(`Unsupported DSP module ${String(node.type)}.`);
    object(node.params, `DSP node ${node.id} parameters`);
    if (Object.keys(node.params).length !== Object.keys(definition.parameters).length) fail(`DSP node ${node.id} parameters do not match the allowlist.`);
    for (const [parameterId, parameter] of Object.entries(definition.parameters)) {
      const value = number(node.params[parameterId], `${node.id}.${parameterId}`, parameter.min, parameter.max);
      if (parameter.choices && !parameter.choices.includes(value)) fail(`${node.id}.${parameterId} is not an allowed choice.`);
    }
    nodes.set(node.id, node);
  }
  if (!Array.isArray(dsp.macros) || dsp.macros.length > 8) fail('DSP macros must contain 0-8 controls.');
  const targets = new Set();
  for (const macro of dsp.macros) {
    assertSafeId(macro.id, 'Macro id');
    assertDisplayName(macro.name, 'Macro name', 24);
    number(macro.value, `Macro ${macro.id} value`, 0, 1);
    if (!Array.isArray(macro.mappings) || macro.mappings.length < 1 || macro.mappings.length > 64) fail(`Macro ${macro.id} has no effective mapping.`);
    for (const mapping of macro.mappings) {
      const node = nodes.get(mapping.nodeId);
      if (!node) fail(`Macro ${macro.id} targets an inactive node.`);
      const parameter = NATIVE_MODULE_CATALOG[node.type].parameters[mapping.paramId];
      if (!parameter) fail(`Macro ${macro.id} targets an unknown parameter.`);
      const target = `${mapping.nodeId}\0${mapping.paramId}`;
      if (targets.has(target)) fail('A native parameter cannot be mapped by more than one macro.');
      targets.add(target);
      number(mapping.min, 'Mapping minimum', parameter.min, parameter.max);
      number(mapping.max, 'Mapping maximum', parameter.min, parameter.max);
      if (mapping.min > mapping.max || typeof mapping.inverted !== 'boolean') fail('Macro mapping range is invalid.');
      if (mapping.scale !== parameter.scale || mapping.faustPath !== parameter.faustPath) fail('Macro mapping metadata does not match the allowlist.');
    }
  }
  return dsp;
}

export function toolchainContract(lock) {
  return {
    platform: lock.target.platform,
    architecture: lock.target.architecture,
    deploymentTarget: lock.target.deploymentTarget,
    faust: { version: lock.faust.version, codegenFlags: lock.faust.codegenFlags },
    compiler: { dspFlags: lock.compiler.dspFlags },
    cmake: lock.cmake,
    ninja: lock.ninja,
    iPlug2Revision: lock.iPlug2.revision,
    vst3SdkRevision: lock.vst3Sdk.revision,
    parity: lock.parity,
  };
}

export async function loadToolchainLock(path = resolve(nativeRoot, 'toolchain.lock.json')) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function validateNativeBuildRequest(request, lock) {
  object(request, 'request');
  if (request.schemaVersion !== 1) fail('Unsupported native build request schema.');
  assertSafeId(request.projectId, 'Project id');
  assertSha256(request.approvalHash, 'Approval hash');
  assertSha256(request.dspHash, 'DSP hash');
  object(request.project, 'project');
  object(request.project.engine, 'project engine');
  if (request.project.id !== request.projectId || request.project.revision !== request.revision) fail('Project identity does not match the build request.');
  if (sha256Canonical(request.project) !== request.approvalHash) fail('Approval hash does not match the frozen project.');
  const dsp = validateDsp(request.dsp);
  object(dsp.engine, 'DSP engine');
  if (dsp.projectId !== request.projectId) fail('DSP project id does not match the build request.');
  object(request.toolchain, 'build request toolchain');
  object(request.toolchain.faust, 'build request Faust toolchain');
  const requestedVersions = {
    project: request.project.engine.faustCompilerVersion,
    dsp: dsp.engine.faustCompilerVersion,
    toolchain: request.toolchain.faust.version,
    supported: lock.faust.version,
  };
  if (Object.values(requestedVersions).some((version) => version !== lock.faust.version)) {
    fail(`Faust compiler version mismatch: project ${String(requestedVersions.project)}, DSP ${String(requestedVersions.dsp)}, request ${String(requestedVersions.toolchain)}, supported ${requestedVersions.supported}.`, {
      publicMessage: 'This queued build uses an outdated toolchain. Submit a fresh build.',
      diagnostics: { faustCompilerVersions: requestedVersions },
    });
  }
  const expectedToolchain = toolchainContract(lock);
  if (canonicalJson(request.toolchain) !== canonicalJson(expectedToolchain)) fail('Build request toolchain does not match the pinned native toolchain.');
  if (sha256Canonical({ dsp, toolchain: request.toolchain }) !== request.dspHash) fail('DSP hash does not match the effective native specification.');
  if (canonicalJson(request.project.engine.moduleSourceSha256) !== canonicalJson(SOURCE_FINGERPRINTS)) fail('Project source fingerprints do not match the native allowlist.');
  return request;
}
