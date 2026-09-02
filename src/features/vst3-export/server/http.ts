import { Vst3ExportError } from './service.ts';

export function workerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

export function jsonError(error: unknown) {
  if (error instanceof Vst3ExportError) return Response.json({ error: error.message, code: error.code }, { status: error.httpStatus });
  return Response.json({ error: 'The VST3 request could not be completed.', code: 'invalid_request' }, { status: 400 });
}

export async function readLimitedJson(request: Request, maximumBytes = 512 * 1024) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maximumBytes) throw new Error('The VST3 request is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error('The VST3 request is too large.');
  return JSON.parse(text) as unknown;
}
