import type { ProjectValidationResult } from './validation.ts';
import { validateProject, type ProjectV2 } from './project.ts';

export interface FrozenProjectRevision {
  id: string;
  projectId: string;
  revision: number;
  approvalHash: string;
  /** @deprecated Use approvalHash. Kept for existing callers and exported recipes. */
  contentHash: string;
  frozenAt: string;
  project: ProjectV2;
}

export type NativeBuildGate = {
  status: 'unavailable';
  code: 'approval_required' | 'native_build_unavailable';
  projectId: string;
  revision: number;
  contentHash: string;
  message: string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

export async function hashProject(project: ProjectV2) {
  const canonical = JSON.stringify(stableValue(project));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function freezeProjectRevision(project: ProjectV2, validation: ProjectValidationResult): Promise<FrozenProjectRevision> {
  const validatedProject = validateProject(project);
  if (validation.revision !== project.revision) throw new Error(`Validation belongs to revision ${validation.revision}; current revision is ${project.revision}.`);
  if (validation.status !== 'valid') throw new Error('The current project needs a successful audio analysis before it can be prepared for download.');
  const snapshot = structuredClone(validatedProject);
  const contentHash = await hashProject(snapshot);
  const validationHash = await hashProject(validateProject(validation.projectSnapshot));
  if (validationHash !== contentHash) throw new Error('The project changed after analysis. Analyze the current project again before downloading.');
  deepFreeze(snapshot);
  return Object.freeze({
    id: `frozen_${contentHash.slice(0, 16)}`,
    projectId: snapshot.id,
    revision: snapshot.revision,
    approvalHash: contentHash,
    contentHash,
    frozenAt: new Date().toISOString(),
    project: snapshot,
  });
}

export function requestPluginBuild(frozen: FrozenProjectRevision, approved: boolean): NativeBuildGate {
  if (!approved) {
    return {
      status: 'unavailable', code: 'approval_required', projectId: frozen.projectId, revision: frozen.revision, contentHash: frozen.contentHash,
      message: 'Explicit user approval is required before a native build request can be submitted.',
    };
  }
  return {
    status: 'unavailable', code: 'native_build_unavailable', projectId: frozen.projectId, revision: frozen.revision, contentHash: frozen.contentHash,
    message: 'This private browser release has no native compiler or validator service. No VST3 artifact was created.',
  };
}
