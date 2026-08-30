import { MODULE_CATALOG, MODULE_TYPES } from '../domain/catalog';
import type { ModuleType } from '../domain/types';
import { moduleDragKey } from './dnd';

export function ModuleSidebar({ mobileOpen, onAddModule, onOpenInsert }: {
  mobileOpen: boolean;
  onAddModule: (moduleType: ModuleType) => void;
  onOpenInsert: () => void;
}) {
  return (
    <aside className={`module-sidebar ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label="Module pool">
      <header className="rail-header">
        <span>Primitives</span>
        <button type="button" className="text-button" onClick={onOpenInsert}>+ Add</button>
      </header>
      <div className="module-list">
        {MODULE_TYPES.map((moduleType, index) => {
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
              <span className="module-index">{String(index + 1).padStart(2, '0')}</span>
              <span>{definition.name}</span>
              <span className="module-add" aria-hidden="true">+</span>
            </button>
          );
        })}
      </div>
      <p className="rail-note">Three canonical Faust building blocks. Drag onto the path or click to append.</p>
    </aside>
  );
}
