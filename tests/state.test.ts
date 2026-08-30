import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAST_VALID_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
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
