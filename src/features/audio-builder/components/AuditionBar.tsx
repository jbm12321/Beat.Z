export function AuditionBar({ playing, sourceName, isDemo, meters, chainBypass, loudnessMatched, canLoudnessMatch, analyzing, onTogglePlayback, onChooseFile, onUseDemo, onRestart, onToggleBypass, onToggleLoudnessMatch, onAnalyze }: {
  playing: boolean;
  sourceName: string;
  isDemo: boolean;
  meters: { input: number; output: number; outputPeak?: number };
  chainBypass: boolean;
  loudnessMatched: boolean;
  canLoudnessMatch: boolean;
  analyzing: boolean;
  onTogglePlayback: () => void;
  onChooseFile: () => void;
  onUseDemo: () => void;
  onRestart: () => void;
  onToggleBypass: () => void;
  onToggleLoudnessMatch: () => void;
  onAnalyze: () => void;
}) {
  return (
    <footer className="audition-bar">
      <div className="transport-group">
        <button type="button" className={`play-button ${playing ? 'is-playing' : ''}`} aria-label={playing ? 'Pause audition' : 'Play audition'} onClick={onTogglePlayback}>{playing ? 'Ⅱ' : '▶'}</button>
        <div><span className="transport-label">Audition source</span><strong title={sourceName}>{sourceName}</strong></div>
      </div>
      <div className="source-actions">
        <button type="button" className="file-button" onClick={onChooseFile}>Choose audio file</button>
        {!isDemo ? <button type="button" className="file-button" onClick={onUseDemo}>Use demo</button> : null}
        <button type="button" className="restart-button" aria-label="Restart audition" onClick={onRestart}>↺</button>
      </div>
      <div className="meter-group" aria-label="Input and output meters">
        <span>IN</span><i className="meter"><b style={{ width: `${meters.input * 100}%` }} /></i>
        <span>OUT</span><i className="meter"><b style={{ width: `${meters.output * 100}%` }} /></i>
      </div>
      <div className="compare-actions">
        {meters.outputPeak !== undefined && meters.outputPeak >= 1 ? <span className="clip-warning" role="status">CLIP</span> : null}
        <button type="button" className={`bypass-button ${chainBypass ? 'is-active' : ''}`} onClick={onToggleBypass}>{chainBypass ? 'Dry' : 'Processed'}</button>
        <button type="button" className={`bypass-button ${loudnessMatched ? 'is-active' : ''}`} disabled={!canLoudnessMatch} onClick={onToggleLoudnessMatch}>Level match</button>
        <button type="button" className="bypass-button" disabled={analyzing} onClick={onAnalyze}>{analyzing ? 'Analyzing…' : 'Analyze'}</button>
      </div>
    </footer>
  );
}
