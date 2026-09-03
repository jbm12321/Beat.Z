import { MODULE_CATALOG, MODULE_TYPES } from '../domain/catalog';
import type { ModuleType } from '../domain/types';
import { moduleDragKey } from './dnd';

export function ModuleSidebar({ mobileOpen, onAddModule, onOpenInsert, onHide }: {
  mobileOpen: boolean;
  onAddModule: (moduleType: ModuleType) => void;
  onOpenInsert: () => void;
  onHide: () => void;
}) {
  return (
    <aside className={`module-sidebar ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label="Primitives">
      <header className="rail-header">
        <span>Primitives</span>
        <div className="rail-header-actions">
          <button type="button" className="text-button compact-add-button" aria-label="Add primitive" title="Add primitive" onClick={onOpenInsert}>+</button>
          <button type="button" className="rail-collapse-button" onClick={onHide}>Hide</button>
        </div>
      </header>
      <div className="module-list">
        {MODULE_TYPES.map((moduleType) => {
          const definition = MODULE_CATALOG[moduleType];
          return (
            <button
              id={`module-${moduleType}`}
              type="button"
              className="module-row"
              key={moduleType}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData(moduleDragKey, moduleType);
                event.dataTransfer.setData('text/plain', `module:${moduleType}`);
              }}
              onClick={() => onAddModule(moduleType)}
              title={definition.description}
            >
              <span className="module-index">{definition.shortName}</span>
              <span className="module-name">{definition.name}</span>
              <span className="module-add" aria-hidden="true">+</span>
            </button>
          );
        })}
      </div>
      <div className="module-rail-footer">
        <p className="rail-note rail-logo" aria-label="Beat.Z">Beat.Z</p>
      </div>
    </aside>
  );
}
