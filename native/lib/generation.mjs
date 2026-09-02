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
export const NATIVE_EDITOR_MAX_KNOBS_PER_ROW = 6;

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

function effectiveParameterValue(request, node, parameterId, definition) {
  const owner = request.dsp.macros
    .flatMap((macro) => macro.mappings.map((mapping) => ({ macro, mapping })))
    .find(({ mapping }) => mapping.nodeId === node.id && mapping.paramId === parameterId);
  if (!owner) return node.params[parameterId];
  const normalized = owner.mapping.inverted ? 1 - owner.macro.value : owner.macro.value;
  if (definition.scale === 'log') return definition.min * ((definition.max / definition.min) ** normalized);
  return definition.min + ((definition.max - definition.min) * normalized);
}

export function createAutomaticNativeParameters(request) {
  const moduleCounts = new Map();
  const parameters = [];
  request.dsp.chain.forEach((node, nodeIndex) => {
    const moduleDisplayIndex = (moduleCounts.get(node.type) ?? 0) + 1;
    moduleCounts.set(node.type, moduleDisplayIndex);
    const moduleName = `${node.type[0].toUpperCase()}${node.type.slice(1)}`;
    const moduleLabel = `${moduleName} ${moduleDisplayIndex}`;
    Object.entries(NATIVE_MODULE_CATALOG[node.type].parameters).forEach(([parameterId, definition]) => {
      parameters.push({
        index: parameters.length,
        nodeIndex: nodeIndex + 1,
        nodeId: node.id,
        moduleType: node.type,
        moduleDisplayIndex,
        moduleLabel,
        parameterId,
        definition,
        controlType: definition.choices ? 'switch' : 'knob',
        controlLabel: definition.name,
        label: `${moduleLabel} ${definition.name}`,
        value: effectiveParameterValue(request, node, parameterId, definition),
      });
    });
  });
  return parameters;
}

export function createNativeEditorModel(parameters) {
  const modules = [];
  for (const parameter of parameters) {
    let moduleModel = modules.at(-1);
    if (!moduleModel || moduleModel.nodeId !== parameter.nodeId) {
      moduleModel = {
        nodeId: parameter.nodeId,
        moduleType: parameter.moduleType,
        moduleDisplayIndex: parameter.moduleDisplayIndex,
        label: parameter.moduleLabel,
        controls: [],
      };
      modules.push(moduleModel);
    }
    moduleModel.controls.push({
      parameterIndex: parameter.index,
      parameterId: parameter.parameterId,
      label: parameter.controlLabel,
      hostLabel: parameter.label,
      type: parameter.controlType,
      choices: parameter.definition.choiceLabels ?? [],
      unit: parameter.definition.unit,
      min: parameter.definition.min,
      max: parameter.definition.max,
      step: parameter.definition.step,
      scale: parameter.definition.scale,
    });
  }

  const moduleViews = modules.flatMap((moduleModel) => {
    const knobs = moduleModel.controls.filter((control) => control.type === 'knob');
    const switches = moduleModel.controls.filter((control) => control.type === 'switch');
    const knobChunks = knobs.length === 0
      ? [[]]
      : Array.from({ length: Math.ceil(knobs.length / NATIVE_EDITOR_MAX_KNOBS_PER_ROW) }, (_, index) => knobs.slice(index * NATIVE_EDITOR_MAX_KNOBS_PER_ROW, (index + 1) * NATIVE_EDITOR_MAX_KNOBS_PER_ROW));
    return knobChunks.map((knobControls, index) => ({
      ...moduleModel,
      label: knobChunks.length === 1 ? moduleModel.label : `${moduleModel.label} ${index + 1}/${knobChunks.length}`,
      controls: [...(index === 0 ? switches : []), ...knobControls],
      knobCount: knobControls.length,
      unitCount: Math.max(1, knobControls.length),
    }));
  });

  const rows = [];
  for (const moduleView of moduleViews) {
    let row = rows.at(-1);
    if (!row || row.usedUnits + moduleView.unitCount > NATIVE_EDITOR_MAX_KNOBS_PER_ROW) {
      row = { index: rows.length, knobCount: 0, usedUnits: 0, modules: [] };
      rows.push(row);
    }
    const controls = moduleView.controls.map((control, localIndex, controls) => {
      if (control.type !== 'knob') return { ...control, slot: null };
      const previousKnobs = controls.slice(0, localIndex).filter((candidate) => candidate.type === 'knob').length;
      return { ...control, slot: row.usedUnits + previousKnobs };
    });
    row.modules.push({ ...moduleView, controls, unitStart: row.usedUnits });
    row.knobCount += moduleView.knobCount;
    row.usedUnits += moduleView.unitCount;
  }

  if (rows.length === 0) rows.push({ index: 0, knobCount: 0, usedUnits: 0, modules: [] });
  const knobCount = parameters.filter((parameter) => parameter.controlType === 'knob').length;
  const switchCount = parameters.length - knobCount;
  return {
    maxKnobsPerRow: NATIVE_EDITOR_MAX_KNOBS_PER_ROW,
    moduleCount: modules.length,
    knobCount,
    switchCount,
    rowCount: rows.length,
    height: Math.max(520, 200 + (rows.length * 320)),
    rows: rows.map((row) => ({
      ...row,
      layoutUnits: Math.max(3, row.usedUnits),
      offsetUnits: Math.max(0, (Math.max(3, row.usedUnits) - row.usedUnits) / 2),
    })),
  };
}

function nativeParameterInit(parameter) {
  const { definition } = parameter;
  if (definition.choices) {
    return `  GetParam(kParam${parameter.index})->InitEnum(${cppString(parameter.label)}, ${Math.round(parameter.value)}, {${definition.choiceLabels.map(cppString).join(', ')}}, 0, ${cppString(parameter.moduleLabel)});`;
  }
  const shape = definition.scale === 'log' ? 'iplug::IParam::ShapeExp()' : 'iplug::IParam::ShapeLinear()';
  return `  GetParam(kParam${parameter.index})->InitDouble(${cppString(parameter.label)}, ${floatLiteral(parameter.value)}, ${floatLiteral(definition.min)}, ${floatLiteral(definition.max)}, ${floatLiteral(definition.step)}, ${cppString(definition.unit)}, 0, ${cppString(parameter.moduleLabel)}, ${shape});`;
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
  const parameters = createAutomaticNativeParameters(request);
  const editor = createNativeEditorModel(parameters);
  return {
    request,
    identity,
    plugin: { productName: request.dsp.pluginName, vendor: 'Beat.Z', version: '0.1.0' },
    activeNodes,
    parameters,
    editor,
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

function renderNativeEditorControls(editor) {
  const lines = [];
  for (const row of editor.rows) {
    lines.push(`    const IRECT editorRow_${row.index} = controlDeck.SubRectVertical(${editor.rowCount}, ${row.index}).GetPadded(-2.f, -6.f, -2.f, -6.f);`);
    row.modules.forEach((moduleModel, moduleIndex) => {
      const suffix = `${row.index}_${moduleIndex}`;
      const start = moduleModel.unitStart + row.offsetUnits;
      const end = start + moduleModel.unitCount;
      lines.push(
        `    const IRECT moduleBounds_${suffix}(editorRow_${row.index}.L + editorRow_${row.index}.W() * ${floatLiteral(start)} / ${floatLiteral(row.layoutUnits)}, editorRow_${row.index}.T, editorRow_${row.index}.L + editorRow_${row.index}.W() * ${floatLiteral(end)} / ${floatLiteral(row.layoutUnits)}, editorRow_${row.index}.B);`,
        `    pGraphics->AttachControl(new IVGroupControl(moduleBounds_${suffix}.GetPadded(-6.f), ${cppString(moduleModel.label.toUpperCase())}, 12.f, moduleStyle));`,
        `    const IRECT moduleBody_${suffix} = moduleBounds_${suffix}.GetPadded(-18.f).GetReducedFromTop(28.f);`,
      );

      const switches = moduleModel.controls.filter((control) => control.type === 'switch');
      if (switches.length > 0) {
        lines.push(`    const IRECT switchRow_${suffix} = moduleBody_${suffix}.GetFromTop(66.f);`);
        switches.forEach((control, switchIndex) => {
          lines.push(`    pGraphics->AttachControl(new IVTabSwitchControl(switchRow_${suffix}.SubRectHorizontal(${switches.length}, ${switchIndex}).GetPadded(-4.f), kParam${control.parameterIndex}, {${control.choices.map(cppString).join(', ')}}, ${cppString(control.label)}, switchStyle, EVShape::EndsRounded, EDirection::Horizontal));`);
        });
      }

      const knobs = moduleModel.controls.filter((control) => control.type === 'knob');
      if (knobs.length > 0) {
        lines.push(`    const IRECT knobRow_${suffix} = moduleBody_${suffix}.GetReducedFromTop(${switches.length > 0 ? '70.f' : '10.f'});`);
        knobs.forEach((control, knobIndex) => {
          lines.push(`    pGraphics->AttachControl(new IVKnobControl(knobRow_${suffix}.SubRectHorizontal(${knobs.length}, ${knobIndex}).GetCentredInside(126.f), kParam${control.parameterIndex}, ${cppString(control.label)}, knobStyle, true));`);
        });
      }
    });
  }
  return lines.join('\n');
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
    EDITOR_HEIGHT: plan.editor.height,
    IPLUG_UNIQUE_ID: plan.identity.iPlugUniqueId, BUNDLE_STEM: safeArtifactStem(plan.plugin.productName),
    BUNDLE_IDENTIFIER: plan.identity.bundleIdentifier, VST3_COMPONENT_FUID: plan.identity.vst3ComponentFuid,
    VST3_CONTROLLER_FUID: plan.identity.vst3ControllerFuid, NATIVE_SPEC_HASH: plan.request.dspHash.toUpperCase(),
  });
  const generatedCmake = renderTemplate(cmakeTemplate, {
    VERSION: plan.plugin.version,
    BUNDLE_IDENTIFIER: plan.identity.bundleIdentifier,
    NATIVE_DSP_COMPILE_FLAGS: plan.request.toolchain.compiler.dspFlags.join(' '),
  });
  const chain = renderTemplate(chainTemplate, {
    DSP_INCLUDES: plan.activeNodes.map((node) => `#include "dsp/${node.className}.hpp"`).join('\n'),
    NODE_COUNT: plan.activeNodes.length,
    NODE_DESCRIPTORS: `{{${plan.activeNodes.map((node) => `NodeDescriptor{${cppString(node.id)}, ${cppString(node.type)}, ${cppString(node.className)}}`).join(', ')}}}`,
    DSP_MEMBERS: plan.activeNodes.map((node, index) => `  std::unique_ptr<${node.className}> node${index + 1};`).join('\n'),
    UI_MEMBERS: plan.activeNodes.map((_node, index) => `  MapUI ui${index + 1};`).join('\n'),
    DSP_INIT: plan.activeNodes.map((node, index) => `    node${index + 1} = std::make_unique<${node.className}>();\n    node${index + 1}->buildUserInterface(&ui${index + 1});\n    node${index + 1}->init(sampleRate);`).join('\n'),
    FIXED_PARAMETERS: plan.parameters.map((parameter) => `    ui${parameter.nodeIndex}.setParamValue(${cppString(parameter.definition.faustPath)}, ${floatLiteral(parameter.value)});`).join('\n'),
    PARAMETER_CASES: plan.parameters.map((parameter) => `      case ${parameter.index}: ui${parameter.nodeIndex}.setParamValue(${cppString(parameter.definition.faustPath)}, value); break;`).join('\n'),
    PROCESS_NODES: plan.activeNodes.map((_node, index) => `      node${index + 1}->compute(blockFrames, readChannels, writeChannels);\n      std::swap(readChannels, writeChannels);`).join('\n'),
  });
  const pluginHeader = renderTemplate(headerTemplate, { PARAM_ENUM: plan.parameters.map((parameter) => `  kParam${parameter.index} = ${parameter.index},`).join('\n') });
  const pluginSource = renderTemplate(sourceTemplate, {
    VST3_PROCESSOR_UID: fuidMacro(plan.identity.vst3ComponentFuid), VST3_CONTROLLER_UID: fuidMacro(plan.identity.vst3ControllerFuid),
    PARAM_INIT: plan.parameters.map(nativeParameterInit).join('\n'),
    APPLY_ALL_PARAMETERS: plan.parameters.map((parameter) => `  OnParamChange(kParam${parameter.index});`).join('\n'),
    EDITOR_CONTROLS: renderNativeEditorControls(plan.editor),
    EDITOR_SUMMARY: `${plan.editor.moduleCount} MODULE${plan.editor.moduleCount === 1 ? '' : 'S'}  /  ${plan.editor.knobCount} KNOB${plan.editor.knobCount === 1 ? '' : 'S'}  /  ${plan.editor.switchCount} SWITCH${plan.editor.switchCount === 1 ? '' : 'ES'}`,
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
    writeFile(files.manifest, `${JSON.stringify({ dspHash: plan.request.dspHash, approvalHash: plan.request.approvalHash, artifact: plan.artifact, editor: plan.editor }, null, 2)}\n`),
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
