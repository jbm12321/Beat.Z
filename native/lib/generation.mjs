import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { NATIVE_MODULE_CATALOG } from './catalog.mjs';
import { NativeBuildError } from './errors.mjs';
import { resolveWithin, safeArtifactStem } from './safety.mjs';
import { validateNativeBuildRequest } from './spec.mjs';

const execFileAsync = promisify(execFile);
const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(nativeRoot, '..');

function cppString(value) {
  return JSON.stringify(String(value));
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function versionHex(version) {
  const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10));
  return `0x${[major, minor, patch].map((part) => part.toString(16).padStart(2, '0')).join('')}00`;
}

function floatLiteral(value) {
  return `${Number.isInteger(value) ? `${value}.0` : String(value)}f`;
}

function fuidMacro(hex) {
  return hex.match(/.{8}/gu).map((part) => `0x${part}`).join(', ');
}

export function deriveNativeIdentity(projectId) {
  const hash = createHash('sha256').update(`beat-z-project:${projectId}`).digest('hex');
  return Object.freeze({
    iPlugUniqueId: `0x${hash.slice(0, 8).toUpperCase()}`,
    vst3ComponentFuid: hash.slice(0, 32).toUpperCase(),
    vst3ControllerFuid: hash.slice(32, 64).toUpperCase(),
    bundleIdentifier: `com.beatz.effects.${hash.slice(0, 24)}`,
  });
}

export function defaultExportRoot(environment = process.env) {
  const configured = environment.BEATZ_EXPORT_ROOT;
  if (configured) {
    if (!isAbsolute(configured)) throw new NativeBuildError('unsafe_path', 'BEATZ_EXPORT_ROOT must be absolute.');
    return resolve(configured);
  }
  const home = environment.HOME || homedir();
  if (!isAbsolute(home)) throw new NativeBuildError('unsafe_path', 'The home directory must be absolute.');
  return resolve(home, 'Downloads');
}

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function createNativeGenerationPlan(request, lock, options = {}) {
  validateNativeBuildRequest(request, lock);
  const repoRoot = resolve(options.repositoryRoot ?? repositoryRoot);
  const workspaceRoot = resolve(options.workspaceRoot ?? resolve(tmpdir(), 'Beat.Z-native', request.dspHash));
  const generatedRoot = resolveWithin(workspaceRoot, 'generated');
  const dspRoot = resolveWithin(generatedRoot, 'dsp');
  const activeNodes = [];
  for (const [index, node] of request.dsp.chain.entries()) {
    const catalog = NATIVE_MODULE_CATALOG[node.type];
    const sourcePath = resolveWithin(repoRoot, catalog.source);
    const sourceSha256 = await sha256File(sourcePath);
    if (sourceSha256 !== request.dsp.engine.moduleSourceSha256[node.type]) {
      throw new NativeBuildError('source_fingerprint_mismatch', `The ${node.type} Faust source does not match the approved project.`);
    }
    const className = `BeatZDsp_${String(index + 1).padStart(2, '0')}_${node.type}`;
    const outputHeader = resolveWithin(dspRoot, `${className}.hpp`);
    activeNodes.push({
      ...node,
      className,
      sourcePath,
      sourceSha256,
      outputHeader,
      command: lock.faust.nativeCommand,
      arguments: ['-lang', 'cpp', ...lock.faust.codegenFlags, '-cn', className, '-o', outputHeader, sourcePath],
    });
  }
  const identity = deriveNativeIdentity(request.projectId);
  const filename = `${safeArtifactStem(request.dsp.pluginName)}-${request.dspHash.slice(0, 8)}.vst3`;
  return {
    request,
    identity,
    plugin: { productName: request.dsp.pluginName, vendor: 'Beat.Z', version: '0.1.0' },
    activeNodes,
    macros: request.dsp.macros.map((macro, index) => ({ ...macro, index })),
    paths: {
      repositoryRoot: repoRoot,
      workspaceRoot,
      generatedRoot,
      dspRoot,
      exportRoot: resolve(options.exportRoot ?? defaultExportRoot(options.environment)),
    },
    artifact: { filename },
  };
}

function renderTemplate(source, replacements) {
  let output = source;
  for (const [key, value] of Object.entries(replacements)) output = output.replaceAll(`{{${key}}}`, String(value));
  const missing = output.match(/\{\{[A-Z0-9_]+\}\}/gu);
  if (missing) throw new NativeBuildError('template_error', `Native template has unresolved token ${missing[0]}.`);
  return output;
}

export async function materializeNativeTemplates(plan, options = {}) {
  const templateRoot = resolve(options.templateRoot ?? resolve(nativeRoot, 'templates'));
  await mkdir(plan.paths.dspRoot, { recursive: true, mode: 0o700 });
  const resourcesRoot = resolveWithin(plan.paths.generatedRoot, 'resources');
  await mkdir(resourcesRoot, { recursive: true, mode: 0o700 });
  const names = ['BeatZGeneratedConfig.h.tpl', 'BeatZGenerated.cmake.tpl', 'BeatZStaticChain.hpp.tpl', 'BeatZGeneratedPlugin.h.tpl', 'BeatZGeneratedPlugin.cpp.tpl', 'BeatZGeneratedPlugin-VST3-Info.plist.tpl'];
  const [configTemplate, cmakeTemplate, chainTemplate, headerTemplate, sourceTemplate, plistTemplate] = await Promise.all(names.map((name) => readFile(resolveWithin(templateRoot, name), 'utf8')));
  const config = renderTemplate(configTemplate, {
    PRODUCT_NAME: plan.plugin.productName.replaceAll('\\', '\\\\').replaceAll('"', '\\"'),
    VERSION_HEX: versionHex(plan.plugin.version), VERSION: plan.plugin.version,
    IPLUG_UNIQUE_ID: plan.identity.iPlugUniqueId, BUNDLE_STEM: safeArtifactStem(plan.plugin.productName),
    BUNDLE_IDENTIFIER: plan.identity.bundleIdentifier, VST3_COMPONENT_FUID: plan.identity.vst3ComponentFuid,
    VST3_CONTROLLER_FUID: plan.identity.vst3ControllerFuid, NATIVE_SPEC_HASH: plan.request.dspHash.toUpperCase(),
  });
  const generatedCmake = renderTemplate(cmakeTemplate, { VERSION: plan.plugin.version, BUNDLE_IDENTIFIER: plan.identity.bundleIdentifier });
  const nodeIndexes = new Map(plan.activeNodes.map((node, index) => [node.id, index + 1]));
  const chain = renderTemplate(chainTemplate, {
    DSP_INCLUDES: plan.activeNodes.map((node) => `#include "dsp/${node.className}.hpp"`).join('\n'),
    NODE_COUNT: plan.activeNodes.length,
    NODE_DESCRIPTORS: `{{${plan.activeNodes.map((node) => `NodeDescriptor{${cppString(node.id)}, ${cppString(node.type)}, ${cppString(node.className)}}`).join(', ')}}}`,
    DSP_MEMBERS: plan.activeNodes.map((node, index) => `  std::unique_ptr<${node.className}> node${index + 1};`).join('\n'),
    UI_MEMBERS: plan.activeNodes.map((_node, index) => `  MapUI ui${index + 1};`).join('\n'),
    DSP_INIT: plan.activeNodes.map((node, index) => `    node${index + 1} = std::make_unique<${node.className}>();\n    node${index + 1}->buildUserInterface(&ui${index + 1});\n    node${index + 1}->init(sampleRate);`).join('\n'),
    FIXED_PARAMETERS: plan.activeNodes.flatMap((node, index) => Object.entries(node.params).map(([parameterId, value]) => `    ui${index + 1}.setParamValue(${cppString(NATIVE_MODULE_CATALOG[node.type].parameters[parameterId].faustPath)}, ${floatLiteral(value)});`)).join('\n'),
    MACRO_CASES: plan.macros.map((macro) => {
      const mappings = macro.mappings.map((mapping) => {
        const nodeIndex = nodeIndexes.get(mapping.nodeId);
        const direction = mapping.inverted ? '(1.0f - normalized)' : 'normalized';
        const mapped = mapping.scale === 'log'
          ? `${floatLiteral(mapping.min)} * std::pow(${floatLiteral(mapping.max / mapping.min)}, ${direction})`
          : `${floatLiteral(mapping.min)} + (${floatLiteral(mapping.max - mapping.min)} * ${direction})`;
        return `        ui${nodeIndex}.setParamValue(${cppString(mapping.faustPath)}, ${mapped});`;
      });
      return `      case ${macro.index}: {\n${mappings.join('\n')}\n        break;\n      }`;
    }).join('\n'),
    PROCESS_NODES: plan.activeNodes.map((_node, index) => `      node${index + 1}->compute(blockFrames, readChannels, writeChannels);\n      std::swap(readChannels, writeChannels);`).join('\n'),
  });
  const pluginHeader = renderTemplate(headerTemplate, { PARAM_ENUM: plan.macros.map((macro) => `  kMacro${macro.index} = ${macro.index},`).join('\n') });
  const pluginSource = renderTemplate(sourceTemplate, {
    VST3_PROCESSOR_UID: fuidMacro(plan.identity.vst3ComponentFuid), VST3_CONTROLLER_UID: fuidMacro(plan.identity.vst3ControllerFuid),
    PARAM_INIT: plan.macros.map((macro) => `  GetParam(kMacro${macro.index})->InitDouble(${cppString(macro.name)}, ${macro.value}, 0.0, 1.0, 0.001);`).join('\n'),
    APPLY_ALL_MACROS: plan.macros.map((macro) => `  OnParamChange(kMacro${macro.index});`).join('\n'),
  });
  const plist = renderTemplate(plistTemplate, { BUNDLE_IDENTIFIER: plan.identity.bundleIdentifier, PRODUCT_NAME: xml(plan.plugin.productName), VERSION: plan.plugin.version });
  const files = {
    config: resolveWithin(plan.paths.generatedRoot, 'config.h'), cmake: resolveWithin(plan.paths.generatedRoot, 'CMakeLists.txt'),
    staticChain: resolveWithin(plan.paths.generatedRoot, 'BeatZStaticChain.hpp'), pluginHeader: resolveWithin(plan.paths.generatedRoot, 'BeatZGeneratedPlugin.h'),
    pluginSource: resolveWithin(plan.paths.generatedRoot, 'BeatZGeneratedPlugin.cpp'), manifest: resolveWithin(plan.paths.generatedRoot, 'native-manifest.json'),
    plist: resolveWithin(resourcesRoot, 'BeatZGeneratedPlugin-VST3-Info.plist'),
  };
  await Promise.all([
    writeFile(files.config, config), writeFile(files.cmake, generatedCmake), writeFile(files.staticChain, chain),
    writeFile(files.pluginHeader, pluginHeader), writeFile(files.pluginSource, pluginSource),
    writeFile(files.manifest, `${JSON.stringify({ dspHash: plan.request.dspHash, approvalHash: plan.request.approvalHash, artifact: plan.artifact }, null, 2)}\n`),
    writeFile(files.plist, plist),
  ]);
  return files;
}

async function defaultRun(command, argumentsList) {
  try {
    const result = await execFileAsync(command, argumentsList, { encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, stdout: error?.stdout ?? '', stderr: error?.stderr ?? '' };
  }
}

export async function generatePinnedFaustHeaders(plan, options = {}) {
  const run = options.run ?? defaultRun;
  for (const node of plan.activeNodes) {
    if (await sha256File(node.sourcePath) !== node.sourceSha256) throw new NativeBuildError('source_fingerprint_mismatch', `Faust source changed before generating ${node.className}.`);
    const result = await run(node.command, node.arguments);
    if (!result.ok) throw new NativeBuildError('faust_codegen_failed', `Faust failed while generating ${node.className}: ${result.stderr || result.stdout}`);
    const generated = await stat(node.outputHeader);
    if (!generated.isFile() || generated.size === 0) throw new NativeBuildError('faust_codegen_failed', `Faust did not produce ${node.className}.`);
  }
}
