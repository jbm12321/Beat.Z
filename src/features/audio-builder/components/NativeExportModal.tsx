import type { FrozenProjectRevision } from '../domain/build';

export function NativeExportModal({ projectName, analyzed, frozen, busy, onClose, onFreezeBuild }: {
  projectName: string;
  analyzed: boolean;
  frozen: FrozenProjectRevision | null;
  busy: boolean;
  onClose: () => void;
  onFreezeBuild: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="native-modal" role="dialog" aria-modal="true" aria-labelledby="native-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <h2 id="native-title">Build your VST3</h2>
        <div className="readiness-list">
          <span className={analyzed ? 'is-ready' : ''}>{analyzed ? 'Analyzed' : 'Analysis required'}</span>
          <span className={frozen ? 'is-ready' : ''}>{frozen ? `Prepared: ${frozen.project.name}` : `Not prepared: ${projectName}`}</span>
          <span>Build mode in Private Beta Only</span>
          <span aria-live="polite">Build Status: Unavailable</span>
        </div>
        <div className="modal-actions">
          {!frozen ? <button type="button" className="export-button modal-primary-action" disabled={busy} onClick={onFreezeBuild}>{busy ? 'Analyzing…' : 'Analyze & freeze'}</button> : null}
          {frozen ? <button type="button" className="outline-button modal-primary-action" disabled>Build VST3 on Mac</button> : null}
        </div>
        <span className="modal-brand rail-logo" aria-label="Beat.Z">Beat.Z</span>
      </section>
    </div>
  );
}
