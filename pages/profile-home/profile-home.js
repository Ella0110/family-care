const { store } = require("../../store/index");
const userService = require("../../services/user-service");
const recordService = require("../../services/record-service");
const medicationService = require("../../services/medication-service");
const memberService = require("../../services/member-service");
const profileService = require("../../services/profile-service");
const invitationService = require("../../services/invitation-service");
const { getErrorMessage } = require("../../utils/error-messages");
const {
    getBPStatusDisplay,
    getReferenceLines,
} = require("../../utils/bp-status");
const {
    DEFAULT_FONT_SCALE,
    FONT_SCALE_OPTIONS,
    FONT_SCALE_LABELS,
    isValidFontScale,
    normalizeFontScale,
    getFontScaleLabel,
    syncFontData,
} = require("../../utils/font-scale");
const { getAppLoginStatus } = require("../../utils/app-login-status");
const {
    SUBSCRIBE_ALERT_TEMPLATE_ID,
    requestAlertSubscription,
    showSubscribeBanModal,
} = require("../../utils/alert-subscription");
const {
    findProfileById,
    removeProfileFromStore,
} = require("../../utils/profile-store");
const {
    getCurrentRelationship,
    isOwner,
    canWrite,
    canInvite,
    canManage,
    canEditProfile,
} = require("../../utils/permission-helpers");
const {
    calculateAge,
    formatPhoneWithSpaces,
} = require("../../utils/profile-detail");
const {
    buildInvitationNicknameInitial,
    normalizeGrantedUserProfile,
    isAnonymousInvitationNickname,
} = require("../../utils/invitation");

const REFRESH_TTL_MS = 5 * 1000;
const MEMBER_STALE_THRESHOLD = 30 * 1000;
const STALE_REFRESH_TTL_MS = 30 * 1000;
const PULL_DOWN_REFRESH_THROTTLE_MS = 2 * 1000;

const MEMBER_ROLE_LABELS = {
    owner: "管理员",
    collaborator: "共同记录",
    viewer: "仅查看",
};

const MEMBER_ROLE_ORDER = {
    owner: 0,
    collaborator: 1,
    viewer: 2,
};

function pad(value) {
    return String(value).padStart(2, "0");
}

function getCurrentFontScale() {
    const app = getApp();
    return normalizeFontScale(
        app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE,
    );
}

function formatMeasuredAt(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "时间未知";
    }

    const now = new Date();
    const yesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
    );
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    ) {
        return `今天 ${time}`;
    }

    if (
        date.getFullYear() === yesterday.getFullYear() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getDate() === yesterday.getDate()
    ) {
        return `昨天 ${time}`;
    }

    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function buildProfilesSignature(profiles) {
    return (Array.isArray(profiles) ? profiles : [])
        .map((profile) => {
            if (!profile) {
                return "";
            }

            return [
                profile._id || "",
                profile.name || "",
                profile.relation || "",
                profile.birthDate || "",
            ].join(":");
        })
        .join("|");
}

function getSubscribeAuthStatus(relationship) {
    return relationship && typeof relationship.subscribeAuthStatus === "string"
        ? relationship.subscribeAuthStatus
        : "";
}

function isSubscribeAlertsEnabled(relationship) {
    return getSubscribeAuthStatus(relationship) === "declined"
        ? false
        : Boolean(relationship && relationship.subscribeAlerts);
}

function shouldShowSubscribeGuide(relationship) {
    return Boolean(
        relationship &&
            relationship.subscribeAlerts === true &&
            getSubscribeAuthStatus(relationship) === "pending",
    );
}

function shouldSilentlyRefreshSubscribeAlert(relationship) {
    return Boolean(
        relationship &&
            relationship.subscribeAlerts === true &&
            getSubscribeAuthStatus(relationship) === "authorized",
    );
}

function getSubscribeGuideInviterName(relationship) {
    const inviterName = String(
        relationship && relationship.inviterNickname
            ? relationship.inviterNickname
            : "",
    ).trim();
    return inviterName;
}

function findMemberNicknameByUserId(members, userId) {
    if (!userId) {
        return "";
    }

    const inviterMember = (Array.isArray(members) ? members : []).find(
        (member) => member && member.user && member.user._id === userId,
    );
    const nickname = String(
        inviterMember &&
            inviterMember.user &&
            inviterMember.user.nickname
            ? inviterMember.user.nickname
            : "",
    ).trim();
    return nickname;
}

function findManagerNickname(members) {
    const managerMember = (Array.isArray(members) ? members : []).find(
        (member) =>
            member &&
            member.user &&
            ((member.relationship && member.relationship.role === "owner") ||
                (member.relationship &&
                    member.relationship.permissions &&
                    member.relationship.permissions.canManage === true)),
    );
    return String(
        managerMember &&
            managerMember.user &&
            managerMember.user.nickname
            ? managerMember.user.nickname
            : "",
    ).trim();
}

function findSubscribeGuideInviterNameFromMembers(members, relationship) {
    const invitedBy = relationship && relationship.invitedBy;
    const inviterName = findMemberNicknameByUserId(members, invitedBy);
    if (inviterName) {
        return inviterName;
    }

    return findManagerNickname(members);
}

function buildLatestRecordDisplay(record, profile) {
    if (!record) {
        return null;
    }

    const payload = record.payload || {};
    const referenceLines = getReferenceLines(
        profile &&
            profile.settings &&
            profile.settings.bp &&
            profile.settings.bp.referenceLines,
    );
    const status = getBPStatusDisplay(
        payload.systolic,
        payload.diastolic,
        referenceLines,
    );

    return {
        bpText: `${payload.systolic} / ${payload.diastolic} mmHg`,
        heartRateText: payload.heartRate ? `${payload.heartRate} bpm` : "--",
        measuredAtText: formatMeasuredAt(record.measuredAt),
        statusText: status.summaryText,
        statusClassName: status.className,
        isAbnormal: status.level !== "normal",
    };
}

function buildMedicationSummary(activeMedications, limit = 2) {
    const names = (Array.isArray(activeMedications) ? activeMedications : [])
        .map((item) => String((item && item.drug) || "").trim())
        .filter(Boolean)
        .slice(0, limit);

    return names.join("、");
}

function buildEmergencyText(profile) {
    const emergencyName = String(
        (profile &&
            profile.emergencyContact &&
            profile.emergencyContact.name) ||
            "",
    ).trim();
    const emergencyPhone = String(
        (profile &&
            profile.emergencyContact &&
            profile.emergencyContact.phone) ||
            "",
    ).trim();

    if (!emergencyName || !emergencyPhone) {
        return "";
    }

    return `${emergencyName} · ${formatPhoneWithSpaces(emergencyPhone)}`;
}

function buildMemberItems(members, currentUserId) {
    return (Array.isArray(members) ? members : [])
        .map((member) => {
            const user = member.user || {};
            const relationship = member.relationship || {};
            const isSelf = Boolean(currentUserId && user._id === currentUserId);
            const role = relationship.role || "";
            let displayName = user.nickname || "未命名";
            if (isSelf) {
                displayName = role === "owner" ? "我" : "我";
            }

            return {
                relationshipId: relationship._id || "",
                userId: user._id || "",
                user,
                relationship,
                avatarUrl: user.avatarUrl || "",
                avatarFallback: buildInvitationNicknameInitial(
                    user.nickname,
                    isSelf ? "我" : "家",
                ),
                nickname: user.nickname || "",
                displayName,
                roleLabel: MEMBER_ROLE_LABELS[role] || role,
                role,
                isSelf,
            };
        })
        .sort((left, right) => {
            if (left.isSelf !== right.isSelf) {
                return left.isSelf ? -1 : 1;
            }

            const leftOrder = Object.prototype.hasOwnProperty.call(
                MEMBER_ROLE_ORDER,
                left.role,
            )
                ? MEMBER_ROLE_ORDER[left.role]
                : Number.MAX_SAFE_INTEGER;
            const rightOrder = Object.prototype.hasOwnProperty.call(
                MEMBER_ROLE_ORDER,
                right.role,
            )
                ? MEMBER_ROLE_ORDER[right.role]
                : Number.MAX_SAFE_INTEGER;

            if (leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }

            return left.displayName.localeCompare(
                right.displayName,
                "zh-Hans-CN",
            );
        });
}

function buildInviteShareTitle(inviterNickname, profileName) {
    const inviter = String(inviterNickname || "").trim() || "家人";
    const profile = String(profileName || "").trim() || "家人";
    return `${inviter}邀请你一起关注${profile}的血压健康`;
}

function trimText(value) {
    return String(value || "").trim();
}

function isValidInviteNickname(value) {
    const nickname = trimText(value);
    return Boolean(nickname) && !isAnonymousInvitationNickname(nickname);
}

function getInviteNicknameFromUser(user) {
    const normalized = normalizeGrantedUserProfile({
        nickname: user && user.nickname,
        avatarUrl: user && user.avatarUrl,
    });
    return normalized ? normalized.nickname : "";
}

Page({
    data: {
        fontScale: DEFAULT_FONT_SCALE,
        fs: {},
        pageReady: false,
        _lastProfileId: "",
        hasProfile: false,
        profiles: [],
        currentProfileId: "",
        profileTitle: "来自儿女的关心",
        profileName: "",
        profileInitial: "家",
        profileAgeText: "",
        profileBirthYearText: "",
        errorText: "",
        showProfileSwitcher: false,
        canWriteCurrentProfile: false,
        canInviteCurrentProfile: false,
        canManageCurrentProfile: false,
        canEditCurrentProfile: false,
        relationshipRole: "",
        activeRelationshipId: "",
        activeRelationshipSubscribeAlerts: true,
        latestRecordDisplay: null,
        hasLatestRecord: false,
        hasMedicationSummary: false,
        medicationText: "",
        medicationCount: 0,
        medicationShortcutText: "添加长期用药记录",
        emergencyText: "",
        memberItems: [],
        memberCount: 0,
        showMemberPanel: false,
        selectedMember: null,
        showEditPanel: false,
        showInviteDialog: false,
        pendingInvitationToken: "",
        showNicknameInput: false,
        inviteNickname: "",
        inviteNicknameDraft: "",
        isSavingInviteNickname: false,
        isPreparingInvitation: false,
        showSubscribeGuide: false,
        subscribeGuideInviterName: "",
        subscribeGuideProfileName: "",
        fontScaleLabel: getFontScaleLabel(DEFAULT_FONT_SCALE),
        selectedFontScale: DEFAULT_FONT_SCALE,
        fontScaleOptions: FONT_SCALE_OPTIONS.map((value) => ({
            value,
            label: FONT_SCALE_LABELS[value],
        })),
        isDeletingProfile: false,
    },

    onLoad() {
        this.currentUserId = store.getState().user && store.getState().user._id;
        this.requestId = 0;
        this.fontScaleRequestId = 0;
        this.lastRefreshAt = 0;
        this.lastManualRefreshAt = 0;
        this.lastLoadedProfileId = "";
        this.lastSeenProfileId = store.getState().currentProfileId || "";
        this.lastLoginReady = getAppLoginStatus().isLoginReady;
        this.lastProfileMetaSignature = "";
        this.memberCache = {};
        this.latestRecord = null;
        this.activeMedications = [];
        this.historicalMedications = [];
        this.activeLoadPromise = null;
        this.activeRefreshPromise = null;
        this.isSubscribeGuideSubmitting = false;
        this.subscribeGuideInviterLookupToken = 0;
        this._silentSubscribeDone = false;

        this.syncFontScale();
        this.syncProfileMeta();

        this._unsubscribe = store.subscribe((nextState) => {
            const loginStatus = getAppLoginStatus();
            const nextProfileId = nextState.currentProfileId || "";

            if (!loginStatus.isLoginReady) {
                this.lastLoginReady = false;
                return;
            }

            const loginJustFinished =
                loginStatus.isLoginReady && !this.lastLoginReady;
            this.lastLoginReady = loginStatus.isLoginReady;

            if (loginJustFinished) {
                this.syncProfileMeta();
                const resolvedProfileId =
                    store.getState().currentProfileId || "";
                if (resolvedProfileId && resolvedProfileId !== nextProfileId) {
                    return;
                }
                this.lastSeenProfileId = resolvedProfileId || nextProfileId;
                this.loadPageData({ force: true, resetReady: true });
                return;
            }

            if (nextProfileId !== this.lastSeenProfileId) {
                this.syncProfileMeta();
                const resolvedProfileId =
                    store.getState().currentProfileId || "";
                if (resolvedProfileId && resolvedProfileId !== nextProfileId) {
                    return;
                }
                this.lastSeenProfileId = resolvedProfileId || nextProfileId;
                this.loadPageData({ force: true, resetReady: true });
                return;
            }

            this.syncProfileMeta();
        });
    },

    onShow() {
        const tabBar =
            typeof this.getTabBar === "function" ? this.getTabBar() : null;
        if (tabBar) {
            tabBar.setData({
                selectedPath: "pages/profile-home/profile-home",
            });
        }

        this.syncTabBarVisibility();
        this.syncFontScale();
        const loginStatus = getAppLoginStatus();
        this.lastLoginReady = loginStatus.isLoginReady;

        if (!loginStatus.isLoginReady) {
            this.enterPageLoading();
            return;
        }

        const profileId = store.getState().currentProfileId || "";
        const memberRefreshAt = profileId
            ? store.getLastRefreshAt("members", profileId)
            : 0;
        const membersStale = profileId
            ? store.isStale("members", profileId, MEMBER_STALE_THRESHOLD)
            : true;
        const app = getApp();
        const memberListDirty =
            app && typeof app.hasPendingMemberListRefresh === "function"
                ? app.hasPendingMemberListRefresh()
                : Boolean(app && app.globalData && app.globalData.memberListDirty);

        this.syncProfileMeta();
        this.syncSubscribeGuideState();
        this.refreshSubscribeAlertQuotaSilently();
        if (this.activeLoadPromise || this.activeRefreshPromise) {
            return;
        }

        if (memberListDirty) {
            if (
                app &&
                typeof app.consumePendingMemberListRefresh === "function"
            ) {
                app.consumePendingMemberListRefresh();
            } else if (app && app.globalData) {
                app.globalData.memberListDirty = false;
            }

            this.refreshPageData({ silent: true }).catch((error) => {
                console.error(
                    "[profile-home] onShow dirty member refresh failed",
                    error,
                );
            });
            return;
        }

        const shouldResetReady =
            !this.data.pageReady || profileId !== this.data._lastProfileId;
        if (!shouldResetReady && this.shouldRefreshOnShow(profileId)) {
            this.refreshPageData({ silent: true }).catch((error) => {
                console.error("[profile-home] onShow silent refresh failed", error);
            });
            return;
        }

        this.loadPageData({
            force: false,
            resetReady: shouldResetReady,
        });
    },

    async onPullDownRefresh() {
        const now = Date.now();
        if (
            this.lastManualRefreshAt &&
            now - this.lastManualRefreshAt < PULL_DOWN_REFRESH_THROTTLE_MS
        ) {
            wx.stopPullDownRefresh();
            return;
        }

        this.lastManualRefreshAt = now;

        try {
            await this.refreshPageData({ silent: true });
        } catch (error) {
            console.error("[profile-home] pull-down refresh failed", error);
        } finally {
            wx.stopPullDownRefresh();
        }
    },

    onUnload() {
        if (this.inviteDialogCloseTimer) {
            clearTimeout(this.inviteDialogCloseTimer);
            this.inviteDialogCloseTimer = null;
        }
        this.setTabBarVisible(true);
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._silentSubscribeDone = false;
    },

    syncFontScale() {
        const fontScale = getCurrentFontScale();
        syncFontData.call(this);
        this.setData({
            fontScaleLabel: getFontScaleLabel(fontScale),
            selectedFontScale: fontScale,
        });
    },

    applyScaleLocally(fontScale) {
        const app = getApp();
        const nextScale = normalizeFontScale(fontScale);

        app.applyFontScale(nextScale, {
            persist: true,
            syncStoreUser: true,
        });

        syncFontData.call(this);
        this.setData({
            fontScaleLabel: getFontScaleLabel(nextScale),
            selectedFontScale: nextScale,
        });

        const tabBar =
            typeof this.getTabBar === "function" ? this.getTabBar() : null;
        if (tabBar && typeof tabBar.setData === "function") {
            tabBar.setData({ fontScale: nextScale });
        }
    },

    syncProfileMeta() {
        const state = store.getState();
        const profiles = Array.isArray(state.profiles)
            ? state.profiles.slice()
            : [];
        let currentProfileId = state.currentProfileId || "";

        if (!currentProfileId && profiles.length) {
            store.setCurrentProfileId(profiles[0]._id);
            return;
        }

        const profile = currentProfileId
            ? findProfileById(currentProfileId)
            : null;
        const relationship = currentProfileId
            ? getCurrentRelationship(state, currentProfileId)
            : null;
        const age = calculateAge(profile && profile.birthDate);
        const birthYearText =
            profile && profile.birthDate
                ? `${String(profile.birthDate).slice(0, 4)} 年出生`
                : "";
        const nextMeta = {
            profiles,
            currentProfileId,
            hasProfile: Boolean(profile),
            profileTitle:
                profile && profile.name ? profile.name : "来自儿女的关心",
            profileName: profile && profile.name ? profile.name : "",
            profileInitial: buildInvitationNicknameInitial(
                profile && profile.name,
                "家",
            ),
            profileAgeText: age !== null ? `${age}岁` : "",
            profileBirthYearText: birthYearText,
            canWriteCurrentProfile: profile
                ? canWrite(state, currentProfileId)
                : false,
            canInviteCurrentProfile: profile
                ? canInvite(state, currentProfileId)
                : false,
            canManageCurrentProfile: profile
                ? canManage(state, currentProfileId)
                : false,
            canEditCurrentProfile: profile
                ? canEditProfile(state, currentProfileId)
                : false,
            relationshipRole: relationship ? relationship.role : "",
            activeRelationshipId: relationship ? relationship._id : "",
            activeRelationshipSubscribeAlerts: isSubscribeAlertsEnabled(
                relationship,
            ),
        };
        const nextSignature = [
            nextMeta.currentProfileId,
            nextMeta.hasProfile ? "1" : "0",
            nextMeta.profileTitle,
            nextMeta.profileName,
            nextMeta.profileInitial,
            nextMeta.profileAgeText,
            nextMeta.profileBirthYearText,
            nextMeta.canWriteCurrentProfile ? "1" : "0",
            nextMeta.canInviteCurrentProfile ? "1" : "0",
            nextMeta.canManageCurrentProfile ? "1" : "0",
            nextMeta.canEditCurrentProfile ? "1" : "0",
            nextMeta.relationshipRole,
            nextMeta.activeRelationshipId,
            nextMeta.activeRelationshipSubscribeAlerts ? "1" : "0",
            buildProfilesSignature(profiles),
        ].join("|");

        if (nextSignature === this.lastProfileMetaSignature) {
            return;
        }

        this.lastProfileMetaSignature = nextSignature;
        this.setData(nextMeta);
    },

    setTabBarVisible(visible) {
        const tabBar =
            typeof this.getTabBar === "function" ? this.getTabBar() : null;
        if (tabBar && typeof tabBar.setVisible === "function") {
            tabBar.setVisible(visible !== false);
        }
    },

    syncTabBarVisibility(overrides = {}) {
        const showProfileSwitcher = Object.prototype.hasOwnProperty.call(
            overrides,
            "showProfileSwitcher",
        )
            ? overrides.showProfileSwitcher
            : this.data.showProfileSwitcher;
        const showMemberPanel = Object.prototype.hasOwnProperty.call(
            overrides,
            "showMemberPanel",
        )
            ? overrides.showMemberPanel
            : this.data.showMemberPanel;
        const showEditPanel = Object.prototype.hasOwnProperty.call(
            overrides,
            "showEditPanel",
        )
            ? overrides.showEditPanel
            : this.data.showEditPanel;
        const showInviteDialog = Object.prototype.hasOwnProperty.call(
            overrides,
            "showInviteDialog",
        )
            ? overrides.showInviteDialog
            : this.data.showInviteDialog;

        this.setTabBarVisible(
            !(
                showProfileSwitcher ||
                showMemberPanel ||
                showEditPanel ||
                showInviteDialog
            ),
        );
    },

    enterPageLoading() {
        this.setData({ pageReady: false });
    },

    shouldRefreshOnShow(profileId) {
        if (store.isStale("profiles", null, STALE_REFRESH_TTL_MS)) {
            return true;
        }

        if (
            profileId &&
            store.isStale("members", profileId, MEMBER_STALE_THRESHOLD)
        ) {
            return true;
        }

        if (!this.lastRefreshAt) {
            return true;
        }

        return Date.now() - this.lastRefreshAt > STALE_REFRESH_TTL_MS;
    },

    async refreshPageData(options = {}) {
        if (this.activeRefreshPromise) {
            return this.activeRefreshPromise;
        }

        const run = (async () => {
            const silent = options.silent === true;
            const app = getApp();
            const previousProfileId = store.getState().currentProfileId || "";

            if (app && typeof app.login === "function") {
                await app.login({ preserveCurrentProfileId: true });
            }

            this.syncProfileMeta();

            const nextProfileId = store.getState().currentProfileId || "";
            if (nextProfileId !== previousProfileId && this.activeLoadPromise) {
                await this.activeLoadPromise;
                return;
            }

            await this.loadPageData({
                force: true,
                resetReady: options.resetReady === true && !silent,
            });
        })();

        this.activeRefreshPromise = run;

        try {
            return await run;
        } finally {
            if (this.activeRefreshPromise === run) {
                this.activeRefreshPromise = null;
            }
        }
    },

    async loadMembers(profileId, options = {}) {
        const cachedMembers = this.memberCache[profileId];
        if (
            options.force !== true &&
            cachedMembers &&
            !store.isStale("members", profileId, MEMBER_STALE_THRESHOLD)
        ) {
            return cachedMembers.slice();
        }

        const result = await memberService.listProfileMembers(profileId);
        const members = Array.isArray(result.members)
            ? result.members.slice()
            : [];
        this.memberCache[profileId] = members;
        return members;
    },

    async loadPageData(options = {}) {
        const run = (async () => {
            const force = options.force === true;
            const resetReady = options.resetReady === true;
            const profileId = store.getState().currentProfileId || "";
            const forceMembers = options.forceMembers === true || force;
            const membersStale = profileId
                ? store.isStale(
                      "members",
                      profileId,
                      MEMBER_STALE_THRESHOLD,
                  )
                : false;

            if (resetReady) {
                this.enterPageLoading();
            }

            if (!profileId) {
                this.lastLoadedProfileId = "";
                this.lastRefreshAt = 0;
                this.latestRecord = null;
                this.activeMedications = [];
                this.historicalMedications = [];
                this.setData({
                    pageReady: true,
                    _lastProfileId: "",
                    hasProfile: false,
                    errorText: "",
                    latestRecordDisplay: null,
                    hasLatestRecord: false,
                    hasMedicationSummary: false,
                    medicationText: "",
                    medicationCount: 0,
                    medicationShortcutText: "添加长期用药记录",
                    emergencyText: "",
                    memberItems: [],
                    memberCount: 0,
                    showMemberPanel: false,
                    selectedMember: null,
                });
                return;
            }

            const shouldSkip =
                !force &&
                this.lastLoadedProfileId === profileId &&
                Date.now() - this.lastRefreshAt < REFRESH_TTL_MS &&
                !membersStale;

            if (shouldSkip) {
                return;
            }

            const profile = findProfileById(profileId);
            if (!profile) {
                this.setData({
                    pageReady: true,
                    _lastProfileId: "",
                    hasProfile: false,
                    errorText: "档案不存在或已被移除",
                });
                return;
            }

            this.requestId += 1;
            const requestId = this.requestId;

            try {
                const [latestResult, medicationResult, members] = await Promise.all(
                    [
                        recordService.fetchLatestRecord(profileId),
                        medicationService.fetchMedications(profileId),
                        this.loadMembers(profileId, { force: forceMembers }),
                    ],
                );

                if (requestId !== this.requestId) {
                    return;
                }

                this.lastLoadedProfileId = profileId;
                this.lastRefreshAt = Date.now();
                this.latestRecord = latestResult.record || null;
                this.activeMedications = Array.isArray(
                    medicationResult.activeMedications,
                )
                    ? medicationResult.activeMedications.slice()
                    : [];
                this.historicalMedications = Array.isArray(
                    medicationResult.historicalMedications,
                )
                    ? medicationResult.historicalMedications.slice()
                    : [];

                this.applyViewModel(profile, medicationResult, members);
            } catch (error) {
                if (requestId !== this.requestId) {
                    return;
                }

                this.setData({
                    pageReady: true,
                    _lastProfileId: profileId,
                    errorText: getErrorMessage(error),
                    latestRecordDisplay: null,
                    hasLatestRecord: false,
                    hasMedicationSummary: false,
                    medicationText: "",
                    medicationCount: 0,
                    medicationShortcutText: "添加长期用药记录",
                    emergencyText: "",
                    memberItems: [],
                    memberCount: 0,
                    showMemberPanel: false,
                    selectedMember: null,
                });
            }
        })();

        this.activeLoadPromise = run;

        try {
            return await run;
        } finally {
            if (this.activeLoadPromise === run) {
                this.activeLoadPromise = null;
            }
        }
    },

    applyViewModel(profile, medicationResult, members) {
        const activeMedications = Array.isArray(
            medicationResult.activeMedications,
        )
            ? medicationResult.activeMedications
            : [];
        const historicalMedications = Array.isArray(
            medicationResult.historicalMedications,
        )
            ? medicationResult.historicalMedications
            : [];
        const medicationText = buildMedicationSummary(activeMedications, 2);
        const medicationCount =
            activeMedications.length + historicalMedications.length;
        const memberItems = buildMemberItems(members, this.currentUserId);

        this.setData({
            pageReady: true,
            _lastProfileId: profile._id,
            errorText: "",
            latestRecordDisplay: buildLatestRecordDisplay(
                this.latestRecord,
                profile,
            ),
            hasLatestRecord: Boolean(this.latestRecord),
            hasMedicationSummary: Boolean(medicationText),
            medicationText,
            medicationCount,
            medicationShortcutText:
                medicationCount > 0
                    ? `已配置 ${medicationCount} 种用药`
                    : "添加长期用药记录",
            emergencyText: buildEmergencyText(profile),
            memberItems,
            memberCount: memberItems.length,
        });
    },

    setOwnSubscribeAlertsUI(nextValue) {
        this.setData({
            activeRelationshipSubscribeAlerts: nextValue,
        });
    },

    async persistOwnSubscribeAlerts(patch, previousValue) {
        const relationshipId = this.data.activeRelationshipId;

        try {
            const result = await memberService.updateRelationship(
                relationshipId,
                patch,
            );
            this.setOwnSubscribeAlertsUI(
                isSubscribeAlertsEnabled(result.relationship),
            );
        } catch (error) {
            this.setOwnSubscribeAlertsUI(previousValue);
            wx.showToast({
                title: getErrorMessage(error),
                icon: "none",
            });
        }
    },

    getCurrentRelationshipForSubscribeGuide() {
        const state = store.getState();
        const profileId = state.currentProfileId || "";
        if (!profileId) {
            return null;
        }

        return getCurrentRelationship(state, profileId);
    },

    hideSubscribeGuide() {
        if (
            !this.data.showSubscribeGuide &&
            !this.data.subscribeGuideInviterName &&
            !this.data.subscribeGuideProfileName
        ) {
            return;
        }

        this.setData({
            showSubscribeGuide: false,
            subscribeGuideInviterName: "",
            subscribeGuideProfileName: "",
        });
    },

    syncSubscribeGuideState() {
        const relationship = this.getCurrentRelationshipForSubscribeGuide();
        if (!shouldShowSubscribeGuide(relationship)) {
            this.hideSubscribeGuide();
            return;
        }

        if (this.data.showSubscribeGuide) {
            this.setData({
                subscribeGuideInviterName:
                    getSubscribeGuideInviterName(relationship) || "家人",
                subscribeGuideProfileName: this.data.profileName || "",
            });
            this.ensureSubscribeGuideInviterName(relationship);
            return;
        }

        const app = getApp();
        if (
            app &&
            typeof app.hasShownSubscribeGuide === "function" &&
            app.hasShownSubscribeGuide(relationship._id)
        ) {
            this.hideSubscribeGuide();
            return;
        }

        if (app && typeof app.markSubscribeGuideShown === "function") {
            app.markSubscribeGuideShown(relationship._id);
        }

        this.setData({
            showSubscribeGuide: true,
            subscribeGuideInviterName:
                getSubscribeGuideInviterName(relationship) || "家人",
            subscribeGuideProfileName: this.data.profileName || "",
        });
        this.ensureSubscribeGuideInviterName(relationship);
    },

    async ensureSubscribeGuideInviterName(relationship) {
        const profileId = relationship && relationship.profileId;
        const directName = getSubscribeGuideInviterName(relationship);

        if (directName || !profileId) {
            return;
        }

        const cachedMembers = Array.isArray(this.memberCache[profileId])
            ? this.memberCache[profileId]
            : [];
        const cachedInviterName = findSubscribeGuideInviterNameFromMembers(
            cachedMembers,
            relationship,
        );

        if (cachedInviterName) {
            if (this.data.showSubscribeGuide) {
                this.setData({
                    subscribeGuideInviterName: cachedInviterName,
                });
            }
            return;
        }

        const lookupToken = this.subscribeGuideInviterLookupToken + 1;
        this.subscribeGuideInviterLookupToken = lookupToken;

        try {
            const members = await this.loadMembers(profileId, { force: false });
            if (lookupToken !== this.subscribeGuideInviterLookupToken) {
                return;
            }

            const inviterName = findSubscribeGuideInviterNameFromMembers(
                members,
                relationship,
            );
            if (!inviterName || !this.data.showSubscribeGuide) {
                return;
            }

            this.setData({
                subscribeGuideInviterName: inviterName,
            });
        } catch (error) {
            void error;
        }
    },

    refreshSubscribeAlertQuotaSilently() {
        const relationship = this.getCurrentRelationshipForSubscribeGuide();
        if (
            this._silentSubscribeDone ||
            !shouldSilentlyRefreshSubscribeAlert(relationship) ||
            typeof wx.requestSubscribeMessage !== "function"
        ) {
            return;
        }

        this._silentSubscribeDone = true;
        wx.requestSubscribeMessage({
            tmplIds: [SUBSCRIBE_ALERT_TEMPLATE_ID],
            success() {},
            fail() {},
        });
    },

    async updateSubscribeGuideRelationship(status) {
        const relationship = this.getCurrentRelationshipForSubscribeGuide();
        if (!relationship || !relationship._id) {
            this.hideSubscribeGuide();
            return;
        }

        const patch =
            status === "accept"
                ? {
                      subscribeAlerts: true,
                      subscribeAuthStatus: "authorized",
                  }
                : {
                      subscribeAlerts: false,
                      subscribeAuthStatus: "declined",
                  };

        await memberService.updateRelationship(relationship._id, patch);
    },

    async handleSubscribeGuideResult(event) {
        const status =
            event && event.detail && typeof event.detail.status === "string"
                ? event.detail.status
                : "";

        if (
            this.isSubscribeGuideSubmitting ||
            (status !== "accept" && status !== "reject" && status !== "ban")
        ) {
            return;
        }

        this.isSubscribeGuideSubmitting = true;
        try {
            await this.updateSubscribeGuideRelationship(status);
            this.hideSubscribeGuide();
            this.syncProfileMeta();
            if (status === "ban") {
                showSubscribeBanModal();
            }
        } catch (error) {
            wx.showToast({
                title: getErrorMessage(error),
                icon: "none",
            });
        } finally {
            this.isSubscribeGuideSubmitting = false;
        }
    },

    async handleSubscribeGuideReject() {
        if (this.isSubscribeGuideSubmitting) {
            return;
        }

        this.isSubscribeGuideSubmitting = true;
        try {
            await this.updateSubscribeGuideRelationship("reject");
            this.hideSubscribeGuide();
            this.syncProfileMeta();
        } catch (error) {
            wx.showToast({
                title: getErrorMessage(error),
                icon: "none",
            });
        } finally {
            this.isSubscribeGuideSubmitting = false;
        }
    },

    handleCreateProfile() {
        wx.navigateTo({
            url: `/pages/profile-edit/profile-edit?mode=create&returnTab=${encodeURIComponent("/pages/profile-home/profile-home")}`,
        });
    },

    handleOpenProfileSwitcher() {
        if (!this.data.profiles.length) {
            return;
        }

        this.setData({ showProfileSwitcher: true });
    },

    handleCloseProfileSwitcher() {
        this.setData({ showProfileSwitcher: false });
    },

    handleProfileSwitcherVisibilityChange(event) {
        this.syncTabBarVisibility({
            showProfileSwitcher: Boolean(
                event && event.detail && event.detail.visible,
            ),
        });
    },

    handleSelectProfile(event) {
        const profileId = event.detail && event.detail.profileId;
        if (!profileId) {
            this.setData({ showProfileSwitcher: false });
            return;
        }

        const app = getApp();
        if (app && typeof app.persistLastSelectedProfileId === "function") {
            app.persistLastSelectedProfileId(profileId);
        } else {
            wx.setStorageSync("lastSelectedProfileId", profileId);
        }

        if (profileId === this.data.currentProfileId) {
            this.setData({ showProfileSwitcher: false });
            return;
        }

        store.setCurrentProfileId(profileId);
        this.setData({ showProfileSwitcher: false });
    },

    handleOpenFullProfileList() {
        this.setData({ showProfileSwitcher: false }, () => {
            wx.navigateTo({
                url: "/pages/profile-selector/profile-selector",
            });
        });
    },

    handleOpenUserSettings() {
        wx.navigateTo({
            url: "/pages/user-settings/user-settings",
        });
    },

    handleEditProfile() {
        if (!this.data.currentProfileId || !this.data.canEditCurrentProfile) {
            return;
        }

        this.setData({ showEditPanel: true });
    },

    handleCloseEditPanel() {
        if (!this.data.showEditPanel) {
            return;
        }

        this.setData({ showEditPanel: false });
    },

    handleEditPanelVisibilityChange(event) {
        this.syncTabBarVisibility({
            showEditPanel: Boolean(
                event && event.detail && event.detail.visible,
            ),
        });
    },

    handleProfileEditSaved(event) {
        const detail = (event && event.detail) || {};
        const profileId = detail.profileId || this.data.currentProfileId;
        const profile = profileId ? findProfileById(profileId) : null;

        this.syncProfileMeta();

        if (!profile || profileId !== this.data.currentProfileId) {
            return;
        }

        this.applyViewModel(
            profile,
            {
                activeMedications: Array.isArray(this.activeMedications)
                    ? this.activeMedications.slice()
                    : [],
                historicalMedications: Array.isArray(this.historicalMedications)
                    ? this.historicalMedications.slice()
                    : [],
            },
            Array.isArray(this.memberCache[profileId])
                ? this.memberCache[profileId].slice()
                : [],
        );
    },

    handleMemberTap(event) {
        if (!this.data.currentProfileId) {
            return;
        }

        const relationshipId =
            event &&
            event.currentTarget &&
            event.currentTarget.dataset &&
            event.currentTarget.dataset.relationshipId;
        const member = (this.data.memberItems || []).find(
            (item) => item.relationshipId === relationshipId,
        );

        if (!member) {
            return;
        }

        this.setData({
            selectedMember: member,
            showMemberPanel: true,
        });
    },

    handleMemberPanelClose() {
        if (!this.data.showMemberPanel && !this.data.selectedMember) {
            return;
        }

        this.setData({
            showMemberPanel: false,
            selectedMember: null,
        });
    },

    handleMemberPanelVisibilityChange(event) {
        this.syncTabBarVisibility({
            showMemberPanel: Boolean(
                event && event.detail && event.detail.visible,
            ),
        });
    },

    handleMemberChanged(event) {
        const detail = (event && event.detail) || {};
        const currentProfileId = this.data.currentProfileId;
        const state = store.getState();
        const selfMembershipChanged = Boolean(
            detail &&
                detail.affectedUserId &&
                this.currentUserId &&
                detail.affectedUserId === this.currentUserId,
        );

        if (detail.member) {
            this.setData({
                selectedMember: detail.member,
            });
        }

        if (currentProfileId) {
            delete this.memberCache[currentProfileId];
        }

        this.lastRefreshAt = 0;
        this.lastLoadedProfileId = "";

        if (selfMembershipChanged) {
            const remainingProfiles = Array.isArray(state.profiles)
                ? state.profiles.filter(Boolean)
                : [];
            const nextProfileId = remainingProfiles.length
                ? remainingProfiles[0]._id
                : null;
            store.setState({
                currentProfileId: nextProfileId,
            });
            return;
        }

        this.syncProfileMeta();
        this.loadPageData({
            force: true,
            resetReady: false,
        });
    },

    handleCreateInvitation() {
        if (!this.data.currentProfileId || !this.data.canInviteCurrentProfile) {
            return;
        }

        if (this.data.isPreparingInvitation) {
            return;
        }

        const currentUser = store.getState().user || {};
        const inviteNickname = getInviteNicknameFromUser(currentUser);

        if (!isValidInviteNickname(inviteNickname)) {
            this.setData({
                showInviteDialog: true,
                pendingInvitationToken: "",
                showNicknameInput: true,
                inviteNickname: "",
                inviteNicknameDraft: "",
                isSavingInviteNickname: false,
                isPreparingInvitation: false,
            });
            this.syncTabBarVisibility({
                showInviteDialog: true,
            });
            return;
        }

        const run = async () => {
            this.setData({
                isPreparingInvitation: true,
            });

            wx.showLoading({
                title: "",
                mask: true,
            });

            try {
                const result = await invitationService.createInvitation({
                    profileIds: [this.data.currentProfileId],
                    defaultRole: "viewer",
                });
                const token =
                    result &&
                    result.invitation &&
                    typeof result.invitation.token === "string"
                        ? result.invitation.token
                        : "";

                if (!token) {
                    throw new Error("Missing invitation token");
                }

                this.setData({
                    showInviteDialog: true,
                    pendingInvitationToken: token,
                    showNicknameInput: false,
                    inviteNickname,
                    inviteNicknameDraft: inviteNickname,
                    isSavingInviteNickname: false,
                    isPreparingInvitation: false,
                });
                this.syncTabBarVisibility({
                    showInviteDialog: true,
                });
            } catch (error) {
                this.setData({
                    isPreparingInvitation: false,
                });
                wx.showToast({
                    title: getErrorMessage(error),
                    icon: "none",
                });
            } finally {
                wx.hideLoading();
            }
        };

        run();
    },

    handleCloseInviteDialog() {
        if (!this.data.showInviteDialog && !this.data.pendingInvitationToken) {
            return;
        }

        if (this.inviteDialogCloseTimer) {
            clearTimeout(this.inviteDialogCloseTimer);
            this.inviteDialogCloseTimer = null;
        }

        this.setData({
            showInviteDialog: false,
            pendingInvitationToken: "",
            showNicknameInput: false,
            inviteNickname: "",
            inviteNicknameDraft: "",
            isSavingInviteNickname: false,
        });
        this.syncTabBarVisibility({
            showInviteDialog: false,
        });
    },

    handleInviteNicknameInput(event) {
        this.setData({
            inviteNicknameDraft: trimText(event.detail.value).slice(0, 20),
        });
    },

    async handleConfirmInviteNickname() {
        if (this.data.isSavingInviteNickname) {
            return;
        }

        const inviteNickname = trimText(this.data.inviteNicknameDraft);
        if (!isValidInviteNickname(inviteNickname)) {
            wx.showToast({
                title: "请输入有效昵称",
                icon: "none",
            });
            return;
        }

        this.setData({
            isSavingInviteNickname: true,
        });

        try {
            const result = await userService.updateProfile({
                nickname: inviteNickname,
            });
            const nextUser = Object.assign(
                {},
                store.getState().user || {},
                result && result.user ? result.user : {},
                {
                    nickname: inviteNickname,
                },
            );
            store.setState({
                user: nextUser,
            });

            const app = getApp();
            if (app && typeof app.syncInviterProfileState === "function") {
                app.syncInviterProfileState(nextUser);
            }

            const invitationResult = await invitationService.createInvitation({
                profileIds: [this.data.currentProfileId],
                defaultRole: "viewer",
            });
            const token =
                invitationResult &&
                invitationResult.invitation &&
                typeof invitationResult.invitation.token === "string"
                    ? invitationResult.invitation.token
                    : "";

            if (!token) {
                throw new Error("Missing invitation token");
            }

            this.setData({
                showNicknameInput: false,
                pendingInvitationToken: token,
                inviteNickname,
                inviteNicknameDraft: inviteNickname,
                isSavingInviteNickname: false,
            });
        } catch (error) {
            this.setData({
                isSavingInviteNickname: false,
            });
            wx.showToast({
                title: "保存失败，请重试",
                icon: "none",
            });
        }
    },

    hideInviteDialogAfterShareTap() {
        if (!this.data.showInviteDialog) {
            return;
        }

        this.setData({
            showInviteDialog: false,
        });
        this.syncTabBarVisibility({
            showInviteDialog: false,
        });
    },

    handleInviteShareTap() {
        if (this.data.showNicknameInput || !this.data.pendingInvitationToken) {
            return;
        }

        if (this.inviteDialogCloseTimer) {
            clearTimeout(this.inviteDialogCloseTimer);
        }

        this.inviteDialogCloseTimer = setTimeout(() => {
            this.inviteDialogCloseTimer = null;
            this.hideInviteDialogAfterShareTap();
        }, 0);
    },

    noop() {},

    onShareAppMessage(options = {}) {
        const target =
            options && options.target && options.target.dataset
                ? options.target
                : null;
        const dataset = target ? target.dataset || {} : {};

        if (
            options.from !== "button" ||
            dataset.shareType !== "invite" ||
            !this.data.pendingInvitationToken
        ) {
            return {};
        }

        const state = store.getState();
        const user = state.user || {};

        return {
            title: buildInviteShareTitle(user.nickname, this.data.profileName),
            path: `/pages/invite-accept/invite-accept?token=${encodeURIComponent(this.data.pendingInvitationToken)}`,
            imageUrl: "/assets/images/share-card.png",
        };
    },

    handleOpenReport() {
        if (!this.data.currentProfileId) {
            return;
        }

        if (!this.data.hasLatestRecord) {
            wx.showToast({
                title: "暂无测量记录",
                icon: "none",
            });
            return;
        }

        wx.navigateTo({
            url: `/pages/report/report?profileId=${this.data.currentProfileId}`,
        });
    },

    handleOpenMedicationManagement() {
        if (!this.data.currentProfileId) {
            return;
        }

        wx.navigateTo({
            url: `/pages/medication-edit/medication-edit?profileId=${this.data.currentProfileId}`,
        });
    },

    async handleSelectFontScale(event) {
        const fontScale = Number(event.currentTarget.dataset.scale);
        if (!isValidFontScale(fontScale)) {
            return;
        }

        if (normalizeFontScale(this.data.selectedFontScale) === fontScale) {
            return;
        }

        this.fontScaleRequestId += 1;
        const requestId = this.fontScaleRequestId;
        this.applyScaleLocally(fontScale);

        try {
            const result = await userService.updateSettings({ fontScale });
            if (requestId !== this.fontScaleRequestId) {
                return;
            }

            store.setState({
                user: result.user,
            });
            this.applyScaleLocally(
                result.user &&
                    result.user.settings &&
                    result.user.settings.fontScale,
            );
        } catch (error) {
            if (requestId !== this.fontScaleRequestId) {
                return;
            }

            wx.showToast({
                title: getErrorMessage(error),
                icon: "none",
            });
        }
    },

    async handleToggleSubscribeAlerts(event) {
        const subscribeAlerts = !!event.detail.value;
        const relationshipId = this.data.activeRelationshipId;
        const previousValue = this.data.activeRelationshipSubscribeAlerts;

        if (!relationshipId) {
            return;
        }

        this.setOwnSubscribeAlertsUI(subscribeAlerts);

        try {
            if (subscribeAlerts && !previousValue) {
                await requestAlertSubscription({
                    onAccept: () =>
                        this.persistOwnSubscribeAlerts(
                            {
                                subscribeAlerts: true,
                                subscribeAuthStatus: "authorized",
                            },
                            previousValue,
                        ),
                    onReject: () =>
                        this.persistOwnSubscribeAlerts(
                            {
                                subscribeAlerts: false,
                                subscribeAuthStatus: "declined",
                            },
                            previousValue,
                        ),
                    onBan: async () => {
                        await this.persistOwnSubscribeAlerts(
                            {
                                subscribeAlerts: false,
                                subscribeAuthStatus: "declined",
                            },
                            previousValue,
                        );
                        showSubscribeBanModal();
                    },
                    onFail: ({ error }) => {
                        throw error;
                    },
                });
                return;
            }

            await this.persistOwnSubscribeAlerts(
                { subscribeAlerts },
                previousValue,
            );
        } catch (error) {
            this.setOwnSubscribeAlertsUI(previousValue);
            wx.showToast({
                title: getErrorMessage(error),
                icon: "none",
            });
        }
    },

    async handleDeleteProfile() {
        if (
            !this.data.currentProfileId ||
            !this.data.canManageCurrentProfile ||
            this.data.isDeletingProfile
        ) {
            return;
        }

        const profile = findProfileById(this.data.currentProfileId);
        if (!profile) {
            return;
        }

        const result = await new Promise((resolve) => {
            wx.showModal({
                title: `确定删除「${profile.name}」？`,
                content: "删除后所有记录无法恢复",
                confirmText: "删除",
                confirmColor: "#b42318",
                success: resolve,
                fail() {
                    resolve({ confirm: false, cancel: true });
                },
            });
        });

        if (!result || !result.confirm) {
            return;
        }

        this.setData({ isDeletingProfile: true });

        try {
            await profileService.deleteProfile(profile._id);
            removeProfileFromStore(profile._id);
            delete this.memberCache[profile._id];
            wx.showToast({
                title: `已删除「${profile.name}」`,
                icon: "none",
            });
            wx.switchTab({
                url: "/pages/data/data",
            });
        } catch (error) {
            wx.showToast({
                title: getErrorMessage(error),
                icon: "none",
            });
        } finally {
            this.setData({ isDeletingProfile: false });
        }
    },
});
