export function AuditionBar({ playing, sourceName, isDemo, meters, chainBypass, onTogglePlayback, onChooseFile, onUseDemo, onToggleBypass }: {
  playing: boolean;
  sourceName: string;
  isDemo: boolean;
  meters: { input: number; output: number; outputPeak?: number };
  chainBypass: boolean;
  onTogglePlayback: () => void;
  onChooseFile: () => void;
  onUseDemo: () => void;
  onToggleBypass: () => void;
}) {
  return (
    <footer className="audition-bar">
      <div className="transport-group">
        <button type="button" className={`play-button ${playing ? 'is-playing' : ''}`} aria-label={playing ? 'Pause audition' : 'Play audition'} onClick={onTogglePlayback}>{playing ? 'Ⅱ' : '▶'}</button>
        <div>{isDemo ? <strong title={sourceName}>Beat.Z Demo</strong> : <><span className="transport-label">Personal</span><strong title={sourceName}>{sourceName}</strong></>}</div>
      </div>
      <div className="source-actions">
        <button type="button" className="file-button" onClick={onChooseFile}>Select audio</button>
        {!isDemo ? <button type="button" className="file-button" onClick={onUseDemo}>Demo</button> : null}
      </div>
      <div className="meter-group" aria-label="Input and output meters">
        <span>IN</span><i className="meter"><b style={{ width: `${meters.input * 100}%` }} /></i>
        <span>OUT</span><i className="meter"><b style={{ width: `${meters.output * 100}%` }} /></i>
      </div>
      <div className="compare-actions">
        {meters.outputPeak !== undefined && meters.outputPeak >= 1 ? <span className="clip-warning" role="status">CLIP</span> : null}
        <button type="button" className={`bypass-button ${!chainBypass ? 'is-active' : ''}`} aria-pressed={!chainBypass} onClick={onToggleBypass}>{chainBypass ? 'Effect off' : 'Effect on'}</button>
      </div>
    </footer>
  );
}
