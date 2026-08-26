export function AuditionBar({ playing, sourceName, meters, chainBypass, onTogglePlayback, onChooseFile, onRestart, onToggleBypass }: {
  playing: boolean;
  sourceName: string;
  meters: { input: number; output: number };
  chainBypass: boolean;
  onTogglePlayback: () => void;
  onChooseFile: () => void;
  onRestart: () => void;
  onToggleBypass: () => void;
}) {
  return (
    <footer className="audition-bar">
      <div className="transport-group">
        <button type="button" className={`play-button ${playing ? 'is-playing' : ''}`} aria-label={playing ? 'Pause audition' : 'Play audition'} onClick={onTogglePlayback}>{playing ? 'Ⅱ' : '▶'}</button>
        <div><span className="transport-label">Audition source</span><strong title={sourceName}>{sourceName}</strong></div>
      </div>
      <div className="source-actions">
        <button type="button" className="file-button" onClick={onChooseFile}>Choose audio file</button>
        <button type="button" className="restart-button" aria-label="Restart audition" onClick={onRestart}>↺</button>
      </div>
      <div className="meter-group" aria-label="Input and output meters">
        <span>IN</span><i className="meter"><b style={{ width: `${meters.input * 100}%` }} /></i>
        <span>OUT</span><i className="meter"><b style={{ width: `${meters.output * 100}%` }} /></i>
      </div>
      <button type="button" className={`bypass-button ${chainBypass ? 'is-active' : ''}`} onClick={onToggleBypass}>Chain bypass</button>
    </footer>
  );
}
