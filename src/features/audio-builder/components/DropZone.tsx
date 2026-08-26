import type { DragEvent } from 'react';

export function DropZone({ index, empty = false, active, onOpen, onDrop, onDragEnter }: {
  index: number;
  empty?: boolean;
  active: boolean;
  onOpen: () => void;
  onDrop: (event: DragEvent, index: number) => void;
  onDragEnter: (index: number) => void;
}) {
  return (
    <div
      className={`drop-zone ${empty ? 'is-empty' : ''} ${active ? 'is-active' : ''}`}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
      onDragEnter={() => onDragEnter(index)}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragEnter(-1); }}
      onDrop={(event) => onDrop(event, index)}
    >
      <button type="button" aria-label={`Insert module at position ${index + 1}`} onClick={onOpen}>+</button>
    </div>
  );
}
