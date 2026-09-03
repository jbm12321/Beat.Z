import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODULE_CATALOG,
  MODULE_TYPES,
  applyProjectCommands,
  createInitialProject,
  createNode,
  formatParameter,
  getEffectiveParameter,
  migrateLegacyProject,
  validateProject,
  type LegacyProjectV1,
  type ProjectCommand,
} from '../src/features/audio-builder/domain/project.ts';

test('a new project begins with a clean input-to-output chain', () => {
  const project = createInitialProject();
  assert.equal(project.schemaVersion, 2);
  assert.equal(project.name, 'Name your plugin');
  assert.deepEqual(project.chain, []);
  assert.deepEqual(project.nodes, {});
  assert.equal(project.engine.effectDefinition, 'audio-effect-builder-faust');
  assert.equal(project.engine.definitionVersion, '0.1.0');
});

test('module lifecycle distinguishes reordering, disconnecting, reconnecting, bypassing, and deleting', () => {
  let project = createInitialProject();
  project = applyProjectCommands(project, [
    { type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' },
    { type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' },
    { type: 'add_module', moduleType: 'saturation', nodeId: 'sat-1' },
  ], 'human');
  assert.deepEqual(project.chain, ['gain-1', 'filter-1', 'sat-1']);

  project = applyProjectCommands(project, [{ type: 'move_module', nodeId: 'sat-1', index: 0 }], 'human');
  assert.deepEqual(project.chain, ['sat-1', 'gain-1', 'filter-1']);

  project = applyProjectCommands(project, [{ type: 'set_bypass', nodeId: 'gain-1', bypassed: true }], 'human');
  assert.equal(project.nodes['gain-1'].bypassed, true);
  assert.ok(project.chain.includes('gain-1'));

  project = applyProjectCommands(project, [{ type: 'disconnect_module', nodeId: 'filter-1' }], 'human');
  assert.ok(project.nodes['filter-1']);
  assert.ok(!project.chain.includes('filter-1'));

  project = applyProjectCommands(project, [{ type: 'connect_module', nodeId: 'filter-1', index: 1 }], 'human');
  assert.deepEqual(project.chain, ['sat-1', 'filter-1', 'gain-1']);

  project = applyProjectCommands(project, [{ type: 'delete_module', nodeId: 'filter-1' }], 'human');
  assert.equal(project.nodes['filter-1'], undefined);
  assert.ok(!project.chain.includes('filter-1'));
});

test('clearing a project removes every primitive and control while preserving its identity', () => {
  let project = createInitialProject();
  project = applyProjectCommands(project, [
    { type: 'rename_project', name: 'My effect' },
    { type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' },
    { type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' },
    { type: 'create_macro', name: 'Tone', macroId: 'macro-1' },
  ], 'human');
  const { id, name, engine } = project;

  project = applyProjectCommands(project, [{ type: 'clear_project' }], 'human');

  assert.equal(project.id, id);
  assert.equal(project.name, name);
  assert.deepEqual(project.engine, engine);
  assert.deepEqual(project.chain, []);
  assert.deepEqual(project.nodes, {});
  assert.deepEqual(project.macros, []);
});

test('one macro maps across parameters with native ranges and inversion', () => {
  let project = createInitialProject();
  project = applyProjectCommands(project, [
    { type: 'add_module', moduleType: 'saturation', nodeId: 'sat-1' },
    { type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' },
    { type: 'create_macro', name: 'Warmth', macroId: 'macro-1' },
    { type: 'add_mapping', macroId: 'macro-1', mappingId: 'map-drive', nodeId: 'sat-1', paramId: 'drive', min: 2, max: 18 },
    { type: 'add_mapping', macroId: 'macro-1', mappingId: 'map-level', nodeId: 'gain-1', paramId: 'level', min: -6, max: 0, inverted: true },
  ], 'agent');
  assert.equal(getEffectiveParameter(project, 'sat-1', 'drive'), 10);
  assert.equal(getEffectiveParameter(project, 'gain-1', 'level'), -3);

  project = applyProjectCommands(project, [{ type: 'set_macro_value', macroId: 'macro-1', value: 1 }], 'human');
  assert.equal(getEffectiveParameter(project, 'sat-1', 'drive'), 18);
  assert.equal(getEffectiveParameter(project, 'gain-1', 'level'), -6);

  project = applyProjectCommands(project, [{ type: 'remove_mapping', macroId: 'macro-1', mappingId: 'map-drive' }], 'human');
  assert.equal(project.nodes['sat-1'].params.drive, 18);
});

test('mapping ownership and the eight-control limit are enforced', () => {
  let project = createInitialProject();
  const commands: ProjectCommand[] = [{ type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' }];
  for (let index = 1; index <= 8; index += 1) commands.push({ type: 'create_macro', name: `Control ${index}`, macroId: `macro-${index}` });
  commands.push({ type: 'add_mapping', macroId: 'macro-1', nodeId: 'gain-1', paramId: 'level', min: -12, max: 12 });
  project = applyProjectCommands(project, commands, 'agent');
  assert.equal(project.macros.length, 8);
  assert.throws(() => applyProjectCommands(project, [{ type: 'create_macro', name: 'Control 9' }], 'human'), /at most eight/i);
  assert.throws(() => applyProjectCommands(project, [{ type: 'add_mapping', macroId: 'macro-2', nodeId: 'gain-1', paramId: 'level', min: -6, max: 6 }], 'human'), /only one control/i);
});

test('a failed batch is atomic and leaves the source untouched', () => {
  const source = createInitialProject();
  const snapshot = JSON.stringify(source);
  assert.throws(() => applyProjectCommands(source, [
    { type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' },
    { type: 'set_parameter', nodeId: 'missing', paramId: 'level', value: 4 },
  ], 'agent'), /does not exist/i);
  assert.equal(JSON.stringify(source), snapshot);
});

test('exported project JSON validates as a portable round trip', () => {
  let project = createInitialProject();
  project = applyProjectCommands(project, [{ type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' }], 'human');
  const restored = validateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored, project);
});

test('the Faust primitive catalog exposes the fourteen exact shared contracts', () => {
  assert.deepEqual(MODULE_TYPES, ['gain', 'filter', 'saturation', 'delay', 'reverb', 'chorus', 'compressor', 'phaser', 'autowah', 'stutter', 'equalizer', 'limiter', 'flanger', 'tremolo']);
  assert.deepEqual(MODULE_CATALOG.filter.parameters.map((parameter) => parameter.id), ['mode', 'cutoff', 'resonance']);
  assert.equal(MODULE_CATALOG.filter.parameters[0].kind, 'choice');
  assert.deepEqual(MODULE_CATALOG.filter.parameters[0].choices, [
    { value: 0, label: 'High Pass' }, { value: 1, label: 'Low Pass' },
    { value: 2, label: 'Band Pass' }, { value: 3, label: 'Notch' },
  ]);
  assert.deepEqual(MODULE_CATALOG.saturation.parameters.map((parameter) => parameter.id), ['character', 'drive', 'tone', 'mix', 'output', 'bias', 'clip', 'age', 'wow']);
  assert.deepEqual(MODULE_CATALOG.saturation.parameters[0].choices?.map((choice) => choice.label), ['Soft Clip', 'Cubic', 'Fuzz', 'Tape']);
  assert.equal(MODULE_CATALOG.saturation.parameters[0].mappable, false);
  assert.deepEqual(MODULE_CATALOG.delay.parameters.map(({ id, min, max, default: defaultValue, step, scale, unit, mappable }) => ({ id, min, max, default: defaultValue, step, scale, unit, mappable })), [
    { id: 'mode', min: 0, max: 2, default: 0, step: 1, scale: 'linear', unit: 'mode', mappable: false },
    { id: 'time', min: 20, max: 2000, default: 250, step: 1, scale: 'log', unit: 'ms', mappable: true },
    { id: 'feedback', min: 0, max: 90, default: 30, step: 1, scale: 'linear', unit: '%', mappable: true },
    { id: 'tone', min: 500, max: 16000, default: 8000, step: 1, scale: 'log', unit: 'Hz', mappable: true },
    { id: 'mix', min: 0, max: 100, default: 25, step: 1, scale: 'linear', unit: '%', mappable: true },
    { id: 'output', min: -24, max: 12, default: 0, step: 0.1, scale: 'linear', unit: 'dB', mappable: true },
  ]);
  assert.deepEqual(MODULE_CATALOG.delay.parameters[0].choices, [
    { value: 0, label: 'Digital' }, { value: 1, label: 'Ping-Pong' }, { value: 2, label: 'Tape' },
  ]);
  assert.deepEqual(MODULE_CATALOG.reverb.parameters.map(({ id, min, max, default: defaultValue, step, scale, unit, mappable }) => ({ id, min, max, default: defaultValue, step, scale, unit, mappable })), [
    { id: 'mode', min: 0, max: 2, default: 0, step: 1, scale: 'linear', unit: 'mode', mappable: false },
    { id: 'preDelay', min: 0, max: 200, default: 20, step: 1, scale: 'linear', unit: 'ms', mappable: true },
    { id: 'decay', min: 0.2, max: 12, default: 2, step: 0.1, scale: 'log', unit: 's', mappable: true },
    { id: 'size', min: 0, max: 100, default: 50, step: 1, scale: 'linear', unit: '%', mappable: true },
    { id: 'damping', min: 0, max: 100, default: 35, step: 1, scale: 'linear', unit: '%', mappable: true },
    { id: 'mix', min: 0, max: 100, default: 20, step: 1, scale: 'linear', unit: '%', mappable: true },
    { id: 'output', min: -24, max: 12, default: 0, step: 0.1, scale: 'linear', unit: 'dB', mappable: true },
  ]);
  assert.deepEqual(MODULE_CATALOG.reverb.parameters[0].choices, [
    { value: 0, label: 'Room' }, { value: 1, label: 'Hall' }, { value: 2, label: 'Plate' },
  ]);
  assert.deepEqual(MODULE_CATALOG.chorus.parameters.map((parameter) => parameter.id), ['mode', 'rate', 'depth', 'delay', 'mix', 'output']);
  assert.deepEqual(MODULE_CATALOG.chorus.parameters[0].choices, [
    { value: 0, label: 'Classic' }, { value: 1, label: 'Wide' }, { value: 2, label: 'Ensemble' },
  ]);
  assert.equal(MODULE_CATALOG.chorus.parameters[0].mappable, false);
  assert.deepEqual(MODULE_CATALOG.compressor.parameters.map((parameter) => parameter.id), ['mode', 'threshold', 'ratio', 'attack', 'release', 'makeup', 'mix']);
  assert.deepEqual(MODULE_CATALOG.compressor.parameters[0].choices, [
    { value: 0, label: 'Clean' }, { value: 1, label: 'Punch' }, { value: 2, label: 'Glue' },
  ]);
  assert.equal(MODULE_CATALOG.compressor.parameters[0].mappable, false);
  assert.equal(MODULE_CATALOG.compressor.parameters.find((parameter) => parameter.id === 'ratio')?.unit, 'ratio');
  assert.deepEqual(MODULE_CATALOG.phaser.parameters.map((parameter) => parameter.id), ['mode', 'rate', 'depth', 'center', 'feedback', 'mix', 'output']);
  assert.deepEqual(MODULE_CATALOG.phaser.parameters[0].choices, [
    { value: 0, label: 'Classic' }, { value: 1, label: 'Wide' }, { value: 2, label: 'Deep' },
  ]);
  assert.equal(MODULE_CATALOG.phaser.parameters[0].mappable, false);
  assert.deepEqual(MODULE_CATALOG.autowah.parameters.map((parameter) => parameter.id), ['mode', 'sensitivity', 'attack', 'release', 'frequency', 'range', 'resonance', 'mix', 'output']);
  assert.deepEqual(MODULE_CATALOG.autowah.parameters[0].choices, [
    { value: 0, label: 'Low Pass Up' }, { value: 1, label: 'Low Pass Down' },
    { value: 2, label: 'High Pass Up' }, { value: 3, label: 'High Pass Down' },
  ]);
  assert.equal(MODULE_CATALOG.autowah.parameters[0].mappable, false);
  assert.deepEqual(MODULE_CATALOG.stutter.parameters.map((parameter) => parameter.id), ['mode', 'rate', 'repeats', 'gate', 'mix', 'output']);
  assert.deepEqual(MODULE_CATALOG.stutter.parameters[0].choices, [
    { value: 0, label: 'Repeat' }, { value: 1, label: 'Gate' }, { value: 2, label: 'Reverse' }, { value: 3, label: 'Ping-Pong' },
  ]);
  assert.deepEqual(MODULE_CATALOG.stutter.parameters[2].choices?.map((choice) => choice.label), ['1x', '2x', '3x', '4x', '6x', '8x']);
  assert.equal(MODULE_CATALOG.stutter.parameters[0].mappable, false);
  assert.equal(MODULE_CATALOG.stutter.parameters[2].mappable, false);
  assert.equal(MODULE_CATALOG.equalizer.name, '3-Band EQ');
  assert.equal(MODULE_CATALOG.equalizer.shortName, 'EQ3');
  assert.deepEqual(MODULE_CATALOG.equalizer.parameters.map((parameter) => parameter.id), ['lowGain', 'lowFrequency', 'midGain', 'midFrequency', 'midQ', 'highGain', 'highFrequency', 'output']);
  assert.ok(MODULE_CATALOG.equalizer.parameters.every((parameter) => parameter.kind === 'continuous' && parameter.mappable));
  assert.deepEqual(MODULE_CATALOG.limiter.parameters.map((parameter) => parameter.id), ['mode', 'input', 'ceiling', 'lookahead', 'release', 'softness']);
  assert.deepEqual(MODULE_CATALOG.limiter.parameters[0].choices, [
    { value: 0, label: 'Transparent' }, { value: 1, label: 'Punch' }, { value: 2, label: 'Brickwall' }, { value: 3, label: 'Soft Clip' },
  ]);
  assert.equal(MODULE_CATALOG.limiter.parameters[0].mappable, false);
  assert.deepEqual(MODULE_CATALOG.flanger.parameters.map((parameter) => parameter.id), ['mode', 'rate', 'depth', 'delay', 'feedback', 'stereo', 'mix', 'output']);
  assert.deepEqual(MODULE_CATALOG.flanger.parameters[0].choices, [
    { value: 0, label: 'Classic' }, { value: 1, label: 'Stereo' }, { value: 2, label: 'Jet' }, { value: 3, label: 'Through-Zero' },
  ]);
  assert.equal(MODULE_CATALOG.flanger.parameters[0].mappable, false);
  assert.equal(MODULE_CATALOG.tremolo.name, 'Tremolo');
  assert.equal(MODULE_CATALOG.tremolo.shortName, 'TREM');
  assert.deepEqual(MODULE_CATALOG.tremolo.parameters.map((parameter) => parameter.id), ['mode', 'rate', 'depth', 'shape', 'stereo', 'mix', 'output']);
  assert.deepEqual(MODULE_CATALOG.tremolo.parameters[0].choices, [
    { value: 0, label: 'Tremolo' }, { value: 1, label: 'Auto-Pan' }, { value: 2, label: 'Stereo Tremolo' }, { value: 3, label: 'Pulse/Chop' },
  ]);
  assert.equal(MODULE_CATALOG.tremolo.parameters[0].mappable, false);
  assert.ok(MODULE_CATALOG.tremolo.parameters.slice(1).every((parameter) => parameter.kind === 'continuous' && parameter.mappable));
  MODULE_TYPES.forEach((type) => {
    const definition = MODULE_CATALOG[type];
    assert.ok(definition.parameters.length > 0);
    definition.parameters.forEach((parameter) => {
      assert.ok(Number.isFinite(parameter.min));
      assert.ok(Number.isFinite(parameter.max));
      assert.ok(parameter.min < parameter.max);
      assert.ok(parameter.default >= parameter.min && parameter.default <= parameter.max);
    });
  });
});

test('new discrete modes cannot be mapped while continuous expansion controls remain mappable', () => {
  let project = applyProjectCommands(createInitialProject(), [
    { type: 'add_module', moduleType: 'limiter', nodeId: 'limiter-1' },
    { type: 'add_module', moduleType: 'flanger', nodeId: 'flanger-1' },
    { type: 'add_module', moduleType: 'tremolo', nodeId: 'tremolo-1' },
    { type: 'create_macro', name: 'Motion', macroId: 'macro-1' },
  ], 'human');
  assert.throws(() => applyProjectCommands(project, [{ type: 'add_mapping', macroId: 'macro-1', nodeId: 'limiter-1', paramId: 'mode', min: 0, max: 3 }], 'human'), /cannot be assigned/i);
  assert.throws(() => applyProjectCommands(project, [{ type: 'add_mapping', macroId: 'macro-1', nodeId: 'flanger-1', paramId: 'mode', min: 0, max: 3 }], 'human'), /cannot be assigned/i);
  assert.throws(() => applyProjectCommands(project, [{ type: 'add_mapping', macroId: 'macro-1', nodeId: 'tremolo-1', paramId: 'mode', min: 0, max: 3 }], 'human'), /cannot be assigned/i);
  project = applyProjectCommands(project, [
    { type: 'add_mapping', macroId: 'macro-1', nodeId: 'flanger-1', paramId: 'depth', min: 10, max: 90 },
    { type: 'add_mapping', macroId: 'macro-1', nodeId: 'tremolo-1', paramId: 'rate', min: 0.1, max: 12 },
  ], 'human');
  assert.deepEqual(project.macros[0].mappings.map((mapping) => mapping.paramId), ['depth', 'rate']);
});

test('Delay and Reverb time units use the domain formatter without UI special cases', () => {
  assert.equal(formatParameter(MODULE_CATALOG.delay.parameters[1], 340), '340 ms');
  assert.equal(formatParameter(MODULE_CATALOG.reverb.parameters[2], 3.8), '3.8 s');
});

test('Compressor ratios use a native-style ratio label without changing existing unit formatting', () => {
  assert.equal(formatParameter(MODULE_CATALOG.compressor.parameters[2], 4), '4.0:1');
  assert.equal(formatParameter(MODULE_CATALOG.chorus.parameters[1], 0.8), '0.80 Hz');
});

test('new saturation nodes default to Soft Clip while exposing additive character parameters', () => {
  const saturation = createNode('saturation', 'sat-v2');
  assert.deepEqual(saturation.params, {
    character: 0, drive: 6, tone: 8000, mix: 50, output: 0, bias: 0, clip: 0.5, age: 0, wow: 0,
  });
});

test('a stale agent revision cannot overwrite newer human work', () => {
  const source = createInitialProject();
  const current = applyProjectCommands(source, [{ type: 'rename_project', name: 'Current' }], 'human');
  assert.throws(
    () => applyProjectCommands(current, [{ type: 'add_module', moduleType: 'gain' }], 'agent', source.revision),
    /stale.*revision|revision.*current/i,
  );
  assert.equal(current.name, 'Current');
  assert.deepEqual(current.chain, []);
});

test('invalid parameter and macro ranges are rejected without clamping or source mutation', () => {
  let project = createInitialProject();
  project = applyProjectCommands(project, [
    { type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' },
    { type: 'create_macro', name: 'Level', macroId: 'macro-1' },
  ], 'human');
  const snapshot = JSON.stringify(project);
  assert.throws(() => applyProjectCommands(project, [{ type: 'set_parameter', nodeId: 'gain-1', paramId: 'level', value: 25 }], 'human'), /between -24 and 24/i);
  assert.throws(() => applyProjectCommands(project, [{ type: 'add_mapping', macroId: 'macro-1', nodeId: 'gain-1', paramId: 'level', min: -30, max: 12 }], 'human'), /between -24 and 24/i);
  assert.equal(JSON.stringify(project), snapshot);
});

test('legacy high-pass and low-pass nodes migrate to the unified Filter while unsupported modules remain recoverable', () => {
  const legacy: LegacyProjectV1 = {
    schemaVersion: 1,
    id: 'legacy-project',
    name: 'Legacy warmth',
    revision: 7,
    chain: ['hpf-1', 'delay-1', 'lpf-1'],
    nodes: {
      'hpf-1': { id: 'hpf-1', type: 'high_pass', params: { cutoff: 90, resonance: 1.2 }, bypassed: false },
      'delay-1': { id: 'delay-1', type: 'delay', params: { time: 250, feedback: 20, tone: 5000, mix: 25 }, bypassed: false },
      'lpf-1': { id: 'lpf-1', type: 'low_pass', params: { cutoff: 8000, resonance: 0.8 }, bypassed: true },
    },
    macros: [],
    activity: [],
  };
  const migrated = migrateLegacyProject(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.chain, ['hpf-1', 'lpf-1']);
  assert.equal(migrated.nodes['hpf-1'].type, 'filter');
  assert.equal(migrated.nodes['hpf-1'].params.mode, 0);
  assert.equal(migrated.nodes['lpf-1'].params.mode, 1);
  assert.equal(migrated.nodes['lpf-1'].bypassed, true);
  assert.deepEqual(migrated.migration?.unsupportedModuleTypes, ['delay']);
  assert.deepEqual(migrated.migration?.legacyBackup, legacy);
});
