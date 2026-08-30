import type { OfflineComparison } from '../audio/compare';
import type { ProjectValidationResult } from '../domain/validation';

const db = (value: number) => Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : 'Silent';

export function AnalysisModal({ comparison, validation, onClose }: {
  comparison: OfflineComparison;
  validation: ProjectValidationResult;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="analysis-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close analysis" onClick={onClose}>×</button>
        <span className="modal-kicker">Offline comparison · revision {comparison.revision}</span>
        <h2 id="analysis-title">Dry and processed audio, measured fairly.</h2>
        <div className="analysis-table" role="table" aria-label="Audio comparison levels">
          <div role="row"><span role="columnheader">Render</span><span role="columnheader">Average</span><span role="columnheader">Peak</span><span role="columnheader">Stereo</span></div>
          <div role="row"><strong role="cell">Dry</strong><span role="cell">{db(comparison.dry.averageDb)}</span><span role="cell">{db(comparison.dry.peakDb)}</span><span role="cell">{comparison.dry.stereoActivity > 0.0001 ? 'Active' : 'Mono'}</span></div>
          <div role="row"><strong role="cell">Processed</strong><span role="cell">{db(comparison.processed.averageDb)}</span><span role="cell">{db(comparison.processed.peakDb)}</span><span role="cell">{comparison.processed.stereoActivity > 0.0001 ? 'Active' : 'Mono'}</span></div>
          <div role="row"><strong role="cell">Level matched</strong><span role="cell">{db(comparison.loudnessMatched.averageDb)}</span><span role="cell">{db(comparison.loudnessMatched.peakDb)}</span><span role="cell">{comparison.loudnessMatch.gainDb.toFixed(1)} dB</span></div>
        </div>
        <div className={`analysis-status ${validation.status}`}>
          <strong>{validation.status === 'valid' ? 'Browser validation passed' : 'Browser validation needs attention'}</strong>
          <span>Faust {validation.engine.faustCompilerVersion} · definition {validation.engine.definitionVersion}</span>
        </div>
        <ul className="analysis-summary">
          {comparison.plainLanguageSummary.map((line) => <li key={line}>{line}</li>)}
          {validation.issues.map((issue) => <li key={`${issue.code}-${issue.message}`} className={issue.severity}>{issue.message}</li>)}
        </ul>
        <p className="analysis-disclaimer">Measurements help expose clipping, silence, and level bias. They do not decide whether the effect sounds better.</p>
      </section>
    </div>
  );
}
