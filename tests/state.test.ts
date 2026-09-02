import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAST_VALID_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  PRE_AUDIBILITY_ENGINE_PROVENANCE,
  PRE_CHORUS_COMPRESSOR_ENGINE_PROVENANCE,
  PRE_PHASER_COMPRESSOR_MODES_ENGINE_PROVENANCE,
  STORAGE_KEY,
  PRE_PAIR1_ENGINE_PROVENANCE,
  applyProjectCommands,
  createInitialProject,
  type LegacyProjectV1,
} from '../src/features/audio-builder/domain/project.ts';
import { historyReducer, type HistoryState } from '../src/features/audio-builder/state/history.ts';
import { restorePersistedProject, savePersistedProject } from '../src/features/audio-builder/state/persistence.ts';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

test('a first-time visitor opens a fresh unnamed project', () => {
  const result = restorePersistedProject(new MemoryStorage());
  assert.equal(result.source, 'new');
  assert.equal(result.project.name, 'Name your plugin');
  assert.deepEqual(result.project.chain, []);
  assert.deepEqual(result.project.nodes, {});
  assert.deepEqual(result.project.macros, []);
});

test('persistence restores the last valid project when current storage is corrupt', () => {
  const storage = new MemoryStorage();
  const project = applyProjectCommands(createInitialProject(), [{ type: 'rename_project', name: 'Safe copy' }], 'human');
  savePersistedProject(storage, project);
  storage.setItem(STORAGE_KEY, '{broken');
  const result = restorePersistedProject(storage);
  assert.equal(result.project.name, 'Safe copy');
  assert.equal(result.source, 'last-valid');
  assert.match(result.warning ?? '', /last valid/i);
  assert.equal(storage.getItem(LAST_VALID_STORAGE_KEY), JSON.stringify(project));
});

test('persistence migrates legacy projects without deleting their original backup', () => {
  const storage = new MemoryStorage();
  const legacy: LegacyProjectV1 = {
    schemaVersion: 1,
    id: 'legacy',
    name: 'Old filter',
    revision: 2,
    chain: ['hpf'],
    nodes: { hpf: { id: 'hpf', type: 'high_pass', params: { cutoff: 120, resonance: 0.8 }, bypassed: false } },
    macros: [],
    activity: [],
  };
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
  const result = restorePersistedProject(storage);
  assert.equal(result.source, 'legacy-migration');
  assert.equal(result.project.nodes.hpf.type, 'filter');
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), JSON.stringify(legacy));
});

test('persistence upgrades current Saturation saves to Soft Clip without altering their existing settings', () => {
  const storage = new MemoryStorage();
  const project = applyProjectCommands(createInitialProject(), [{ type: 'add_module', moduleType: 'saturation', nodeId: 'sat-1' }], 'human');
  const old = structuredClone(project);
  old.nodes['sat-1'].params = { drive: 18, tone: 4000, mix: 65 };
  old.engine = {
    ...structuredClone(PRE_PAIR1_ENGINE_PROVENANCE),
    moduleSourceSha256: {
      ...PRE_PAIR1_ENGINE_PROVENANCE.moduleSourceSha256,
      saturation: '238cd373e164ba480c6367ae7ef1c071205346361c7f597d6c1dc3878af0a75b',
    },
  } as typeof old.engine;
  storage.setItem(STORAGE_KEY, JSON.stringify(old));
  const restored = restorePersistedProject(storage);
  assert.equal(restored.source, 'current');
  assert.deepEqual(restored.project.nodes['sat-1'].params, {
    character: 0, drive: 18, tone: 4000, mix: 65, output: 0, bias: 0, clip: 0.5, age: 0, wow: 0,
  });
});

test('persistence moves exact Faust 2.86.2 projects to the canonical 2.85.9 compiler without changing project content', () => {
  const storage = new MemoryStorage();
  const project = applyProjectCommands(createInitialProject(), [{ type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' }], 'human');
  const previous = structuredClone(project);
  previous.engine = {
    ...structuredClone(PRE_PAIR1_ENGINE_PROVENANCE),
    faustCompilerVersion: '2.86.2',
    libraries: { ...PRE_PAIR1_ENGINE_PROVENANCE.libraries, basics: '1.23.0' },
  } as unknown as typeof previous.engine;
  storage.setItem(STORAGE_KEY, JSON.stringify(previous));

  const restored = restorePersistedProject(storage);

  assert.equal(restored.source, 'current');
  assert.equal(restored.project.engine.faustCompilerVersion, '2.85.9');
  assert.deepEqual(restored.project.chain, project.chain);
  assert.deepEqual(restored.project.nodes, project.nodes);
  assert.deepEqual(restored.project.macros, project.macros);
  assert.equal(restored.project.revision, project.revision);
});

test('persistence migrates only the exact pre-Pair-1 engine without content loss', () => {
  const storage = new MemoryStorage();
  const project = applyProjectCommands(createInitialProject(), [
    { type: 'rename_project', name: 'Preserved Pair 1 migration' },
    { type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' },
    { type: 'set_parameter', nodeId: 'filter-1', paramId: 'mode', value: 1 },
    { type: 'create_macro', name: 'Cut', macroId: 'macro-1' },
    { type: 'add_mapping', macroId: 'macro-1', mappingId: 'mapping-1', nodeId: 'filter-1', paramId: 'cutoff', min: 100, max: 8000 },
  ], 'human');
  const previous = structuredClone(project);
  previous.engine = structuredClone(PRE_PAIR1_ENGINE_PROVENANCE) as typeof previous.engine;
  storage.setItem(STORAGE_KEY, JSON.stringify(previous));

  const restored = restorePersistedProject(storage).project;
  assert.deepEqual({ ...restored, engine: undefined }, { ...previous, engine: undefined });
  assert.equal(restored.nodes['filter-1'].params.mode, 1);
});

test('persistence upgrades the exact first Pair 1 DSP engine without changing project content', () => {
  const storage = new MemoryStorage();
  const project = applyProjectCommands(createInitialProject(), [
    { type: 'rename_project', name: 'Audibility upgrade' },
    { type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' },
    { type: 'set_parameter', nodeId: 'filter-1', paramId: 'mode', value: 3 },
    { type: 'add_module', moduleType: 'saturation', nodeId: 'saturation-1' },
    { type: 'set_parameter', nodeId: 'saturation-1', paramId: 'wow', value: 75 },
    { type: 'add_module', moduleType: 'delay', nodeId: 'delay-1' },
    { type: 'set_parameter', nodeId: 'delay-1', paramId: 'tone', value: 1200 },
    { type: 'add_module', moduleType: 'reverb', nodeId: 'reverb-1' },
    { type: 'set_parameter', nodeId: 'reverb-1', paramId: 'damping', value: 80 },
  ], 'human');
  const previous = structuredClone(project);
  previous.engine = structuredClone(PRE_AUDIBILITY_ENGINE_PROVENANCE) as typeof previous.engine;
  storage.setItem(STORAGE_KEY, JSON.stringify(previous));

  const restored = restorePersistedProject(storage).project;

  assert.equal(restored.id, project.id);
  assert.equal(restored.name, project.name);
  assert.equal(restored.revision, project.revision);
  assert.deepEqual(restored.chain, project.chain);
  assert.deepEqual(restored.nodes, project.nodes);
  assert.deepEqual(restored.macros, project.macros);
  assert.deepEqual(restored.activity, project.activity);
});

test('persistence adds Chorus and Compressor provenance without changing an exact five-effect project', () => {
  const storage = new MemoryStorage();
  const project = applyProjectCommands(createInitialProject(), [
    { type: 'rename_project', name: 'Preserved five-effect project' },
    { type: 'add_module', moduleType: 'delay', nodeId: 'delay-1' },
    { type: 'set_parameter', nodeId: 'delay-1', paramId: 'time', value: 420 },
    { type: 'create_macro', name: 'Echo', macroId: 'macro-1' },
    { type: 'add_mapping', macroId: 'macro-1', mappingId: 'mapping-1', nodeId: 'delay-1', paramId: 'mix', min: 5, max: 70 },
  ], 'human');
  const previous = structuredClone(project);
  previous.engine = structuredClone(PRE_CHORUS_COMPRESSOR_ENGINE_PROVENANCE) as typeof previous.engine;
  storage.setItem(STORAGE_KEY, JSON.stringify(previous));

  const restored = restorePersistedProject(storage).project;
  assert.deepEqual({ ...restored, engine: undefined }, { ...previous, engine: undefined });
  assert.equal(restored.engine.libraries.compressors, '1.6.0');
  assert.equal(restored.engine.moduleSourceSha256.chorus.length, 64);
  assert.equal(restored.engine.moduleSourceSha256.compressor.length, 64);
});

test('persistence adds Phaser and defaults exact historical Compressor nodes to Clean without content loss', () => {
  const storage = new MemoryStorage();
  const project = applyProjectCommands(createInitialProject(), [
    { type: 'rename_project', name: 'Preserved seven-effect project' },
    { type: 'add_module', moduleType: 'compressor', nodeId: 'compressor-1' },
    { type: 'set_parameter', nodeId: 'compressor-1', paramId: 'threshold', value: -26 },
    { type: 'set_parameter', nodeId: 'compressor-1', paramId: 'ratio', value: 7 },
    { type: 'create_macro', name: 'Pressure', macroId: 'macro-1' },
    { type: 'add_mapping', macroId: 'macro-1', mappingId: 'mapping-1', nodeId: 'compressor-1', paramId: 'mix', min: 40, max: 100 },
  ], 'human');
  const previous = structuredClone(project);
  delete previous.nodes['compressor-1'].params.mode;
  previous.engine = structuredClone(PRE_PHASER_COMPRESSOR_MODES_ENGINE_PROVENANCE) as typeof previous.engine;
  storage.setItem(STORAGE_KEY, JSON.stringify(previous));

  const restored = restorePersistedProject(storage).project;
  assert.equal(restored.id, previous.id);
  assert.equal(restored.name, previous.name);
  assert.equal(restored.revision, previous.revision);
  assert.deepEqual(restored.chain, previous.chain);
  assert.deepEqual(restored.macros, previous.macros);
  assert.deepEqual(restored.activity, previous.activity);
  assert.deepEqual(restored.nodes['compressor-1'].params, {
    mode: 0, threshold: -26, ratio: 7, attack: 20, release: 250, makeup: 0, mix: 100,
  });
  assert.equal(restored.engine.moduleSourceSha256.phaser.length, 64);
});

test('persistence rejects partially matching historical engine provenance', () => {
  const storage = new MemoryStorage();
  const project = createInitialProject();
  const partial = structuredClone(project);
  partial.engine = structuredClone(PRE_PAIR1_ENGINE_PROVENANCE) as typeof partial.engine;
  partial.engine.moduleSourceSha256.filter = '0'.repeat(64);
  storage.setItem(STORAGE_KEY, JSON.stringify(partial));
  const restored = restorePersistedProject(storage);
  assert.equal(restored.source, 'new');
  assert.deepEqual(restored.project.chain, []);
});

test('undo and redo create monotonic revisions while restoring whole snapshots', () => {
  const initial = createInitialProject();
  const renamed = applyProjectCommands(initial, [{ type: 'rename_project', name: 'One' }], 'human');
  const withGain = applyProjectCommands(renamed, [{ type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' }], 'agent');
  let state: HistoryState = { past: [initial, renamed], present: withGain, future: [] };
  state = historyReducer(state, { type: 'undo' });
  assert.equal(state.present.name, 'One');
  assert.deepEqual(state.present.chain, []);
  assert.equal(state.present.revision, withGain.revision + 1);
  state = historyReducer(state, { type: 'redo' });
  assert.deepEqual(state.present.chain, ['gain-1']);
  assert.equal(state.present.revision, withGain.revision + 2);
});
