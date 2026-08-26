import type { CSSProperties } from 'react';
import type { MacroControl } from '../domain/types';

export function ProjectKnob({ macro, selected, onSelect, onChange }: {
  macro: MacroControl;
  selected: boolean;
  onSelect: () => void;
  onChange: (value: number) => void;
}) {
  const rotation = -135 + macro.value * 270;
  return (
    <div className={`macro-card ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
      <div className="knob-wrap" style={{ '--knob-turn': `${rotation}deg` } as CSSProperties}>
        <div className="knob-face"><span /></div>
        <input
          className="knob-input"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={macro.value}
          aria-label={`${macro.name} value`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <strong>{macro.name}</strong>
      <span>{Math.round(macro.value * 100)}</span>
    </div>
  );
}
