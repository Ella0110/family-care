const { store } = require("../../store/index");
const recordService = require("../../services/record-service");
const { getErrorMessage } = require("../../utils/error-messages");
const {
    DEFAULT_FONT_SCALE,
    syncFontData,
} = require("../../utils/font-scale");
const {
    getBPStatusDisplay,
    getBPLevelForValue,
    getBPLevelMeta,
} = require("../../utils/bp-status");
const { getAppLoginStatus } = require("../../utils/app-login-status");
const {
    getCurrentRelationship,
    isViewer,
    canWrite,
} = require("../../utils/permission-helpers");
const {
    LOW_BP,
    getSinceForDays,
    toMeasuredDate,
    countUniqueMeasuredDays,
    buildChartTimeline,
} = require("../../utils/report-helpers");
const {
    drawBloodPressureTrendChart,
    drawHeartRateChart,
} = require("../../utils/report-chart-renderer");

const RANGE_OPTIONS = [
    { days: 7, label: "7 天" },
    { days: 30, label: "30 天" },
    { days: 90, label: "90 天" },
];

const EXPORT_CHART_CANVAS_WIDTH = 750;
const EXPORT_CHART_TITLE_Y = 60;
const EXPORT_CHART_SUBTITLE_Y = 96;
const EXPORT_CHART_TOP = 130;
const EXPORT_CHART_HEIGHT = 380;
const EXPORT_CHART_SUMMARY_Y = 556;
const EXPORT_CHART_TITLE_FONT_SIZE = 30;
const EXPORT_CHART_SUBTITLE_FONT_SIZE = 18;
const EXPORT_CHART_SUMMARY_FONT_SIZE = 28;
const REFRESH_TTL_MS = 5 * 1000;
const STALE_REFRESH_TTL_MS = 30 * 1000;
const PULL_DOWN_REFRESH_THROTTLE_MS = 2 * 1000;

function pad(value) {
    return String(value).padStart(2, "0");
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    const timestamp = date.getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortRecordsDesc(records) {
    return (Array.isArray(records) ? records.slice() : []).sort(
        (left, right) => {
            const measuredAtDiff =
                toTimestamp(right && right.measuredAt) -
                toTimestamp(left && left.measuredAt);
            if (measuredAtDiff !== 0) {
                return measuredAtDiff;
            }

            return (
                toTimestamp(right && right.createdAt) -
                toTimestamp(left && left.createdAt)
            );
        },
    );
}

function findProfile(profileId) {
    return (
        (store.getState().profiles || []).find(
            (profile) => profile && profile._id === profileId,
        ) || null
    );
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
            ].join(":");
        })
        .join("|");
}

function getThreshold(profile) {
    return (
        (profile &&
            profile.settings &&
            profile.settings.bp &&
            profile.settings.bp.threshold) || {
            systolic: 140,
            diastolic: 90,
        }
    );
}

const getLoginStatus = getAppLoginStatus;

function consumePendingRecordPanelOpen() {
    const app = getApp();
    if (app && typeof app.consumePendingRecordPanelOpen === "function") {
        return app.consumePendingRecordPanelOpen();
    }

    return false;
}

function getErrorReason(error) {
    if (!error) {
        return "unknown";
    }

    if (error.errMsg) {
        return error.errMsg;
    }

    if (error.message) {
        return error.message;
    }

    return String(error);
}

function isPermissionInterrupted(error) {
    return /deny|cancel/i.test(getErrorReason(error));
}

function wrapCanvasToTempFilePath(canvas, options = {}) {
    return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath(
            Object.assign(
                {
                    canvas,
                    fileType: "png",
                    quality: 1,
                    success: resolve,
                    fail: reject,
                },
                options,
            ),
        );
    });
}

function wrapSaveImageToPhotosAlbum(filePath) {
    return new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
            filePath,
            success: resolve,
            fail: reject,
        });
    });
}

function showSystemPermissionHint() {
    wx.showModal({
        title: "需要在系统设置中开启权限",
        content: "请前往手机「设置 → 微信 → 照片」，将权限设为“允许”",
        showCancel: false,
        confirmText: "知道了",
    });
}

function getEarliestMeasuredRecordAgeInDays(records, now = new Date()) {
    const safeRecords = Array.isArray(records) ? records : [];
    let earliestTimestamp = Infinity;

    safeRecords.forEach((record) => {
        const measuredAt = toMeasuredDate(record && record.measuredAt);
        const timestamp = measuredAt.getTime();
        if (!Number.isNaN(timestamp) && timestamp < earliestTimestamp) {
            earliestTimestamp = timestamp;
        }
    });

    if (!Number.isFinite(earliestTimestamp)) {
        return -1;
    }

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const earliestDay = new Date(earliestTimestamp);
    earliestDay.setHours(0, 0, 0, 0);

    return Math.floor(
        (today.getTime() - earliestDay.getTime()) / 86400000,
    );
}

function buildPeriodOptions(coverageDayCount, records, now = new Date()) {
    if (!Number.isFinite(coverageDayCount)) {
        return RANGE_OPTIONS.map((item) =>
            Object.assign({}, item, { enabled: true }),
        );
    }

    const earliestRecordAgeInDays = getEarliestMeasuredRecordAgeInDays(
        records,
        now,
    );

    return RANGE_OPTIONS.map((item) => {
        let enabled = false;
        if (item.days === 7) {
            enabled = coverageDayCount >= 1;
        } else if (item.days === 30) {
            enabled = coverageDayCount > 7;
        } else if (item.days === 90) {
            enabled = earliestRecordAgeInDays > 30;
        }

        return Object.assign({}, item, { enabled });
    });
}

function getDisabledPeriodToast(days) {
    if (days === 30) {
        return "记录超过 7 天后可查看";
    }

    if (days === 90) {
        return "记录超过 30 天后可查看";
    }

    return "当前暂无可查看数据";
}

function isSameDay(left, right) {
    return (
        left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate()
    );
}

function formatMeasuredAt(value) {
    const date = toMeasuredDate(value);
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

    if (isSameDay(date, now)) {
        return `今天 ${time}`;
    }

    if (isSameDay(date, yesterday)) {
        return `昨天 ${time}`;
    }

    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${time}`;
}

function formatExportDateRange(days, now = new Date()) {
    const start = getSinceForDays(days, now);
    return `${start.getFullYear()}.${pad(start.getMonth() + 1)}.${pad(start.getDate())} - ${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
}

function average(values) {
    if (!Array.isArray(values) || !values.length) {
        return null;
    }

    return Math.round(
        values.reduce((sum, value) => sum + value, 0) / values.length,
    );
}

function buildRangeSummary(records, threshold) {
    const safeRecords = Array.isArray(records) ? records : [];
    const systolicValues = safeRecords
        .map((record) =>
            Number(record && record.payload && record.payload.systolic),
        )
        .filter(Number.isFinite);
    const diastolicValues = safeRecords
        .map((record) =>
            Number(record && record.payload && record.payload.diastolic),
        )
        .filter(Number.isFinite);

    let normalCount = 0;
    let abnormalCount = 0;

    safeRecords.forEach((record) => {
        const payload = record && record.payload ? record.payload : {};
        const systolic = Number(payload.systolic);
        const diastolic = Number(payload.diastolic);
        if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
            return;
        }

        if (
            systolic < threshold.systolic &&
            diastolic < threshold.diastolic &&
            systolic >= LOW_BP.systolic &&
            diastolic >= LOW_BP.diastolic
        ) {
            normalCount += 1;
        } else {
            abnormalCount += 1;
        }
    });

    return {
        normalCount,
        abnormalCount,
        averageText:
            systolicValues.length && diastolicValues.length
                ? `${average(systolicValues)}/${average(diastolicValues)}`
                : "--",
    };
}

function buildHeartRateSummary(records) {
    const safeRecords = Array.isArray(records) ? records : [];
    const heartRateValues = safeRecords
        .map(function (record) {
            return record && record.payload
                ? Number(record.payload.heartRate)
                : NaN;
        })
        .filter(Number.isFinite);

    var normalCount = 0;
    var abnormalCount = 0;

    heartRateValues.forEach(function (hr) {
        if (hr > 100 || hr < 50) {
            abnormalCount += 1;
        } else {
            normalCount += 1;
        }
    });

    return {
        normalCount: normalCount,
        abnormalCount: abnormalCount,
        averageText: heartRateValues.length
            ? String(
                  Math.round(
                      heartRateValues.reduce(function (sum, v) {
                          return sum + v;
                      }, 0) / heartRateValues.length,
                  ),
              )
            : "--",
    };
}

function getRangeRecords(records, days, now = new Date()) {
    const since = getSinceForDays(days, now).getTime();
    return sortRecordsDesc(records).filter(
        (record) => toTimestamp(record && record.measuredAt) >= since,
    );
}

function buildLatestDisplay(record, profile) {
    if (!record) {
        return null;
    }

    const payload = record.payload || {};
    const systolic = Number(payload.systolic);
    const diastolic = Number(payload.diastolic);
    const status = getBPStatusDisplay(systolic, diastolic);
    const systolicMeta = getBPLevelMeta(
        getBPLevelForValue(systolic, "systolic"),
    );
    const diastolicMeta = getBPLevelMeta(
        getBPLevelForValue(diastolic, "diastolic"),
    );
    const heartRate =
        payload.heartRate === null ||
        payload.heartRate === undefined ||
        payload.heartRate === ""
            ? null
            : Number(payload.heartRate);
    const heartRateAlert =
        Number.isFinite(heartRate) && (heartRate > 100 || heartRate < 50);
    return {
        showStatusTag: status.level !== "normal",
        statusText: status.tagText,
        statusClassName: status.className,
        systolicText: Number.isFinite(systolic) ? String(systolic) : "--",
        diastolicText: Number.isFinite(diastolic) ? String(diastolic) : "--",
        systolicClassName: systolicMeta.className,
        diastolicClassName: diastolicMeta.className,
        heartRateText: Number.isFinite(heartRate) ? `${heartRate} bpm` : "--",
        heartRateClassName: heartRateAlert ? "is-alert" : "",
        measuredAtText: formatMeasuredAt(record.measuredAt),
        recorderText: "",
    };
}

function buildRecorderText(record, options = {}) {
    if (!options.showRecorderLabel || !record) {
        return "";
    }

    if (options.currentUserId && record.recordedBy === options.currentUserId) {
        return "我录入";
    }

    const recordedByName = String(record.recordedByName || "").trim();
    return recordedByName ? `由 ${recordedByName} 录入` : "";
}

function shouldShowRecorderLabel(records, options = {}) {
    if (options.role && options.role !== "owner") {
        return true;
    }

    const recorderIds = new Set(
        (Array.isArray(records) ? records : [])
            .map((record) => record && record.recordedBy)
            .filter(Boolean),
    );

    if (!recorderIds.size) {
        return false;
    }

    if (
        options.currentUserId &&
        (recorderIds.size > 1 || !recorderIds.has(options.currentUserId))
    ) {
        return true;
    }

    return recorderIds.size > 1;
}

function buildChartExportHeight() {
    return 640;
}

function buildChartExportSummaryText(
    chartType,
    selectedDays,
    rangeSummary,
    heartRateSummary,
) {
    if (chartType === "hr") {
        return `近 ${selectedDays}天 | 均值 ${heartRateSummary.averageText || "--"} bpm | 异常${heartRateSummary.abnormalCount}次`;
    }

    return `近 ${selectedDays}天 | 均值 ${rangeSummary.averageText || "--"} mmHg | 异常${rangeSummary.abnormalCount}次`;
}

Page({
    data: {
        fontScale: DEFAULT_FONT_SCALE,
        fs: {},
        pageReady: false,
        _lastProfileId: "",
        hasProfile: false,
        profileName: "",
        profileTitle: "来自儿女的关心",
        profiles: [],
        currentProfileId: "",
        selectedDays: 7,
        periodOptions: buildPeriodOptions(NaN),
        isLoading: false,
        errorText: "",
        latestRecordDisplay: null,
        latestRecord: null,
        hasAnyRecords: false,
        hasRangeRecords: false,
        hasHeartRateData: false,
        rangeSummary: {
            normalCount: 0,
            abnormalCount: 0,
            averageText: "--",
        },
        heartRateSummary: {
            normalCount: 0,
            abnormalCount: 0,
            averageText: "--",
        },
        showProfileSwitcher: false,
        showRecordPanel: false,
        editingRecord: null,
        canWriteCurrentProfile: false,
        isViewerMode: false,
        exportCanvasHeight: 1,
        isExportingChart: false,
        showPermissionModal: false,
    },

    onLoad() {
        this.requestId = 0;
        this.chartRenderToken = 0;
        this.pixelRatio = 1;
        this.lastRefreshAt = 0;
        this.lastManualRefreshAt = 0;
        this.lastLoadedProfileId = "";
        this.coverageDayCount = NaN;
        this.allRecords = [];
        this.rangeRecords = [];
        this.chartData = null;
        this.chartThreshold = { systolic: 140, diastolic: 90 };
        this.exportTempFilePath = "";
        this.exportChartMeta = null;
        this.lastSeenProfileId = store.getState().currentProfileId || "";
        this.lastLoginReady = getLoginStatus().isLoginReady;
        this.lastProfileMetaSignature = "";
        this.currentUserId = store.getState().user && store.getState().user._id;
        this.activeLoadPromise = null;
        this.activeRefreshPromise = null;

        syncFontData.call(this);
        this.initSystemInfo();
        this.syncProfileMeta();

        this._unsubscribe = store.subscribe((nextState) => {
            const loginStatus = getLoginStatus();
            const nextProfileId = nextState.currentProfileId || "";

            if (!loginStatus.isLoginReady) {
                this.lastLoginReady = false;
                return;
            }

            const loginJustFinished =
                loginStatus.isLoginReady && !this.lastLoginReady;
            this.lastLoginReady = loginStatus.isLoginReady;

            if (loginJustFinished) {
                this.lastSeenProfileId = nextProfileId;
                this.syncProfileMeta();
                this.loadPageData({ force: true, resetReady: true });
                return;
            }

            if (nextProfileId !== this.lastSeenProfileId) {
                this.handleCurrentProfileChange(nextProfileId);
                return;
            }

            this.syncProfileMeta();
        });
    },

    onShow() {
        const tabBar =
            typeof this.getTabBar === "function" ? this.getTabBar() : null;
        if (tabBar) {
            tabBar.setData({ selectedPath: "pages/data/data" });
        }

        this.syncTabBarVisibility();
        syncFontData.call(this);
        const loginStatus = getLoginStatus();
        this.lastLoginReady = loginStatus.isLoginReady;

        if (!loginStatus.isLoginReady) {
            this.enterPageLoading();
            return;
        }

        this.syncProfileMeta();
        if (this.activeLoadPromise || this.activeRefreshPromise) {
            return;
        }

        const profileId = store.getState().currentProfileId || "";
        const shouldResetReady =
            !this.data.pageReady || profileId !== this.data._lastProfileId;
        if (!shouldResetReady && this.shouldRefreshOnShow()) {
            this.refreshPageData({ silent: true }).catch((error) => {
                console.error("[data] onShow silent refresh failed", error);
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
            console.error("[data] pull-down refresh failed", error);
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
        this.chartRenderToken += 1;
        this.exportTempFilePath = "";
    },

    initSystemInfo() {
        try {
            const systemInfo = wx.getSystemInfoSync();
            this.pixelRatio = Number(systemInfo.pixelRatio) || 1;
        } catch (error) {
            this.pixelRatio = 1;
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

        const profile = currentProfileId ? findProfile(currentProfileId) : null;
        const relationship = currentProfileId
            ? getCurrentRelationship(state, currentProfileId)
            : null;
        this.currentUserId = state.user && state.user._id;
        const profileName = profile && profile.name ? profile.name : "";
        const nextMeta = {
            profiles,
            currentProfileId,
            hasProfile: Boolean(profile),
            profileName,
            profileTitle: profile ? `${profileName}的记录` : "来自儿女的关心",
            canWriteCurrentProfile: profile
                ? canWrite(state, currentProfileId)
                : false,
            isViewerMode: profile ? isViewer(state, currentProfileId) : false,
            relationshipRole: relationship ? relationship.role : "",
        };
        const nextSignature = [
            nextMeta.currentProfileId,
            nextMeta.hasProfile ? "1" : "0",
            nextMeta.profileName,
            nextMeta.profileTitle,
            nextMeta.canWriteCurrentProfile ? "1" : "0",
            nextMeta.isViewerMode ? "1" : "0",
            nextMeta.relationshipRole,
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
        const showRecordPanel = Object.prototype.hasOwnProperty.call(
            overrides,
            "showRecordPanel",
        )
            ? overrides.showRecordPanel
            : this.data.showRecordPanel;

        this.setTabBarVisible(!(showProfileSwitcher || showRecordPanel));
    },

    enterPageLoading() {
        this.setData({ pageReady: false });
    },

    resetLoadedProfileState() {
        this.chartRenderToken += 1;
        this.lastLoadedProfileId = "";
        this.lastRefreshAt = 0;
        this.coverageDayCount = NaN;
        this.allRecords = [];
        this.rangeRecords = [];
        this.chartData = null;
        this.latestRecord = null;
    },

    handleCurrentProfileChange(profileId) {
        this.lastSeenProfileId = profileId || "";
        this.resetLoadedProfileState();
        this.syncProfileMeta();
        return this.loadPageData({
            force: true,
            resetReady: true,
        });
    },

    shouldRefreshOnShow() {
        if (store.isStale("profiles", null, STALE_REFRESH_TTL_MS)) {
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

    async loadPageData(options = {}) {
        const run = (async () => {
            const force = options.force === true;
            const resetReady = options.resetReady === true;
            const profileId = store.getState().currentProfileId;

            if (resetReady) {
                this.enterPageLoading();
            }

            if (!profileId) {
                consumePendingRecordPanelOpen();
                this.resetLoadedProfileState();
                this.setData({
                    pageReady: true,
                    _lastProfileId: "",
                    hasProfile: false,
                    isLoading: false,
                    errorText: "",
                    latestRecord: null,
                    latestRecordDisplay: null,
                    hasAnyRecords: false,
                    hasRangeRecords: false,
                    hasHeartRateData: false,
                    rangeSummary: {
                        normalCount: 0,
                        abnormalCount: 0,
                        averageText: "--",
                    },
                    heartRateSummary: {
                        normalCount: 0,
                        abnormalCount: 0,
                        averageText: "--",
                    },
                    periodOptions: buildPeriodOptions(NaN),
                });
                return;
            }

            const shouldSkip =
                !force &&
                this.lastLoadedProfileId === profileId &&
                Date.now() - this.lastRefreshAt < REFRESH_TTL_MS;

            if (shouldSkip) {
                this.consumePendingRecordPanelOpen();
                return;
            }

            const profile = findProfile(profileId);
            if (!profile) {
                consumePendingRecordPanelOpen();
                this.rangeRecords = [];
                this.chartData = null;
                this.setData({
                    pageReady: true,
                    _lastProfileId: "",
                    hasProfile: false,
                    isLoading: false,
                    errorText: "档案不存在或已被移除",
                });
                return;
            }

            this.requestId += 1;
            const requestId = this.requestId;
            const shouldUseCacheStage = !force;
            let cacheRendered = false;

            this.setData({
                isLoading: true,
                errorText: "",
            });

            try {
                const tryRenderCache = () => {
                    if (
                        !shouldUseCacheStage ||
                        requestId !== this.requestId ||
                        this._pendingCacheLatest === undefined ||
                        this._pendingCacheRecords === undefined
                    ) {
                        return;
                    }

                    this.latestRecord = this._pendingCacheLatest || null;
                    this.allRecords = Array.isArray(this._pendingCacheRecords)
                        ? this._pendingCacheRecords.slice()
                        : [];
                    delete this._pendingCacheLatest;
                    delete this._pendingCacheRecords;

                    cacheRendered = true;
                    this.lastLoadedProfileId = profileId;
                    this.lastRefreshAt = Date.now();
                    this.coverageDayCount = countUniqueMeasuredDays(
                        this.allRecords,
                    );
                    this.applyViewModel();
                };

                let latestError = null;
                let recordError = null;
                const latestPromise = recordService.loadLatestRecord(
                    profileId,
                    {
                        onCacheHit: shouldUseCacheStage
                            ? ({ record }) => {
                                  this._pendingCacheLatest = record || null;
                                  tryRenderCache();
                              }
                            : undefined,
                        onError(error) {
                            latestError = error;
                        },
                    },
                );

                const recordsPromise = recordService.loadRecords(
                    profileId,
                    { limit: 200 },
                    {
                        onCacheHit: shouldUseCacheStage
                            ? ({ records }) => {
                                  this._pendingCacheRecords =
                                      Array.isArray(records)
                                          ? records.slice()
                                          : [];
                                  tryRenderCache();
                              }
                            : undefined,
                        onError(error) {
                            recordError = error;
                        },
                    },
                );

                const [latestResult, recordResult] = await Promise.all([
                    latestPromise,
                    recordsPromise,
                ]);

                delete this._pendingCacheLatest;
                delete this._pendingCacheRecords;

                if (requestId !== this.requestId) {
                    return;
                }

                if (!latestResult || !recordResult) {
                    if (cacheRendered) {
                        if (recordResult) {
                            this.allRecords = Array.isArray(
                                recordResult.records,
                            )
                                ? recordResult.records.slice()
                                : this.allRecords || [];
                        }

                        if (latestResult) {
                            this.latestRecord =
                                latestResult.record ||
                                this.latestRecord ||
                                this.allRecords[0] ||
                                null;
                        } else {
                            this.latestRecord =
                                this.latestRecord ||
                                this.allRecords[0] ||
                                null;
                        }

                        this.lastLoadedProfileId = profileId;
                        this.lastRefreshAt = Date.now();
                        this.coverageDayCount = countUniqueMeasuredDays(
                            this.allRecords,
                        );
                        this.applyViewModel();
                        return;
                    }

                    throw (
                        latestError ||
                        recordError ||
                        new Error("RECORDS_LOAD_FAILED")
                    );
                }

                this.lastLoadedProfileId = profileId;
                this.lastRefreshAt = Date.now();
                this.allRecords = Array.isArray(recordResult.records)
                    ? recordResult.records.slice()
                    : this.allRecords || [];
                this.coverageDayCount = countUniqueMeasuredDays(
                    this.allRecords,
                );
                this.latestRecord =
                    latestResult.record ||
                    this.latestRecord ||
                    this.allRecords[0] ||
                    null;

                this.applyViewModel();
            } catch (error) {
                delete this._pendingCacheLatest;
                delete this._pendingCacheRecords;

                if (requestId !== this.requestId) {
                    return;
                }

                consumePendingRecordPanelOpen();
                this.chartRenderToken += 1;
                this.rangeRecords = [];
                this.chartData = null;
                this.setData({
                    pageReady: true,
                    _lastProfileId: profileId,
                    isLoading: false,
                    errorText: getErrorMessage(error),
                    latestRecord: null,
                    latestRecordDisplay: null,
                    hasAnyRecords: false,
                    hasRangeRecords: false,
                    hasHeartRateData: false,
                    rangeSummary: {
                        normalCount: 0,
                        abnormalCount: 0,
                        averageText: "--",
                    },
                    heartRateSummary: {
                        normalCount: 0,
                        abnormalCount: 0,
                        averageText: "--",
                    },
                    periodOptions: buildPeriodOptions(NaN),
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

    applyViewModel() {
        const profileId = this.data.currentProfileId;
        const profile = profileId ? findProfile(profileId) : null;
        const periodOptions = buildPeriodOptions(
            this.coverageDayCount,
            this.allRecords,
        );
        const selectedOption = periodOptions.find(
            (item) => item.days === this.data.selectedDays && item.enabled,
        );
        const nextSelectedDays = selectedOption
            ? this.data.selectedDays
            : (
                  periodOptions.find((item) => item.enabled) ||
                  periodOptions[0] || { days: 7 }
              ).days;
        const latestRecordDisplay = buildLatestDisplay(
            this.latestRecord,
            profile,
        );
        const showRecorderLabel = shouldShowRecorderLabel(this.allRecords, {
            role: this.data.relationshipRole,
            currentUserId: this.currentUserId,
        });
        if (latestRecordDisplay) {
            latestRecordDisplay.recorderText = buildRecorderText(
                this.latestRecord,
                {
                    currentUserId: this.currentUserId,
                    showRecorderLabel,
                },
            );
        }

        this.chartThreshold = getThreshold(profile);
        this.rangeRecords = getRangeRecords(
            this.allRecords,
            nextSelectedDays,
            new Date(),
        );
        this.chartData = buildChartTimeline(
            this.rangeRecords,
            nextSelectedDays,
            this.chartThreshold,
            new Date(),
        );

        const hasAnyRecords = this.allRecords.length > 0;
        const hasRangeRecords = this.rangeRecords.length > 0;
        const hasHeartRateData = Boolean(
            this.chartData && this.chartData.hasHeartRateData,
        );
        const rangeSummary = buildRangeSummary(
            this.rangeRecords,
            this.chartThreshold,
        );
        const heartRateSummary = buildHeartRateSummary(this.rangeRecords);

        this.setData(
            {
                pageReady: true,
                _lastProfileId: profileId,
                selectedDays: nextSelectedDays,
                isLoading: false,
                errorText: "",
                latestRecord: this.latestRecord,
                latestRecordDisplay,
                hasAnyRecords,
                hasRangeRecords,
                hasHeartRateData,
                rangeSummary,
                heartRateSummary,
                periodOptions,
            },
            () => {
                this.consumePendingRecordPanelOpen();
                if (hasRangeRecords) {
                    this.scheduleChartRender();
                } else {
                    this.chartRenderToken += 1;
                }
            },
        );
    },

    scheduleChartRender() {
        const token = ++this.chartRenderToken;

        setTimeout(() => {
            if (token !== this.chartRenderToken) {
                return;
            }

            this.renderCharts(token);
        }, 0);
    },

    getCanvasNode(selector) {
        return new Promise((resolve, reject) => {
            wx.createSelectorQuery()
                .select(selector)
                .fields({ node: true, size: true })
                .exec((result) => {
                    const target = result && result[0];
                    if (
                        !target ||
                        !target.node ||
                        !target.width ||
                        !target.height
                    ) {
                        reject(new Error(`canvas not ready: ${selector}`));
                        return;
                    }

                    resolve(target);
                });
        });
    },

    async renderCharts(token) {
        try {
            await this.renderBloodPressureChart(token);
            if (this.data.hasHeartRateData) {
                await this.renderHeartRateChart(token);
            }
        } catch (error) {
            console.error("[data] render charts failed", error);
        }
    },

    async renderBloodPressureChart(token) {
        const target = await this.getCanvasNode("#dataBpChart");
        if (token !== this.chartRenderToken) {
            return;
        }

        const canvas = target.node;
        const width = target.width;
        const height = target.height;
        canvas.width = Math.max(1, Math.round(width * this.pixelRatio));
        canvas.height = Math.max(1, Math.round(height * this.pixelRatio));

        const ctx = canvas.getContext("2d");
        ctx.scale(this.pixelRatio, this.pixelRatio);
        drawBloodPressureTrendChart(
            ctx,
            this.chartData,
            this.chartThreshold,
            { width, height },
            this.data.selectedDays,
            { hideTitle: true },
        );
    },

    async renderHeartRateChart(token) {
        const target = await this.getCanvasNode("#dataHeartRateChart");
        if (token !== this.chartRenderToken) {
            return;
        }

        const canvas = target.node;
        const width = target.width;
        const height = target.height;
        canvas.width = Math.max(1, Math.round(width * this.pixelRatio));
        canvas.height = Math.max(1, Math.round(height * this.pixelRatio));

        const ctx = canvas.getContext("2d");
        ctx.scale(this.pixelRatio, this.pixelRatio);
        drawHeartRateChart(
            ctx,
            this.chartData,
            this.chartThreshold,
            { width, height },
            this.data.selectedDays,
            { hideTitle: true },
        );
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

    handleCreateProfile() {
        wx.navigateTo({
            url: `/pages/profile-edit/profile-edit?mode=create&returnTab=${encodeURIComponent("/pages/data/data")}`,
        });
    },

    handleOpenRecordPanel() {
        if (!this.data.canWriteCurrentProfile) {
            return;
        }

        this.setData({
            showRecordPanel: true,
            editingRecord: null,
        });
    },

    setEditingRecord(record) {
        if (!this.data.canWriteCurrentProfile || !this.data.currentProfileId) {
            return;
        }

        this.setData({
            showRecordPanel: true,
            editingRecord: record || null,
        });
    },

    consumePendingRecordPanelOpen() {
        if (!consumePendingRecordPanelOpen()) {
            return;
        }

        if (!this.data.canWriteCurrentProfile || !this.data.currentProfileId) {
            return;
        }

        this.handleOpenRecordPanel();
    },

    handleCloseRecordPanel() {
        this.setData({
            showRecordPanel: false,
            editingRecord: null,
        });
    },

    handleRecordPanelVisibilityChange(event) {
        this.syncTabBarVisibility({
            showRecordPanel: Boolean(
                event && event.detail && event.detail.visible,
            ),
        });
    },

    handleRecordPanelSuccess() {
        this.handleCloseRecordPanel();
        this.loadPageData({ force: true });
    },

    handleRecordPanelDelete() {
        this.handleCloseRecordPanel();
        this.loadPageData({ force: true });
    },

    handleSelectPeriod(event) {
        const days = Number(event.currentTarget.dataset.days);
        const option = (this.data.periodOptions || []).find(
            (item) => item.days === days,
        );

        if (!days || !option) {
            return;
        }

        if (!option.enabled) {
            wx.showToast({
                title: getDisabledPeriodToast(days),
                icon: "none",
            });
            return;
        }

        if (days === this.data.selectedDays) {
            return;
        }

        this.setData(
            {
                selectedDays: days,
            },
            () => {
                this.applyViewModel();
            },
        );
    },

    handleViewAllRecords() {
        if (!this.data.currentProfileId) {
            return;
        }

        wx.navigateTo({
            url: `/pages/records-list/records-list?profileId=${this.data.currentProfileId}`,
        });
    },

    handleImportRecords() {
        if (!this.data.currentProfileId) {
            return;
        }

        wx.navigateTo({
            url: `/pages/import-records/import-records?profileId=${this.data.currentProfileId}`,
        });
    },

    handleExportBloodPressureChart() {
        this.exportChartImage("bp");
    },

    handleExportHeartRateChart() {
        this.exportChartImage("hr");
    },

    async exportChartImage(chartType) {
        const isHeartRateChart = chartType === "hr";
        if (this.data.isExportingChart || !this.data.hasRangeRecords) {
            if (!this.data.hasRangeRecords) {
                wx.showToast({
                    title: "该时间段内暂无趋势数据",
                    icon: "none",
                });
            }
            return;
        }

        if (isHeartRateChart && !this.data.hasHeartRateData) {
            wx.showToast({
                title: "暂无心率数据",
                icon: "none",
            });
            return;
        }

        this.setData({ isExportingChart: true });

        try {
            const exportHeight = buildChartExportHeight();
            const exportScale = Math.max(1, Number(this.pixelRatio) || 1);
            this.setData({ exportCanvasHeight: exportHeight });

            await wait(80);
            const target = await this.getCanvasNode("#dataExportCanvas");
            const canvas = target.node;
            canvas.width = Math.max(
                1,
                Math.round(EXPORT_CHART_CANVAS_WIDTH * exportScale),
            );
            canvas.height = Math.max(1, Math.round(exportHeight * exportScale));

            const ctx = canvas.getContext("2d");
            ctx.scale(exportScale, exportScale);
            ctx.clearRect(0, 0, EXPORT_CHART_CANVAS_WIDTH, exportHeight);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, EXPORT_CHART_CANVAS_WIDTH, exportHeight);

            ctx.textAlign = "center";
            ctx.fillStyle = "#111827";
            ctx.font = `bold ${EXPORT_CHART_TITLE_FONT_SIZE}px sans-serif`;
            ctx.fillText(
                `${this.data.profileName || "当前档案"}的${isHeartRateChart ? "心率数据" : "血压数据"}`,
                EXPORT_CHART_CANVAS_WIDTH / 2,
                EXPORT_CHART_TITLE_Y,
            );
            ctx.fillStyle = "#6B7280";
            ctx.font = `${EXPORT_CHART_SUBTITLE_FONT_SIZE}px sans-serif`;
            ctx.fillText(
                `近 ${this.data.selectedDays} 天数据（${formatExportDateRange(this.data.selectedDays)}）`,
                EXPORT_CHART_CANVAS_WIDTH / 2,
                EXPORT_CHART_SUBTITLE_Y,
            );

            ctx.save();
            ctx.translate(20, EXPORT_CHART_TOP);
            if (isHeartRateChart) {
                drawHeartRateChart(
                    ctx,
                    this.chartData,
                    this.chartThreshold,
                    { width: 710, height: EXPORT_CHART_HEIGHT },
                    this.data.selectedDays,
                    { hideTitle: true },
                );
            } else {
                drawBloodPressureTrendChart(
                    ctx,
                    this.chartData,
                    this.chartThreshold,
                    { width: 710, height: EXPORT_CHART_HEIGHT },
                    this.data.selectedDays,
                    { hideTitle: true },
                );
            }
            ctx.restore();

            const summaryText = buildChartExportSummaryText(
                chartType,
                this.data.selectedDays,
                this.data.rangeSummary,
                this.data.heartRateSummary,
            );
            ctx.fillStyle = "#94A3B8";
            ctx.font = `${EXPORT_CHART_SUMMARY_FONT_SIZE}px sans-serif`;
            ctx.fillText(
                summaryText,
                EXPORT_CHART_CANVAS_WIDTH / 2,
                EXPORT_CHART_SUMMARY_Y,
            );

            const result = await wrapCanvasToTempFilePath(canvas, {
                x: 0,
                y: 0,
                width: EXPORT_CHART_CANVAS_WIDTH,
                height: exportHeight,
                destWidth: Math.max(
                    1,
                    Math.round(EXPORT_CHART_CANVAS_WIDTH * exportScale),
                ),
                destHeight: Math.max(1, Math.round(exportHeight * exportScale)),
            });
            this.exportTempFilePath = result.tempFilePath || "";
            await this.trySaveImageToAlbum(this.exportTempFilePath, {
                allowPermissionRecovery: true,
            });
        } catch (error) {
            console.error("[data] export chart failed", error);
            wx.showToast({
                title: "导出失败，请重试",
                icon: "none",
            });
        } finally {
            this.setData({ isExportingChart: false });
        }
    },

    async trySaveImageToAlbum(filePath, options = {}) {
        try {
            await wrapSaveImageToPhotosAlbum(filePath);
            wx.showToast({
                title: "已保存到相册",
                icon: "success",
            });
            return true;
        } catch (error) {
            if (
                options.allowPermissionRecovery &&
                isPermissionInterrupted(error)
            ) {
                this.setData({
                    showPermissionModal: true,
                });
                return false;
            }

            if (options.showFailureToast !== false) {
                wx.showToast({
                    title: "保存失败，请重试",
                    icon: "none",
                });
            }
            return false;
        }
    },

    handleClosePermissionModal() {
        this.setData({
            showPermissionModal: false,
        });
    },

    handleOpenPermissionSetting() {
        const filePath = this.exportTempFilePath;
        this.setData({
            showPermissionModal: false,
        });

        wx.openSetting({
            success: async (res) => {
                const authSetting =
                    res && res.authSetting ? res.authSetting : {};
                const hasPermission =
                    authSetting["scope.writePhotosAlbum"] === true;

                if (hasPermission && filePath) {
                    this.setData({ isExportingChart: true });
                    try {
                        const saved = await this.trySaveImageToAlbum(filePath, {
                            allowPermissionRecovery: false,
                            showFailureToast: false,
                        });
                        if (!saved) {
                            showSystemPermissionHint();
                        }
                    } finally {
                        this.setData({ isExportingChart: false });
                    }
                    return;
                }

                showSystemPermissionHint();
            },
            fail: (error) => {
                console.error("[data] openSetting failed", error);
                wx.showToast({
                    title: "无法打开设置",
                    icon: "none",
                });
            },
        });
    },
});
