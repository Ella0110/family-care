const ERROR_MESSAGES = Object.freeze({
  NETWORK: '网络异常，请稍后再试',
  AUTH_REQUIRED: '登录状态异常，请重试',
  PERMISSION_DENIED: '没有操作权限',
  INVALID_ARGUMENT: '输入有误，请检查',
  USER_NOT_FOUND: '用户不存在',
  PROFILE_NOT_FOUND: '档案不存在',
  RECORD_NOT_FOUND: '记录不存在',
  MEDICATION_NOT_FOUND: '用药记录不存在',
  INVALID_PHONE: '请输入正确的手机号',
  INVALID_EMERGENCY_CONTACT: '紧急联系人信息不完整',
  NOT_IMPLEMENTED: '该功能正在开发中',
  INTERNAL_ERROR: '服务异常，请稍后再试',
  UNKNOWN: '操作失败，请重试',
});

function getErrorCode(error) {
  if (error && typeof error.code === 'string' && error.code) {
    return error.code;
  }

  return 'UNKNOWN';
}

function getErrorMessage(error, overrides = {}) {
  const code = getErrorCode(error);

  if (overrides && typeof overrides[code] === 'string') {
    return overrides[code];
  }

  return ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN;
}

module.exports = {
  ERROR_MESSAGES,
  getErrorCode,
  getErrorMessage,
};
