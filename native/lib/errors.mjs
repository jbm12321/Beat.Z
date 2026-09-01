export class NativeBuildError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'NativeBuildError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
  }
}

export function asNativeBuildFailure(error) {
  if (error instanceof NativeBuildError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: 'native_builder_internal_error',
    message: 'The native builder stopped because of an internal error.',
    retryable: false,
  };
}
