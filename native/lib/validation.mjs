import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { NativeBuildError } from './errors.mjs';

const execFileAsync = promisify(execFile);

async function defaultRun(command, argumentsList) {
  try {
    const result = await execFileAsync(command, argumentsList, {
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, stdout: error?.stdout ?? '', stderr: error?.stderr ?? '' };
  }
}

export async function validateVst3Bundle(bundlePath, validatorPath, options = {}) {
  if (!isAbsolute(bundlePath) || !isAbsolute(validatorPath)) {
    throw new NativeBuildError('unsafe_path', 'Validator and VST3 bundle paths must be absolute.');
  }
  const result = await (options.run ?? defaultRun)(validatorPath, [bundlePath]);
  const output = `${result.stdout}\n${result.stderr}`;
  const summary = output.match(/Result:\s+(\d+) tests passed,\s+(\d+) tests failed/iu);
  const adapterErrors = /(?:^|\n)ERROR\s*:/u.test(output);
  if (!result.ok || !summary || Number(summary[2]) !== 0 || adapterErrors) {
    throw new NativeBuildError('vst3_validation_failed', 'Steinberg validation did not complete cleanly with zero adapter errors.');
  }
  return {
    testsPassed: Number(summary[1]),
    testsFailed: Number(summary[2]),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
