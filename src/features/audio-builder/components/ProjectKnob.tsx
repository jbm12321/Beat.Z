import type { CSSProperties } from 'react';
import type { MacroControl } from '../domain/types';

export function ProjectKnob({ macro, selected, onSelect, onChange, onRename, onDelete }: {
  macro: MacroControl;
  selected: boolean;
  onSelect: () => void;
  onChange: (value: number) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
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
      {selected ? (
        <strong
          className="macro-name-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Control name"
          tabIndex={0}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            const name = event.currentTarget.textContent?.trim() ?? '';
            if (name && name !== macro.name) onRename(name);
            else event.currentTarget.textContent = macro.name;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              event.currentTarget.textContent = macro.name;
              event.currentTarget.blur();
            }
          }}
        >{macro.name}</strong>
      ) : <strong>{macro.name}</strong>}
      <span>{Math.round(macro.value * 100)}</span>
      {selected ? (
        <button type="button" className="macro-delete-button" aria-label={`Delete ${macro.name}`} title="Delete control" onClick={(event) => { event.stopPropagation(); onDelete(); }}>
          <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
