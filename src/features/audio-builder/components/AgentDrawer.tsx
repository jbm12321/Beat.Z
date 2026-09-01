import type { ActivityItem } from '../domain/types';
import type { AgentProposal } from '../agent/proposals';

export type AgentStatus = 'checking' | 'connected' | 'unavailable';

export function AgentDrawer({ open, status, activity, proposal, currentRevision, onClose, onApproveProposal, onDismissProposal }: {
  open: boolean;
  status: AgentStatus;
  activity: ActivityItem[];
  proposal: AgentProposal | null;
  currentRevision: number;
  onClose: () => void;
  onApproveProposal: () => void;
  onDismissProposal: () => void;
}) {
  return (
    <aside className={`agent-drawer ${open ? 'is-open' : ''}`} aria-label="Page activity">
      <header><div><span className={`agent-dot ${status}`} /><strong>Page Activity</strong></div><button type="button" aria-label="Close page activity" onClick={onClose}>×</button></header>
      <span className="agent-section-label">Includes agent actions</span>
      {proposal && proposal.status !== 'applied' ? (
        <section className={`agent-proposal ${proposal.baseRevision !== currentRevision ? 'is-stale' : ''}`} aria-label="Agent proposal">
          <span>PROPOSED CHANGE · REV {proposal.baseRevision}</span>
          <strong>{proposal.summary}</strong>
          <p>{proposal.musicalPurpose}</p>
          <small>{proposal.commands.length} atomic action{proposal.commands.length === 1 ? '' : 's'}</small>
          {proposal.baseRevision !== currentRevision ? <em>The project has changed. Ask the agent to refresh this proposal.</em> : null}
          <div><button type="button" className="outline-button" onClick={onDismissProposal}>Dismiss</button><button type="button" className="export-button" disabled={proposal.baseRevision !== currentRevision} onClick={onApproveProposal}>Approve &amp; apply</button></div>
        </section>
      ) : null}
      <div className="activity-list">
        {activity.length === 0 ? <span className="activity-empty">No changes yet.</span> : activity.map((item) => (
          <div key={item.id}><span>{item.actor === 'agent' ? 'AGENT' : item.actor === 'system' ? 'SYSTEM' : 'YOU'}</span><strong>{item.summary}</strong><time>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
        ))}
      </div>
    </aside>
  );
}
