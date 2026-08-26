import type { MacroControl, MacroMapping, ProjectCommand, ProjectV1 } from '../domain/types';
import type { AgentStatus } from './AgentDrawer';
import { MappingRow } from './MappingRow';
import { ProjectKnob } from './ProjectKnob';

export function MacroSidebar({ project, mobileOpen, selectedMacroId, selectedMacro, agentStatus, hasAvailableTarget, onCreateMacro, onSelectMacro, onAddMapping, onChangeMappingTarget, onCommit }: {
  project: ProjectV1;
  mobileOpen: boolean;
  selectedMacroId: string | null;
  selectedMacro: MacroControl | null;
  agentStatus: AgentStatus;
  hasAvailableTarget: boolean;
  onCreateMacro: () => void;
  onSelectMacro: (macroId: string) => void;
  onAddMapping: (macro: MacroControl) => void;
  onChangeMappingTarget: (macro: MacroControl, mapping: MacroMapping, value: string) => void;
  onCommit: (commands: ProjectCommand[]) => void;
}) {
  return (
    <aside className={`macro-sidebar ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label="Plugin controls">
      <header className="rail-header"><span>Plugin controls</span><button type="button" className="text-button" onClick={onCreateMacro}>+ Create macro</button></header>
      {project.macros.length === 0 ? (
        <div className="macro-empty">
          <div className="empty-knob" aria-hidden="true" />
          <h2>No controls exposed</h2>
          <p>Map DSP parameters to a small set of controls that will define the finished plugin.</p>
          <button type="button" className="outline-button" onClick={onCreateMacro}>Create first macro</button>
        </div>
      ) : (
        <div className="macro-content">
          <div className="macro-grid">
            {project.macros.map((macro) => (
              <ProjectKnob
                key={macro.id}
                macro={macro}
                selected={selectedMacroId === macro.id}
                onSelect={() => onSelectMacro(macro.id)}
                onChange={(value) => onCommit([{ type: 'set_macro_value', macroId: macro.id, value }])}
              />
            ))}
            {project.macros.length < 8 && <button type="button" className="new-macro-tile" onClick={onCreateMacro}><span>+</span>Create control</button>}
          </div>
          {selectedMacro ? (
            <section className="mapping-editor" aria-label={`${selectedMacro.name} mappings`}>
              <header>
                <input
                  aria-label="Macro name"
                  key={selectedMacro.id + selectedMacro.name}
                  defaultValue={selectedMacro.name}
                  maxLength={24}
                  onBlur={(event) => { if (event.target.value.trim() !== selectedMacro.name) onCommit([{ type: 'rename_macro', macroId: selectedMacro.id, name: event.target.value }]); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                />
                <button type="button" aria-label="Delete macro" onClick={() => onCommit([{ type: 'delete_macro', macroId: selectedMacro.id }])}>Delete</button>
              </header>
              <div className="mapping-heading"><span>Mappings</span><button type="button" disabled={!hasAvailableTarget} onClick={() => onAddMapping(selectedMacro)}>+ Add</button></div>
              {selectedMacro.mappings.length === 0 ? <p className="mapping-empty">This control is not mapped yet.</p> : selectedMacro.mappings.map((mapping) => (
                <MappingRow
                  key={mapping.id}
                  project={project}
                  macro={selectedMacro}
                  mapping={mapping}
                  onTargetChange={(value) => onChangeMappingTarget(selectedMacro, mapping, value)}
                  onUpdate={(changes) => onCommit([{ type: 'update_mapping', macroId: selectedMacro.id, mappingId: mapping.id, ...changes }])}
                  onRemove={() => onCommit([{ type: 'remove_mapping', macroId: selectedMacro.id, mappingId: mapping.id }])}
                />
              ))}
            </section>
          ) : <p className="select-macro-hint">Select a control to edit its mappings.</p>}
        </div>
      )}
      <div className="agent-footnote"><span className={`agent-dot ${agentStatus}`} /> {agentStatus === 'connected' ? 'Structured agent actions connected' : 'Structured agent actions ready'}</div>
    </aside>
  );
}
