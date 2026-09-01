import { isAbsolute, relative, resolve, sep } from 'node:path';
import { NativeBuildError } from './errors.mjs';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export function assertSafeId(value, label = 'Identifier') {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new NativeBuildError('invalid_build_request', `${label} contains unsupported characters.`);
  }
  return value;
}

export function assertSha256(value, label = 'SHA-256') {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new NativeBuildError('invalid_build_request', `${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

export function assertDisplayName(value, label, maxLength = 64) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    CONTROL_CHARACTERS.test(value)
  ) {
    throw new NativeBuildError(
      'invalid_build_request',
      `${label} must contain 1-${maxLength} printable characters.`,
    );
  }
  return value.trim();
}

export function safeArtifactStem(value) {
  const normalized = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^[._-]+|[._-]+$/gu, '')
    .replace(/[-_.]{2,}/gu, '-')
    .slice(0, 48);
  return normalized || 'Beat-Z-Effect';
}

export function resolveWithin(root, ...segments) {
  if (typeof root !== 'string' || !isAbsolute(root)) {
    throw new NativeBuildError('unsafe_path', 'The builder root must be an absolute path.');
  }
  if (segments.some((segment) => typeof segment !== 'string' || segment.includes('\0'))) {
    throw new NativeBuildError('unsafe_path', 'The requested path contains an invalid segment.');
  }
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, ...segments);
  const child = relative(absoluteRoot, candidate);
  if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new NativeBuildError('unsafe_path', 'The requested path escapes its builder root.');
  }
  return candidate;
}

export function assertHttpsEndpoint(value, { allowLoopbackHttp = false } = {}) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new NativeBuildError('invalid_builder_endpoint', 'The builder endpoint is not a valid URL.');
  }
  const loopback = endpoint.hostname === '127.0.0.1' || endpoint.hostname === 'localhost' || endpoint.hostname === '::1';
  if (endpoint.protocol !== 'https:' && !(allowLoopbackHttp && loopback && endpoint.protocol === 'http:')) {
    throw new NativeBuildError('invalid_builder_endpoint', 'The builder endpoint must use HTTPS.');
  }
  if (endpoint.username || endpoint.password || endpoint.hash || endpoint.search) {
    throw new NativeBuildError('invalid_builder_endpoint', 'The builder endpoint cannot contain credentials, query parameters, or a fragment.');
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/u, '');
  return endpoint;
}
