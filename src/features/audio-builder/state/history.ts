import type { ProjectV1 } from '../domain/types';

export type HistoryState = { past: ProjectV1[]; present: ProjectV1; future: ProjectV1[] };

export type HistoryAction =
  | { type: 'commit'; project: ProjectV1 }
  | { type: 'load'; project: ProjectV1 }
  | { type: 'undo' }
  | { type: 'redo' };

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'commit') return { past: [...state.past, state.present].slice(-50), present: action.project, future: [] };
  if (action.type === 'load') return { past: [], present: action.project, future: [] };
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future].slice(0, 50) };
  }
  const next = state.future[0];
  if (!next) return state;
  return { past: [...state.past, state.present].slice(-50), present: next, future: state.future.slice(1) };
}
