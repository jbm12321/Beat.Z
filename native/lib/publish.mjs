import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { NativeBuildError } from './errors.mjs';

const execFileAsync = promisify(execFile);
const SAFE_BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u;
const SAFE_JOB_ID = /^[0-9a-f-]{36}$/u;

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new NativeBuildError('artifact_publish_unconfigured', `${name} must be configured for public VST3 delivery.`);
  return value.trim();
}

function publicBase(value) {
  let url;
  try {
    url = new URL(required(value, 'VST3_ARTIFACT_PUBLIC_URL'));
  } catch {
    throw new NativeBuildError('artifact_publish_unconfigured', 'VST3_ARTIFACT_PUBLIC_URL must be a valid HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new NativeBuildError('artifact_publish_unconfigured', 'VST3_ARTIFACT_PUBLIC_URL must be a clean HTTPS URL.');
  }
  return url.toString().replace(/\/+$/u, '');
}

export function publicArtifactDetails({ jobId, filename, bucket, publicUrl }) {
  if (!SAFE_JOB_ID.test(jobId)) throw new NativeBuildError('invalid_artifact', 'The VST3 job identifier is invalid.');
  if (!SAFE_BUCKET.test(bucket ?? '')) throw new NativeBuildError('artifact_publish_unconfigured', 'VST3_ARTIFACT_BUCKET must be a valid bucket name.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.vst3$/u.test(filename ?? '')) throw new NativeBuildError('invalid_artifact', 'The VST3 filename is invalid.');
  const objectKey = `builds/${jobId}/${filename}.zip`;
  return { objectKey, downloadUrl: `${publicBase(publicUrl)}/${objectKey}` };
}

function uploadEndpoint(supabaseUrl, bucket, objectKey) {
  let url;
  try {
    url = new URL(required(supabaseUrl, 'SUPABASE_URL'));
  } catch {
    throw new NativeBuildError('artifact_publish_unconfigured', 'SUPABASE_URL must be a valid HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new NativeBuildError('artifact_publish_unconfigured', 'SUPABASE_URL must be a clean HTTPS URL.');
  url.pathname = `${url.pathname.replace(/\/$/u, '')}/storage/v1/object/${bucket}/${objectKey}`;
  return url;
}

export async function publishVerifiedVst3Bundle(bundlePath, { jobId, filename, environment = process.env }) {
  const bucket = required(environment.VST3_ARTIFACT_BUCKET, 'VST3_ARTIFACT_BUCKET');
  const { objectKey, downloadUrl } = publicArtifactDetails({ jobId, filename, bucket, publicUrl: environment.VST3_ARTIFACT_PUBLIC_URL });
  const serviceKey = required(environment.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  const zipPath = join(tmpdir(), `beatz-${randomUUID()}.zip`);
  try {
    await execFileAsync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', bundlePath, zipPath], { timeout: 60_000 });
    const archive = await readFile(zipPath);
    const response = await fetch(uploadEndpoint(environment.SUPABASE_URL, bucket, objectKey), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'content-type': 'application/zip',
        'cache-control': 'public, max-age=31536000, immutable',
        'x-upsert': 'false',
      },
      body: archive,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new NativeBuildError('artifact_publish_failed', `Supabase Storage rejected the VST3 archive (${response.status}).`, { retryable: response.status >= 500 });
    return { objectKey, downloadUrl, archiveFilename: `${basename(filename)}.zip` };
  } finally {
    await rm(zipPath, { force: true });
  }
}
