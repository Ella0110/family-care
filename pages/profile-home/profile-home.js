const { store } = require("../../store/index");
const userService = require("../../services/user-service");
const recordService = require("../../services/record-service");
const medicationService = require("../../services/medication-service");
const memberService = require("../../services/member-service");
const profileService = require("../../services/profile-service");
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
const { requestAlertSubscription } = require("../../utils/alert-subscription");
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
const { buildInvitationNicknameInitial } = require("../../utils/invitation");

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
        statusText: status.detail
            ? `血压${status.label}${status.detail}`
            : `血压${status.label}`,
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

            this.syncProfileMeta();

            if (loginJustFinished) {
                this.lastSeenProfileId = nextProfileId;
                this.loadPageData({ force: true, resetReady: true });
                return;
            }

            if (nextProfileId !== this.lastSeenProfileId) {
                this.lastSeenProfileId = nextProfileId;
                this.loadPageData({ force: true, resetReady: true });
            }
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

        console.log("[profile-home] member refresh gate", {
            profileId,
            memberListDirty,
            memberRefreshAt,
            membersStale,
        });

        this.syncProfileMeta();
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
        this.setTabBarVisible(true);
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
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
            activeRelationshipSubscribeAlerts: Boolean(
                relationship ? relationship.subscribeAlerts : false,
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

        this.setTabBarVisible(
            !(showProfileSwitcher || showMemberPanel || showEditPanel),
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

    async persistOwnSubscribeAlerts(subscribeAlerts, previousValue) {
        const relationshipId = this.data.activeRelationshipId;

        try {
            await memberService.updateRelationship(relationshipId, {
                subscribeAlerts,
            });
            this.setOwnSubscribeAlertsUI(subscribeAlerts);
        } catch (error) {
            this.setOwnSubscribeAlertsUI(previousValue);
            wx.showToast({
                title: getErrorMessage(error),
                icon: "none",
            });
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
        }

        if (currentProfileId) {
            delete this.memberCache[currentProfileId];
        }

        this.lastRefreshAt = 0;
        this.lastLoadedProfileId = "";
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

        wx.navigateTo({
            url: `/pages/invite-create/invite-create?profileId=${this.data.currentProfileId}`,
        });
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

        if (subscribeAlerts && !previousValue) {
            await requestAlertSubscription(() =>
                this.persistOwnSubscribeAlerts(subscribeAlerts, previousValue),
            );
            return;
        }

        await this.persistOwnSubscribeAlerts(subscribeAlerts, previousValue);
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
