const ERROR_MESSAGES = Object.freeze({
  NETWORK: '网络异常，请稍后再试',
  AUTH_REQUIRED: '登录状态异常，请重试',
  PERMISSION_DENIED: '没有操作权限',
  INVALID_ARGUMENT: '输入有误，请检查',
  USER_NOT_FOUND: '用户不存在',
  PROFILE_NOT_FOUND: '档案不存在',
  RECORD_NOT_FOUND: '记录不存在',
  MEDICATION_NOT_FOUND: '用药记录不存在',
  LAST_OWNER_CANNOT_LEAVE: '你是该档案唯一的管理员，请先转让管理员或删除档案',
  NICKNAME_REQUIRED: '请先填写昵称',
  INVITATION_EXPIRED: '这个邀请已经过期了',
  INVITATION_USED: '这个邀请已经被使用',
  INVITATION_REVOKED: '邀请人撤销了这次邀请',
  INVITATION_NOT_FOUND: '邀请链接无效',
  ALREADY_MEMBER: '你已经是这个档案的成员',
  CANNOT_INVITE_SELF: '不能接受自己发出的邀请',
  CANNOT_TRANSFER_TO_SELF: '不能转让给自己',
  INVALID_PHONE: '请输入正确的手机号',
  INVALID_EMERGENCY_CONTACT: '紧急联系人信息不完整',
  NOT_A_MEMBER: '你不是该档案的成员',
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
