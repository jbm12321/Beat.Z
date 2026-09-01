import { env } from 'cloudflare:workers';
import { D1BuildRepository } from './d1-repository.ts';
import { createVst3ExportService } from './service.ts';

interface Vst3Environment {
  DB: D1Database;
  VST3_EXPORT_ENABLED?: string;
  VST3_WORKER_TOKEN?: string;
}

export function getVst3ExportService() {
  const bindings = env as unknown as Vst3Environment;
  return createVst3ExportService({
    repository: new D1BuildRepository(bindings.DB),
    enabled: bindings.VST3_EXPORT_ENABLED === 'true',
    workerToken: bindings.VST3_WORKER_TOKEN ?? '',
  });
}
