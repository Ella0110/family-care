const ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  RELATIONSHIP_NOT_FOUND: 'RELATIONSHIP_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  MEDICATION_NOT_FOUND: 'MEDICATION_NOT_FOUND',
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_EMERGENCY_CONTACT: 'INVALID_EMERGENCY_CONTACT',
});

class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {AppError}
 */
function createError(code, message) {
  return new AppError(code, message);
}

/**
 * @param {string} message
 * @returns {AppError}
 */
function invalidArgument(message) {
  return createError(ERROR_CODES.INVALID_ARGUMENT, message);
}

/**
 * @param {string} message
 * @returns {AppError}
 */
function notImplemented(message) {
  return createError(ERROR_CODES.NOT_IMPLEMENTED, message);
}

/**
 * @param {unknown} error
 * @returns {AppError}
 */
function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error && typeof error === 'object' && error.code && error.message) {
    return createError(String(error.code), String(error.message));
  }

  if (error instanceof Error) {
    return createError(ERROR_CODES.INTERNAL_ERROR, error.message || 'Internal error');
  }

  return createError(ERROR_CODES.INTERNAL_ERROR, 'Internal error');
}

/**
 * @param {unknown} error
 * @returns {{ success: false, code: string, message: string }}
 */
function toErrorResult(error) {
  const normalized = normalizeError(error);
  return {
    success: false,
    code: normalized.code,
    message: normalized.message,
  };
}

module.exports = {
  ERROR_CODES,
  AppError,
  createError,
  invalidArgument,
  notImplemented,
  normalizeError,
  toErrorResult,
};
