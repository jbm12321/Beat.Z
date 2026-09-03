import { useEffect, useRef } from 'react';

export function AuditionBar({ playing, sourceName, isDemo, playbackProgress, waveformPeaks, meters, chainBypass, onTogglePlayback, onSeek, onChooseFile, onUseDemo, onToggleBypass }: {
  playing: boolean;
  sourceName: string;
  isDemo: boolean;
  playbackProgress: number;
  waveformPeaks: number[];
  meters: { input: number; output: number; outputPeak?: number };
  chainBypass: boolean;
  onTogglePlayback: () => void;
  onSeek: (progress: number) => void;
  onChooseFile: () => void;
  onUseDemo: () => void;
  onToggleBypass: () => void;
}) {
  const waveformRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const center = canvas.height / 2;
    const barWidth = canvas.width / Math.max(1, waveformPeaks.length);
    const largestPeak = Math.max(0.001, ...waveformPeaks);
    const waveformColor = getComputedStyle(canvas).color;
    waveformPeaks.forEach((peak, index) => {
      const height = Math.max(1, (peak / largestPeak) * (canvas.height - 2));
      context.fillStyle = waveformColor;
      context.globalAlpha = index / waveformPeaks.length <= playbackProgress ? 1 : 0.28;
      context.fillRect(index * barWidth, center - height / 2, Math.max(1, barWidth - 1), height);
    });
    context.globalAlpha = 1;
  }, [playbackProgress, waveformPeaks]);

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
      <label className="audition-scrubber">
        <span className="visually-hidden">Audition position</span>
        <canvas ref={waveformRef} width="640" height="18" aria-hidden="true" />
        <input type="range" min="0" max="1" step="0.001" value={playbackProgress} onChange={(event) => onSeek(Number(event.target.value))} />
      </label>
    </footer>
  );
}
