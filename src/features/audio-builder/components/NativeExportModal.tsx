import type { FrozenProjectRevision } from '../domain/build';
import type { PublicVst3Build } from '../../vst3-export/client';

export function NativeExportModal({ projectName, analyzed, frozen, job, error, busy, onClose, onFreezeBuild }: {
  projectName: string;
  analyzed: boolean;
  frozen: FrozenProjectRevision | null;
  job: PublicVst3Build | null;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onFreezeBuild: () => void;
}) {
  const building = job?.status === 'building';
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
        {building ? <p className="build-gate-message" role="status">Your VST3 is building and being verified. A download link will appear here shortly.</p> : null}
        {job?.status === 'ready' ? <div className="build-download" role="status"><p className="build-gate-message">Your VST3 is ready: {job.artifact?.filename}</p>{job.artifact?.downloadUrl ? <a className="export-button vst3-download" href={job.artifact.downloadUrl} download={`${job.artifact.filename}.zip`}>Download ZIP</a> : null}</div> : null}
        {job?.status === 'failed' ? <p className="build-gate-message" role="alert">{job.error ?? 'The native build failed.'}</p> : null}
        {error ? <p className="build-gate-message" role="alert">{error}</p> : null}
        <div className="modal-actions">
          {!frozen ? <button type="button" className="export-button modal-primary-action" disabled={busy} onClick={onFreezeBuild}>{busy ? 'Analyzing…' : 'Analyze & freeze'}</button> : null}
          {frozen && !job ? <button type="button" className="outline-button modal-primary-action" disabled>Build VST3 on Mac</button> : null}
        </div>
        <span className="modal-brand rail-logo" aria-label="Beat.Z">Beat.Z</span>
      </section>
    </div>
  );
}
