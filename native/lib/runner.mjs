import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { saveVerifiedVst3Bundle } from './artifact.mjs';
import { compileNativeVst3Sources } from './compile.mjs';
import { inspectNativeToolchain } from './doctor.mjs';
import { NativeBuildError } from './errors.mjs';
import { createNativeGenerationPlan, generatePinnedFaustHeaders, materializeNativeTemplates } from './generation.mjs';
import { runVst3Parity, verifyVst3StateRoundTrip } from './parity.mjs';
import { resolveWithin } from './safety.mjs';
import { signAndVerifyVst3 } from './signing.mjs';
import { loadToolchainLock, validateNativeBuildRequest } from './spec.mjs';
import { validateVst3Bundle } from './validation.mjs';

function workRoot(options) {
  const root = resolve(options.workRoot ?? options.environment?.BEATZ_NATIVE_WORK_ROOT ?? resolve(tmpdir(), 'Beat.Z-native-builder'));
  if (!isAbsolute(root)) throw new NativeBuildError('unsafe_path', 'Native work root must be absolute.');
  return root;
}

export async function runNativeBuild(request, options = {}) {
  const lock = options.lock ?? await loadToolchainLock(options.lockPath);
  validateNativeBuildRequest(request, lock);
  await options.onPhase?.('preparing', 'Checking the pinned Mac toolchain.');
  const doctor = options.doctor ?? await inspectNativeToolchain({ lock, repositoryRoot: options.repositoryRoot });
  const root = workRoot(options);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const workspaceRoot = await mkdtemp(resolveWithin(root, 'job-'));
  try {
    const plan = await createNativeGenerationPlan(request, lock, {
      repositoryRoot: options.repositoryRoot,
      workspaceRoot,
      exportRoot: options.exportRoot,
      environment: options.environment,
    });
    await options.onPhase?.('compiling', 'Generating Faust C++ and compiling the VST3.');
    await materializeNativeTemplates(plan);
    await generatePinnedFaustHeaders(plan);
    const compiled = await compileNativeVst3Sources({ plan, doctor });
    const signing = await signAndVerifyVst3(compiled.bundlePath);
    await options.onPhase?.('validating', 'Running Steinberg validation and state restoration.');
    const validator = await validateVst3Bundle(compiled.bundlePath, doctor.paths.validatorPath);
    const stateRestore = await verifyVst3StateRoundTrip(compiled.bundlePath, doctor);
    await options.onPhase?.('parity', 'Comparing the actual VST3 with the committed browser WASM.');
    const parity = await runVst3Parity(request, compiled.bundlePath, workspaceRoot, doctor, lock);
    await options.onPhase?.('saving', 'Saving the verified bundle in Downloads.');
    const saved = await saveVerifiedVst3Bundle(compiled.bundlePath, plan.paths.exportRoot, plan.artifact.filename);
    return {
      artifact: {
        filename: plan.artifact.filename,
        path: saved.path,
        bundleSha256: saved.bundleSha256,
        architecture: saved.architecture,
        dspHash: request.dspHash,
      },
      evidence: {
        validatorPassed: validator.testsFailed === 0,
        stateRestorePassed: stateRestore.passed,
        parityPassed: parity.every((sampleRate) => sampleRate.passed),
        signing,
        validator: { testsPassed: validator.testsPassed, testsFailed: validator.testsFailed },
        parity,
      },
    };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}
