import { env } from 'cloudflare:workers';
import { D1BuildRepository } from './d1-repository.ts';
import { createVst3ExportService } from './service.ts';

interface Vst3Environment {
  DB: D1Database;
  VST3_WORKER_TOKEN?: string;
  VST3_ARTIFACT_PUBLIC_URL?: string;
}

export function getVst3ExportService() {
  const bindings = env as unknown as Vst3Environment;
  return createVst3ExportService({
    repository: new D1BuildRepository(bindings.DB),
    workerToken: bindings.VST3_WORKER_TOKEN ?? '',
    artifactPublicUrl: bindings.VST3_ARTIFACT_PUBLIC_URL ?? '',
  });
}
