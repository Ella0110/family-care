const {
    buildInvitationNicknameInitial,
    isAnonymousInvitationNickname,
} = require("./invitation");

function trimText(value) {
    return String(value || "").trim();
}

function normalizeNicknameInput(value) {
    return trimText(value).slice(0, 20);
}

function hasConfiguredUserAvatar(user) {
    return Boolean(trimText(user && user.avatarUrl));
}

function buildAvatarFallback(nickname) {
    return buildInvitationNicknameInitial(nickname, "我");
}

function buildUserProfileForm(user) {
    const nickname = normalizeNicknameInput(user && user.nickname);
    const safeNickname = isAnonymousInvitationNickname(nickname) ? "" : nickname;

    return {
        nickname: safeNickname,
        avatarUrl: trimText(user && user.avatarUrl),
        avatarFallback: buildAvatarFallback(safeNickname),
    };
}

function isLocalAvatarPath(value) {
    const normalized = trimText(value);
    return (
        /^wxfile:\/\//i.test(normalized) ||
        /^https?:\/\/tmp\//i.test(normalized) ||
        /^\/(private\/)?var\//i.test(normalized) ||
        /^\/tmp\//i.test(normalized)
    );
}

function getAvatarFileExtension(filePath) {
    const normalized = String(filePath || "").split("?")[0];
    const match = normalized.match(/\.(jpg|jpeg|png|webp)$/i);
    return match ? match[1].toLowerCase() : "png";
}

async function uploadAvatarIfNeeded(avatarUrl, userId) {
    const normalized = trimText(avatarUrl);
    if (!normalized || !isLocalAvatarPath(normalized)) {
        return normalized;
    }

    if (!wx.cloud || typeof wx.cloud.uploadFile !== "function") {
        throw new Error("CLOUD_UPLOAD_UNAVAILABLE");
    }

    const extension = getAvatarFileExtension(normalized);
    const cloudPath = [
        "user-avatars",
        userId || "anonymous",
        `${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${extension}`,
    ].join("/");

    const result = await wx.cloud.uploadFile({
        cloudPath,
        filePath: normalized,
    });

    if (!result || !result.fileID) {
        throw new Error("AVATAR_UPLOAD_FAILED");
    }

    return result.fileID;
}

function validateUserProfileForm(form) {
    const nickname = normalizeNicknameInput(form && form.nickname);
    if (!nickname || isAnonymousInvitationNickname(nickname)) {
        return "请填写有效昵称";
    }

    if (nickname.length > 20) {
        return "昵称不能超过 20 个字";
    }

    return "";
}

module.exports = {
    buildAvatarFallback,
    buildUserProfileForm,
    hasConfiguredUserAvatar,
    normalizeNicknameInput,
    trimText,
    uploadAvatarIfNeeded,
    validateUserProfileForm,
};
