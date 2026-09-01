import type { FrozenProjectRevision } from '../../audio-builder/domain/build.ts';
import { createNativeBuildRequest } from '../contract.ts';
import type { BuildRepository, Vst3BuildOutcome, Vst3BuildRecord } from './repository.ts';

export class Vst3ExportError extends Error {
  readonly code: 'export_disabled' | 'unauthorized_worker' | 'job_not_found' | 'invalid_result';
  readonly httpStatus: number;

  constructor(code: Vst3ExportError['code'], message: string, httpStatus: number) {
    super(message);
    this.name = 'Vst3ExportError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function publicJob(record: Vst3BuildRecord) {
  return {
    id: record.id,
    status: record.status,
    artifact: record.artifact,
    evidence: record.evidence,
    error: record.error,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
  };
}

function validateOutcome(record: Vst3BuildRecord, outcome: Vst3BuildOutcome, artifactPublicUrl: string) {
  if (outcome.status === 'failed') {
    if (typeof outcome.error !== 'string' || outcome.error.trim().length === 0 || outcome.error.length > 500) {
      throw new Vst3ExportError('invalid_result', 'The worker failure message is invalid.', 400);
    }
    return;
  }
  const { artifact, evidence } = outcome;
  const safeFilename = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.vst3$/u.test(artifact?.filename ?? '');
  const safeHash = /^[a-f0-9]{64}$/u.test(artifact?.bundleSha256 ?? '');
  const exactArtifact = artifact?.architecture === 'arm64' && artifact?.dspHash === record.request.dspHash;
  const expectedObjectKey = `builds/${record.id}/${artifact?.filename}.zip`;
  const exactPublicArtifact = artifact?.objectKey === expectedObjectKey && artifact?.downloadUrl === `${artifactPublicUrl.replace(/\/+$/u, '')}/${expectedObjectKey}`;
  if (!safeFilename || !safeHash || !exactArtifact || !exactPublicArtifact || !evidence?.validatorPassed || !evidence.stateRestorePassed || !evidence.parityPassed) {
    throw new Vst3ExportError('invalid_result', 'A build cannot become ready without its exact artifact and all native verification gates.', 400);
  }
}

export function createVst3ExportService({ repository, enabled, workerToken, artifactPublicUrl }: { repository: BuildRepository; enabled: boolean; workerToken: string; artifactPublicUrl: string }) {
  const authorizeWorker = (token: string) => {
    if (workerToken.length < 24 || token !== workerToken) throw new Vst3ExportError('unauthorized_worker', 'The Mac worker token is invalid.', 401);
  };
  return {
    capability: () => ({ enabled }),
    async submit(frozen: FrozenProjectRevision) {
      if (!enabled) throw new Vst3ExportError('export_disabled', 'VST3 export is currently turned off.', 503);
      const request = await createNativeBuildRequest(frozen);
      const now = new Date().toISOString();
      const record: Vst3BuildRecord = { id: crypto.randomUUID(), status: 'queued', request, createdAt: now };
      await repository.insert(record);
      return publicJob(record);
    },
    async status(id: string) {
      const record = await repository.get(id);
      if (!record) throw new Vst3ExportError('job_not_found', 'The VST3 build was not found.', 404);
      return publicJob(record);
    },
    async claim(token: string) {
      authorizeWorker(token);
      if (!enabled) return null;
      return repository.claimOldest(new Date().toISOString());
    },
    async report(token: string, id: string, outcome: Vst3BuildOutcome) {
      authorizeWorker(token);
      const current = await repository.get(id);
      if (!current || current.status !== 'building') throw new Vst3ExportError('invalid_result', 'Only a building job can accept a result.', 409);
      validateOutcome(current, outcome, artifactPublicUrl);
      const record = await repository.report(id, outcome, new Date().toISOString());
      if (!record) throw new Vst3ExportError('invalid_result', 'Only a building job can accept a result.', 409);
      return publicJob(record);
    },
  };
}
