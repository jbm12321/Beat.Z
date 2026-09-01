import { getVst3ExportService } from '@/src/features/vst3-export/server/runtime.ts';
import { jsonError, workerToken } from '@/src/features/vst3-export/server/http.ts';
import type { Vst3BuildOutcome } from '@/src/features/vst3-export/server/repository.ts';

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const outcome = await request.json() as Vst3BuildOutcome;
    return Response.json(await getVst3ExportService().report(workerToken(request), jobId, outcome));
  } catch (error) {
    return jsonError(error);
  }
}
