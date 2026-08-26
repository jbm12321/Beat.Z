import type { ActivityItem } from '../domain/types';

export type AgentStatus = 'checking' | 'connected' | 'unavailable';

export function AgentDrawer({ open, status, activity, canUndo, onClose, onUndo }: {
  open: boolean;
  status: AgentStatus;
  activity: ActivityItem[];
  canUndo: boolean;
  onClose: () => void;
  onUndo: () => void;
}) {
  return (
    <aside className={`agent-drawer ${open ? 'is-open' : ''}`} aria-label="Agent activity">
      <header><div><span className={`agent-dot ${status}`} /><strong>Agent activity</strong></div><button type="button" aria-label="Close agent activity" onClick={onClose}>×</button></header>
      <p>{status === 'connected' ? 'Structured page actions are connected to this project.' : 'The structured action adapter is ready. This browser does not currently expose WebMCP.'}</p>
      <div className="activity-list">
        {activity.length === 0 ? <span className="activity-empty">No changes yet.</span> : activity.map((item) => (
          <div key={item.id}><span>{item.actor === 'agent' ? 'AGENT' : 'YOU'}</span><strong>{item.summary}</strong><time>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
        ))}
      </div>
      <button type="button" className="outline-button" disabled={!canUndo} onClick={onUndo}>Undo last change</button>
    </aside>
  );
}
