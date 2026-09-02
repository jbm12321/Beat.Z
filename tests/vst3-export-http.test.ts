import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonError, readLimitedJson } from '../src/features/vst3-export/server/http.ts';

test('unexpected VST3 server errors do not expose internal details', async () => {
  const response = jsonError(new Error('internal database and secret details'));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'The VST3 request could not be completed.',
    code: 'invalid_request',
  });
});

test('VST3 JSON readers reject declared and actual oversized payloads', async () => {
  await assert.rejects(
    () => readLimitedJson(new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-length': '100' },
      body: '{}',
    }), 32),
    /too large/i,
  );

  await assert.rejects(
    () => readLimitedJson(new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(64) }),
    }), 32),
    /too large/i,
  );
});
