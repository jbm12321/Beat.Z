import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODULE_CATALOG,
  MODULE_TYPES,
  applyProjectCommands,
  createInitialProject,
  getEffectiveParameter,
  validateProject,
  type ProjectCommand,
} from '../src/features/audio-builder/domain/project.ts';

test('a new project begins with a clean input-to-output chain', () => {
  const project = createInitialProject();
  assert.equal(project.schemaVersion, 1);
  assert.equal(project.name, 'Untitled');
  assert.deepEqual(project.chain, []);
  assert.deepEqual(project.nodes, {});
});

test('module lifecycle distinguishes reordering, disconnecting, reconnecting, bypassing, and deleting', () => {
  let project = createInitialProject();
  project = applyProjectCommands(project, [
    { type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' },
    { type: 'add_module', moduleType: 'delay', nodeId: 'delay-1' },
    { type: 'add_module', moduleType: 'reverb', nodeId: 'verb-1' },
  ], 'human');
  assert.deepEqual(project.chain, ['gain-1', 'delay-1', 'verb-1']);

  project = applyProjectCommands(project, [{ type: 'move_module', nodeId: 'verb-1', index: 0 }], 'human');
  assert.deepEqual(project.chain, ['verb-1', 'gain-1', 'delay-1']);

  project = applyProjectCommands(project, [{ type: 'set_bypass', nodeId: 'gain-1', bypassed: true }], 'human');
  assert.equal(project.nodes['gain-1'].bypassed, true);
  assert.ok(project.chain.includes('gain-1'));

  project = applyProjectCommands(project, [{ type: 'disconnect_module', nodeId: 'delay-1' }], 'human');
  assert.ok(project.nodes['delay-1']);
  assert.ok(!project.chain.includes('delay-1'));

  project = applyProjectCommands(project, [{ type: 'connect_module', nodeId: 'delay-1', index: 1 }], 'human');
  assert.deepEqual(project.chain, ['verb-1', 'delay-1', 'gain-1']);

  project = applyProjectCommands(project, [{ type: 'delete_module', nodeId: 'delay-1' }], 'human');
  assert.equal(project.nodes['delay-1'], undefined);
  assert.ok(!project.chain.includes('delay-1'));
});

test('one macro maps across parameters with native ranges and inversion', () => {
  let project = createInitialProject();
  project = applyProjectCommands(project, [
    { type: 'add_module', moduleType: 'saturation', nodeId: 'sat-1' },
    { type: 'add_module', moduleType: 'compressor', nodeId: 'comp-1' },
    { type: 'create_macro', name: 'Warmth', macroId: 'macro-1' },
    { type: 'add_mapping', macroId: 'macro-1', mappingId: 'map-drive', nodeId: 'sat-1', paramId: 'drive', min: 2, max: 18 },
    { type: 'add_mapping', macroId: 'macro-1', mappingId: 'map-threshold', nodeId: 'comp-1', paramId: 'threshold', min: -36, max: -8, inverted: true },
  ], 'agent');
  assert.equal(getEffectiveParameter(project, 'sat-1', 'drive'), 10);
  assert.equal(getEffectiveParameter(project, 'comp-1', 'threshold'), -22);

  project = applyProjectCommands(project, [{ type: 'set_macro_value', macroId: 'macro-1', value: 1 }], 'human');
  assert.equal(getEffectiveParameter(project, 'sat-1', 'drive'), 18);
  assert.equal(getEffectiveParameter(project, 'comp-1', 'threshold'), -36);

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
  assert.throws(() => applyProjectCommands(project, [{ type: 'add_mapping', macroId: 'macro-2', nodeId: 'gain-1', paramId: 'level', min: -6, max: 6 }], 'human'), /only one macro/i);
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
  project = applyProjectCommands(project, [{ type: 'add_module', moduleType: 'high_pass', nodeId: 'hpf-1' }], 'human');
  const restored = validateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored, project);
});

test('the catalog defines complete bounded parameters for every requested module', () => {
  assert.equal(MODULE_TYPES.length, 10);
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
