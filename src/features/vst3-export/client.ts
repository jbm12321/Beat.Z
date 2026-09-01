import type { FrozenProjectRevision } from '../audio-builder/domain/build.ts';
import type { Vst3Artifact, Vst3BuildEvidence, Vst3BuildStatus } from './server/repository.ts';

export interface PublicVst3Build {
  id: string;
  status: Vst3BuildStatus;
  artifact?: Vst3Artifact;
  evidence?: Vst3BuildEvidence;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'The VST3 export request failed.');
  return body;
}

export async function getVst3Capability() {
  return readJson<{ enabled: boolean }>(await fetch('/api/vst3-export', { cache: 'no-store' }));
}

export async function submitVst3Build(frozen: FrozenProjectRevision) {
  return readJson<PublicVst3Build>(await fetch('/api/vst3-export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ frozen }),
  }));
}

export async function getVst3Build(id: string) {
  return readJson<PublicVst3Build>(await fetch(`/api/vst3-export/${encodeURIComponent(id)}`, { cache: 'no-store' }));
}
