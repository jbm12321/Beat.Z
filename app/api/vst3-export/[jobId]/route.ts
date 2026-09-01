import { getVst3ExportService } from '@/src/features/vst3-export/server/runtime.ts';
import { jsonError } from '@/src/features/vst3-export/server/http.ts';

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    return Response.json(await getVst3ExportService().status(jobId));
  } catch (error) {
    return jsonError(error);
  }
}
