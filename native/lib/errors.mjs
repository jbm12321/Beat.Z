export class NativeBuildError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'NativeBuildError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.diagnostics = options.diagnostics;
    this.publicMessage = options.publicMessage;
  }
}

const PUBLIC_FAILURE_MESSAGES = Object.freeze({
  artifact_conflict: 'The verified VST3 could not be saved.',
  artifact_publish_failed: 'The verified VST3 could not be published.',
  artifact_publish_unconfigured: 'The Mac worker is not configured to publish VST3 downloads.',
  codesign_failed: 'The VST3 did not pass its required native verification.',
  dependency_bridge_conflict: 'The VST3 could not be built by the Mac worker.',
  faust_codegen_failed: 'The VST3 could not be built by the Mac worker.',
  invalid_artifact: 'The native build did not produce a valid VST3.',
  invalid_build_request: 'This queued build is no longer compatible. Submit a fresh build.',
  invalid_builder_endpoint: 'The Mac worker is not configured for the live Site.',
  native_compile_failed: 'The VST3 could not be built by the Mac worker.',
  native_configure_failed: 'The VST3 could not be built by the Mac worker.',
  native_toolchain_mismatch: 'The Mac build worker is not ready. Start it again after updating its toolchain.',
  parity_host_build_failed: 'Browser/VST3 parity could not be verified.',
  parity_render_failed: 'Browser/VST3 parity could not be verified.',
  parity_render_invalid: 'Browser/VST3 parity could not be verified.',
  source_fingerprint_mismatch: 'This queued build uses an outdated DSP revision. Submit a fresh build.',
  state_restore_failed: 'The VST3 did not pass its required native verification.',
  template_error: 'The VST3 could not be built by the Mac worker.',
  unsafe_path: 'The Mac worker is not configured safely for this build.',
  vst3_validation_failed: 'The VST3 did not pass its required native verification.',
});

function publicMessageFor(error) {
  if (error.publicMessage) return error.publicMessage;
  if (error.code === 'parity_mismatch') return error.message;
  return PUBLIC_FAILURE_MESSAGES[error.code] ?? 'The native build did not pass its required checks.';
}

export function formatNativeBuildDiagnostics(error) {
  if (!(error instanceof NativeBuildError)) return '';
  const privateMessage = publicMessageFor(error) !== error.message ? { message: error.message } : {};
  if (!error.diagnostics && Object.keys(privateMessage).length === 0) return '';
  return `Native build diagnostic: ${JSON.stringify({ code: error.code, ...privateMessage, ...error.diagnostics })}`;
}

export function asNativeBuildFailure(error) {
  if (error instanceof NativeBuildError) {
    return { code: error.code, message: publicMessageFor(error), retryable: error.retryable };
  }
  return {
    code: 'native_builder_internal_error',
    message: 'The native builder stopped because of an internal error.',
    retryable: false,
  };
}
