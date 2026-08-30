import { makeId, validateProject, type ProjectV2 } from '../domain/project.ts';

export type HistoryState = { past: ProjectV2[]; present: ProjectV2; future: ProjectV2[] };

export type HistoryAction =
  | { type: 'commit'; project: ProjectV2 }
  | { type: 'load'; project: ProjectV2 }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'sync'; state: HistoryState };

function restoreSnapshot(snapshot: ProjectV2, current: ProjectV2, summary: string) {
  const restored = structuredClone(snapshot);
  restored.revision = current.revision + 1;
  restored.activity = [{
    id: makeId('activity'),
    actor: 'human' as const,
    summary,
    timestamp: new Date().toISOString(),
  }, ...current.activity].slice(0, 24);
  return validateProject(restored);
}

export function undoHistory(state: HistoryState): HistoryState {
  const previous = state.past.at(-1);
  if (!previous) return state;
  return {
    past: state.past.slice(0, -1),
    present: restoreSnapshot(previous, state.present, 'Undid the previous project change'),
    future: [state.present, ...state.future].slice(0, 50),
  };
}

export function redoHistory(state: HistoryState): HistoryState {
  const next = state.future[0];
  if (!next) return state;
  return {
    past: [...state.past, state.present].slice(-50),
    present: restoreSnapshot(next, state.present, 'Redid the previous project change'),
    future: state.future.slice(1),
  };
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'sync') return action.state;
  if (action.type === 'commit') return { past: [...state.past, state.present].slice(-50), present: action.project, future: [] };
  if (action.type === 'load') return { past: [], present: action.project, future: [] };
  return action.type === 'undo' ? undoHistory(state) : redoHistory(state);
}
