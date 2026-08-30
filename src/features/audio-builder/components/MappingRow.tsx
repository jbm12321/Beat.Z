import { MODULE_CATALOG } from '../domain/catalog';
import { getMappingForParameter, getParameterDefinition } from '../domain/parameters';
import type { MacroControl, MacroMapping, ProjectV1 } from '../domain/types';

export function MappingRow({ project, macro, mapping, onTargetChange, onUpdate, onRemove }: {
  project: ProjectV1;
  macro: MacroControl;
  mapping: MacroMapping;
  onTargetChange: (value: string) => void;
  onUpdate: (changes: Partial<Pick<MacroMapping, 'min' | 'max' | 'inverted'>>) => void;
  onRemove: () => void;
}) {
  const node = project.nodes[mapping.nodeId];
  const definition = node ? getParameterDefinition(node, mapping.paramId) : null;
  const options = Object.values(project.nodes).flatMap((candidate) => MODULE_CATALOG[candidate.type].parameters.flatMap((parameter) => {
    if (!parameter.mappable) return [];
    const owner = getMappingForParameter(project, candidate.id, parameter.id);
    if (owner && owner.mapping.id !== mapping.id) return [];
    return [{ value: `${candidate.id}::${parameter.id}`, label: `${MODULE_CATALOG[candidate.type].shortName} · ${parameter.name}` }];
  }));
  if (!definition) return null;

  return (
    <div className="mapping-row">
      <div className="mapping-target-line">
        <select aria-label={`${macro.name} mapping target`} value={`${mapping.nodeId}::${mapping.paramId}`} onChange={(event) => onTargetChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="button" aria-label="Remove mapping" onClick={onRemove}>×</button>
      </div>
      <div className="range-fields">
        <label>Min<input type="number" min={definition.min} max={definition.max} step={definition.step} defaultValue={mapping.min} key={`${mapping.id}-min-${mapping.min}`} onBlur={(event) => { try { onUpdate({ min: Number(event.target.value) }); } catch { event.currentTarget.value = String(mapping.min); } }} /></label>
        <label>Max<input type="number" min={definition.min} max={definition.max} step={definition.step} defaultValue={mapping.max} key={`${mapping.id}-max-${mapping.max}`} onBlur={(event) => { try { onUpdate({ max: Number(event.target.value) }); } catch { event.currentTarget.value = String(mapping.max); } }} /></label>
        <label className="invert-field"><input type="checkbox" checked={mapping.inverted} onChange={(event) => onUpdate({ inverted: event.target.checked })} />Invert</label>
      </div>
    </div>
  );
}
