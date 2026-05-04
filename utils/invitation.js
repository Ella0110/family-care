const { calculateAge } = require('./profile-detail');

const INVITATION_MAX_PROFILE_SELECTION = 5;
const INVITATION_ROLE_LABELS = Object.freeze({
  viewer: '只看',
  collaborator: '共同记录',
});
const ANONYMOUS_NICKNAMES = new Set(['微信用户']);

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object' && value.$date) {
    return new Date(value.$date);
  }

  return new Date(value);
}

function trimText(value) {
  return String(value || '').trim();
}

function isAnonymousInvitationNickname(value) {
  return ANONYMOUS_NICKNAMES.has(trimText(value));
}

function buildInvitationNicknameInitial(value, fallback = '家') {
  const nickname = trimText(value);
  if (!nickname) {
    return fallback;
  }

  return nickname.slice(0, 1).toUpperCase();
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
}

function formatMeasuredAt(value, now = new Date()) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (isSameDay(date, now)) {
    return `今天 ${time}`;
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

function buildInvitationProfileLabel(profile, now = new Date()) {
  if (!profile) {
    return '未命名档案';
  }

  const name = trimText(profile.name) || '未命名档案';
  const age = calculateAge(profile.birthDate, now);
  const relation = trimText(profile.relation);
  const meta = [];

  if (age !== null) {
    meta.push(`${age} 岁`);
  }
  if (relation) {
    meta.push(relation);
  }

  return meta.length > 0 ? `${name}（${meta.join('，')}）` : name;
}

function buildLatestRecordSummary(record, now = new Date()) {
  const payload = record && record.payload;
  if (!payload || !payload.systolic || !payload.diastolic) {
    return '还没有记录';
  }

  const measuredAt = formatMeasuredAt(record.measuredAt, now);
  if (!measuredAt) {
    return `最近 ${payload.systolic}/${payload.diastolic}`;
  }

  return `最近 ${payload.systolic}/${payload.diastolic}，${measuredAt}`;
}

function buildLatestBpSummary(latestBp, now = new Date()) {
  if (!latestBp || !latestBp.systolic || !latestBp.diastolic) {
    return '还没有记录';
  }

  const measuredAt = formatMeasuredAt(latestBp.measuredAt, now);
  if (!measuredAt) {
    return `最近 ${latestBp.systolic}/${latestBp.diastolic}`;
  }

  return `最近 ${latestBp.systolic}/${latestBp.diastolic}，${measuredAt}`;
}

function buildInvitableProfiles({
  profiles = [],
  relationships = [],
  selectedProfileIds = [],
  getLatestRecord = () => null,
  now = new Date(),
} = {}) {
  const selectedSet = new Set(selectedProfileIds);

  return (relationships || [])
    .filter((relationship) => relationship && relationship.permissions && relationship.permissions.canInvite)
    .map((relationship) => {
      const profile = (profiles || []).find((item) => item && item._id === relationship.profileId);
      if (!profile) {
        return null;
      }

      const latestRecord = getLatestRecord(profile._id);

      return {
        profile,
        checked: selectedSet.has(profile._id),
        label: buildInvitationProfileLabel(profile, now),
        latestSummary: buildLatestRecordSummary(latestRecord, now),
      };
    })
    .filter(Boolean);
}

function buildDefaultInvitationMessage(selectedProfiles = []) {
  if (!Array.isArray(selectedProfiles) || selectedProfiles.length === 0) {
    return '想请你帮我一起关注家人的健康记录';
  }

  if (selectedProfiles.length === 1) {
    return `想请你帮我一起关注${selectedProfiles[0].name}的血压`;
  }

  return '想请你帮我一起关注家人的健康记录';
}

function buildInvitationShareTitle(inviterNickname, selectedProfiles = []) {
  const nickname = trimText(inviterNickname) || '家人';
  if (!Array.isArray(selectedProfiles) || selectedProfiles.length === 0) {
    return `${nickname} 邀请你查看家人的健康记录`;
  }

  if (selectedProfiles.length === 1) {
    return `${nickname} 邀请你查看${selectedProfiles[0].name}的健康记录`;
  }

  return `${nickname} 邀请你查看家人的健康记录`;
}

function buildInvitationExpiryText(expiresAt, now = new Date()) {
  const expireDate = toDate(expiresAt);
  if (Number.isNaN(expireDate.getTime())) {
    return '有效期未知';
  }

  const diffMs = expireDate.getTime() - now.getTime();
  if (diffMs <= 0) {
    return '已过期';
  }

  const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (totalHours <= 0) {
    return '1 小时内过期';
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days <= 0) {
    return `${hours} 小时后过期`;
  }

  return `${days} 天 ${hours} 小时后过期`;
}

function buildInvitationPermissionSummary(defaultRole) {
  if (defaultRole === 'collaborator') {
    return {
      label: INVITATION_ROLE_LABELS.collaborator,
      description: '家人可以代为录入血压、添加用药，适合共同照顾。',
      enabled: ['查看血压记录', '查看用药情况', '录入血压', '管理用药'],
      disabled: ['删除档案'],
    };
  }

  return {
    label: INVITATION_ROLE_LABELS.viewer,
    description: '家人能查看血压和用药情况，但不能修改数据。',
    enabled: ['查看血压记录', '查看用药情况'],
    disabled: ['录入或修改数据'],
  };
}

function normalizeGrantedUserProfile(userInfo) {
  if (!userInfo || typeof userInfo !== 'object') {
    return null;
  }

  const nickname = trimText(userInfo.nickName || userInfo.nickname);
  if (!nickname || isAnonymousInvitationNickname(nickname)) {
    return null;
  }

  return {
    nickname,
    avatarUrl: trimText(userInfo.avatarUrl) || '',
  };
}

function getInviteLaunchToken(options = {}) {
  if (!options || options.path !== 'pages/invite-accept/invite-accept') {
    return null;
  }

  return trimText(options.query && options.query.token) || null;
}

module.exports = {
  INVITATION_MAX_PROFILE_SELECTION,
  INVITATION_ROLE_LABELS,
  buildInvitationProfileLabel,
  buildLatestRecordSummary,
  buildLatestBpSummary,
  buildInvitableProfiles,
  buildDefaultInvitationMessage,
  buildInvitationShareTitle,
  buildInvitationExpiryText,
  buildInvitationPermissionSummary,
  normalizeGrantedUserProfile,
  getInviteLaunchToken,
  isAnonymousInvitationNickname,
  buildInvitationNicknameInitial,
};
