import { getVst3ExportService } from '@/src/features/vst3-export/server/runtime.ts';
import { jsonError, readLimitedJson } from '@/src/features/vst3-export/server/http.ts';

export async function POST(request: Request) {
  try {
    const body = await readLimitedJson(request) as { frozen?: unknown };
    return Response.json(await getVst3ExportService().submit(body.frozen as never), { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
