import type { FrozenProjectRevision } from '../domain/build';
import type { ProjectValidationResult } from '../domain/validation';
import type { PublicVst3Build } from '../../vst3-export/client';

export function NativeExportModal({ validation, frozen, exportEnabled, job, error, busy, onClose, onExport, onValidate, onFreeze, onRequestBuild }: {
  validation: ProjectValidationResult;
  frozen: FrozenProjectRevision | null;
  exportEnabled: boolean | null;
  job: PublicVst3Build | null;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onExport: () => void;
  onValidate: () => void;
  onFreeze: () => void;
  onRequestBuild: () => void;
}) {
  const building = job?.status === 'building';
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="native-modal" role="dialog" aria-modal="true" aria-labelledby="native-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <span className="modal-kicker">Native output · browser proof first</span>
        <h2 id="native-title">Build the sound you approved.</h2>
        <p>The Site freezes the exact Faust project. Your connected Mac compiles and verifies the VST3, then saves it directly in Downloads.</p>
        <div className="readiness-list">
          <span className={validation.status === 'valid' ? 'is-ready' : ''}>Browser validation · {validation.status}</span>
          <span className={frozen ? 'is-ready' : ''}>{frozen ? `Frozen revision ${frozen.revision}` : 'Approved revision not frozen'}</span>
          <span className={exportEnabled ? 'is-ready' : ''}>{exportEnabled === null ? 'Checking Mac builder…' : exportEnabled ? 'Mac builder enabled' : 'Mac builder unavailable'}</span>
          <span className={job?.status === 'ready' ? 'is-ready' : building ? 'is-building' : ''} aria-live="polite" aria-busy={building}>{job ? `Build · ${job.status}` : 'No build requested'}</span>
        </div>
        {frozen ? <code className="frozen-hash">{frozen.approvalHash}</code> : null}
        {building ? <p className="build-gate-message" role="status">Your VST3 is building and being verified. A download link will appear here shortly.</p> : null}
        {job?.status === 'ready' ? <div className="build-download" role="status"><p className="build-gate-message">Your VST3 is ready: {job.artifact?.filename}</p>{job.artifact?.downloadUrl ? <a className="export-button vst3-download" href={job.artifact.downloadUrl} download={`${job.artifact.filename}.zip`}>Download VST3 ZIP</a> : null}</div> : null}
        {job?.status === 'failed' ? <p className="build-gate-message" role="alert">{job.error ?? 'The native build failed.'}</p> : null}
        {error ? <p className="build-gate-message" role="alert">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={onExport}>Export recipe</button>
          {validation.status !== 'valid' ? <button type="button" className="export-button" disabled={busy} onClick={onValidate}>{busy ? 'Validating…' : 'Validate browser project'}</button> : null}
          {validation.status === 'valid' && !frozen ? <button type="button" className="export-button" disabled={busy} onClick={onFreeze}>{busy ? 'Freezing…' : `Freeze revision ${validation.revision}`}</button> : null}
          {frozen && exportEnabled && !job ? <button type="button" className="export-button" disabled={busy} onClick={onRequestBuild}>{busy ? 'Submitting…' : 'Build VST3 on this Mac'}</button> : null}
        </div>
      </section>
    </div>
  );
}
