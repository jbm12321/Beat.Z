import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NativeBuildError } from './errors.mjs';

const execFileAsync = promisify(execFile);

async function run(argumentsList) {
  try {
    const result = await execFileAsync('codesign', argumentsList, { encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, stdout: error?.stdout ?? '', stderr: error?.stderr ?? '' };
  }
}

export async function signAndVerifyVst3(bundlePath, options = {}) {
  const execute = options.run ?? run;
  const signed = await execute(['--force', '--deep', '--sign', '-', bundlePath]);
  if (!signed.ok) throw new NativeBuildError('codesign_failed', `Ad-hoc signing failed: ${signed.stderr || signed.stdout}`);
  const verified = await execute(['--verify', '--deep', '--strict', '--verbose=2', bundlePath]);
  if (!verified.ok) throw new NativeBuildError('codesign_failed', `Strict code-signature verification failed: ${verified.stderr || verified.stdout}`);
  return { passed: true, mode: 'ad-hoc' };
}
