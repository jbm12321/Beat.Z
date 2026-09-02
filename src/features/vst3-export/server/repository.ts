import type { NativeBuildRequestV1 } from '../contract.ts';

export type Vst3BuildStatus = 'queued' | 'building' | 'ready' | 'failed';

export const STALE_BUILD_TIMEOUT_MS = 2 * 60 * 1_000;
export const STALE_BUILD_ERROR = 'Failed.';

export interface Vst3Artifact {
  filename: string;
  bundleSha256: string;
  architecture: 'arm64';
  dspHash: string;
  objectKey: string;
  downloadUrl: string;
}

export interface Vst3BuildEvidence {
  validatorPassed: boolean;
  stateRestorePassed: boolean;
  parityPassed: boolean;
}

export type Vst3BuildOutcome =
  | { status: 'ready'; artifact: Vst3Artifact; evidence: Vst3BuildEvidence }
  | { status: 'failed'; error: string };

export interface Vst3BuildRecord {
  id: string;
  status: Vst3BuildStatus;
  request: NativeBuildRequestV1;
  artifact?: Vst3Artifact;
  evidence?: Vst3BuildEvidence;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface BuildRepository {
  insert(record: Vst3BuildRecord): Promise<void>;
  get(id: string): Promise<Vst3BuildRecord | null>;
  claimOldest(now: string): Promise<Vst3BuildRecord | null>;
  report(id: string, outcome: Vst3BuildOutcome, now: string): Promise<Vst3BuildRecord | null>;
}

function cloneRecord(record: Vst3BuildRecord) {
  return structuredClone(record);
}

export class MemoryBuildRepository implements BuildRepository {
  readonly #records = new Map<string, Vst3BuildRecord>();

  async insert(record: Vst3BuildRecord) {
    if (this.#records.has(record.id)) throw new Error('Duplicate VST3 build id.');
    this.#records.set(record.id, cloneRecord(record));
  }

  async get(id: string) {
    const record = this.#records.get(id);
    return record ? cloneRecord(record) : null;
  }

  async claimOldest(now: string) {
    const cutoff = Date.parse(now) - STALE_BUILD_TIMEOUT_MS;
    const building = [...this.#records.values()].filter((record) => record.status === 'building');
    for (const record of building) {
      const startedAt = record.startedAt ? Date.parse(record.startedAt) : Number.NaN;
      if (!Number.isFinite(startedAt) || startedAt < cutoff) {
        record.status = 'failed';
        record.error = STALE_BUILD_ERROR;
        record.finishedAt = now;
      }
    }
    if ([...this.#records.values()].some((record) => record.status === 'building')) return null;
    const queued = [...this.#records.values()]
      .filter((record) => record.status === 'queued')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (!queued) return null;
    queued.status = 'building';
    queued.startedAt = now;
    return cloneRecord(queued);
  }

  async report(id: string, outcome: Vst3BuildOutcome, now: string) {
    const record = this.#records.get(id);
    if (!record || record.status !== 'building') return null;
    record.status = outcome.status;
    record.finishedAt = now;
    if (outcome.status === 'ready') {
      record.artifact = structuredClone(outcome.artifact);
      record.evidence = structuredClone(outcome.evidence);
    } else {
      record.error = outcome.error;
    }
    return cloneRecord(record);
  }
}
