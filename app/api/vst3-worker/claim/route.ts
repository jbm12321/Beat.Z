import { getVst3ExportService } from '@/src/features/vst3-export/server/runtime.ts';
import { jsonError, workerToken } from '@/src/features/vst3-export/server/http.ts';

export async function POST(request: Request) {
  try {
    return Response.json({ job: await getVst3ExportService().claim(workerToken(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
