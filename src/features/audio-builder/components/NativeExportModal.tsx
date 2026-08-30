import type { FrozenProjectRevision, NativeBuildGate } from '../domain/build';
import type { ProjectValidationResult } from '../domain/validation';

export function NativeExportModal({ validation, frozen, buildGate, busy, onClose, onExport, onValidate, onFreeze, onRequestBuild }: {
  validation: ProjectValidationResult;
  frozen: FrozenProjectRevision | null;
  buildGate: NativeBuildGate | null;
  busy: boolean;
  onClose: () => void;
  onExport: () => void;
  onValidate: () => void;
  onFreeze: () => void;
  onRequestBuild: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="native-modal" role="dialog" aria-modal="true" aria-labelledby="native-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <span className="modal-kicker">Native output · browser proof first</span>
        <h2 id="native-title">Freeze the sound you approved.</h2>
        <p>Browser validation and native VST3 validation are separate gates. This release can freeze an exact Faust project revision, but no compiler or DAW validator service is connected.</p>
        <div className="readiness-list">
          <span className={validation.status === 'valid' ? 'is-ready' : ''}>Browser validation · {validation.status}</span>
          <span className={frozen ? 'is-ready' : ''}>{frozen ? `Frozen revision ${frozen.revision}` : 'Approved revision not frozen'}</span>
          <span>Native compiler service</span><span>Validator and DAW host proof</span>
        </div>
        {frozen ? <code className="frozen-hash">{frozen.contentHash}</code> : null}
        {buildGate ? <p className="build-gate-message" role="status">{buildGate.message}</p> : null}
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={onExport}>Export recipe</button>
          {validation.status !== 'valid' ? <button type="button" className="export-button" disabled={busy} onClick={onValidate}>{busy ? 'Validating…' : 'Validate browser project'}</button> : null}
          {validation.status === 'valid' && !frozen ? <button type="button" className="export-button" disabled={busy} onClick={onFreeze}>{busy ? 'Freezing…' : `Freeze revision ${validation.revision}`}</button> : null}
          {frozen ? <button type="button" className="export-button" onClick={onRequestBuild}>Request VST3 build</button> : null}
        </div>
      </section>
    </div>
  );
}
