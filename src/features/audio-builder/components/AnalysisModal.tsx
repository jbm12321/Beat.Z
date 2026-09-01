import type { OfflineComparison } from '../audio/compare';

const db = (value: number) => Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : 'Silent';

export function AnalysisModal({ comparison, projectName, onClose }: {
  comparison: OfflineComparison;
  projectName: string;
  onClose: () => void;
}) {
  const visibleSummary = comparison.plainLanguageSummary.filter((line) => !line.startsWith('Stereo movement is') && !line.startsWith('The render is effectively mono.') && !line.startsWith('For a fair comparison') && !line.startsWith('Dry and processed average levels are already closely matched.') && !line.startsWith('The comparison gain reached'));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="analysis-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close analysis" onClick={onClose}>×</button>
        <h2 id="analysis-title">Frozen: {projectName}</h2>
        <div className="analysis-table" role="table" aria-label="Audio comparison levels">
          <div role="row"><span role="columnheader">Render</span><span role="columnheader">Average</span><span role="columnheader">Peak</span><span role="columnheader">Stereo</span></div>
          <div role="row"><strong role="cell">Dry</strong><span role="cell">{db(comparison.dry.averageDb)}</span><span role="cell">{db(comparison.dry.peakDb)}</span><span role="cell">{comparison.dry.stereoActivity > 0.0001 ? 'Active' : 'Mono'}</span></div>
          <div role="row"><strong role="cell">Processed</strong><span role="cell">{db(comparison.processed.averageDb)}</span><span role="cell">{db(comparison.processed.peakDb)}</span><span role="cell">{comparison.processed.stereoActivity > 0.0001 ? 'Active' : 'Mono'}</span></div>
          <div role="row"><strong role="cell">Level matched</strong><span role="cell">{db(comparison.loudnessMatched.averageDb)}</span><span role="cell">{db(comparison.loudnessMatched.peakDb)}</span><span role="cell">{comparison.loudnessMatch.gainDb.toFixed(1)} dB</span></div>
        </div>
        <ul className="analysis-summary">
          {visibleSummary.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <span className="modal-brand rail-logo" aria-label="Beat.Z">Beat.Z</span>
      </section>
    </div>
  );
}
