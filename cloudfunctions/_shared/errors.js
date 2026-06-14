const ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  RELATIONSHIP_NOT_FOUND: 'RELATIONSHIP_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  FORBIDDEN: 'FORBIDDEN',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  MEDICATION_NOT_FOUND: 'MEDICATION_NOT_FOUND',
  INVITATION_NOT_FOUND: 'INVITATION_NOT_FOUND',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVITATION_USED: 'INVITATION_USED',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  NICKNAME_REQUIRED: 'NICKNAME_REQUIRED',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  CANNOT_INVITE_SELF: 'CANNOT_INVITE_SELF',
  LAST_OWNER_CANNOT_LEAVE: 'LAST_OWNER_CANNOT_LEAVE',
  RESTORE_EXPIRED: 'RESTORE_EXPIRED',
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_EMERGENCY_CONTACT: 'INVALID_EMERGENCY_CONTACT',
});

class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Object|null} [details=null]
 * @returns {AppError}
 */
function createError(code, message, details = null) {
  return new AppError(code, message, details);
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
    const details = {};
    Object.keys(error).forEach((key) => {
      if (key !== 'code' && key !== 'message' && key !== 'name') {
        if (
          key === 'details' &&
          error[key] &&
          typeof error[key] === 'object' &&
          !Array.isArray(error[key])
        ) {
          Object.assign(details, error[key]);
          return;
        }

        details[key] = error[key];
      }
    });
    return createError(
      String(error.code),
      String(error.message),
      Object.keys(details).length > 0 ? details : null,
    );
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
  const result = {
    success: false,
    code: normalized.code,
    message: normalized.message,
  };

  if (normalized.details && typeof normalized.details === 'object') {
    Object.assign(result, normalized.details);
  }

  return result;
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
