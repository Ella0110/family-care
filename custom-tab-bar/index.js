const { store } = require("../store/index");
const { canWrite } = require("../utils/permission-helpers");
const {
  DEFAULT_FONT_SCALE,
  normalizeFontScale,
  syncFontData,
} = require("../utils/font-scale");

// SVG 图标直接内嵌为 base64 data URI，不依赖 PNG 文件，大小由 CSS 完全控制
const ICON_DATA = {
  data: {
    normal: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzk0QTNCOCI+PHJlY3QgeD0iMyIgeT0iMTIiIHdpZHRoPSI0IiBoZWlnaHQ9IjkiIHJ4PSIxIi8+PHJlY3QgeD0iMTAiIHk9IjciIHdpZHRoPSI0IiBoZWlnaHQ9IjE0IiByeD0iMSIvPjxyZWN0IHg9IjE3IiB5PSIzIiB3aWR0aD0iNCIgaGVpZ2h0PSIxOCIgcng9IjEiLz48L3N2Zz4=",
    active: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzMxODJGNyI+PHJlY3QgeD0iMyIgeT0iMTIiIHdpZHRoPSI0IiBoZWlnaHQ9IjkiIHJ4PSIxIi8+PHJlY3QgeD0iMTAiIHk9IjciIHdpZHRoPSI0IiBoZWlnaHQ9IjE0IiByeD0iMSIvPjxyZWN0IHg9IjE3IiB5PSIzIiB3aWR0aD0iNCIgaGVpZ2h0PSIxOCIgcng9IjEiLz48L3N2Zz4=",
  },
  profile: {
    normal: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzk0QTNCOCI+PGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0Ii8+PHBhdGggZD0iTTQgMjBjMC0zLjMgMy42LTYgOC02czggMi43IDggNkg0eiIvPjwvc3ZnPg==",
    active: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzMxODJGNyI+PGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0Ii8+PHBhdGggZD0iTTQgMjBjMC0zLjMgMy42LTYgOC02czggMi43IDggNkg0eiIvPjwvc3ZnPg==",
  },
};

const TAB_ITEMS = [
  {
    key: "data",
    pagePath: "pages/data/data",
    text: "数据",
    iconPath: ICON_DATA.data.normal,
    selectedIconPath: ICON_DATA.data.active,
  },
  {
    key: "profile",
    pagePath: "pages/profile-home/profile-home",
    text: "档案",
    iconPath: ICON_DATA.profile.normal,
    selectedIconPath: ICON_DATA.profile.active,
  },
];

Component({
  data: {
    tabs: TAB_ITEMS,
    selectedPath: "pages/data/data",
    canOpenRecord: false,
    show: true,
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
  },

  lifetimes: {
    attached() {
      this.lastCanOpenRecord = null;
      this._switching = false;
      this._switchResetTimer = null;
      this._pendingSelectedPath = "";
      this.syncFromStore();
      this.syncFontScale();
      this.unsubscribe = store.subscribe(() => {
        this.syncFromStore();
      });
    },
    detached() {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
      if (this._switchResetTimer) {
        clearTimeout(this._switchResetTimer);
        this._switchResetTimer = null;
      }
      this._switching = false;
      this._pendingSelectedPath = "";
    },
  },

  pageLifetimes: {
    show() {
      this.syncFromStore();
      this.syncFontScale();
    },
  },

  observers: {
    selectedPath(nextSelectedPath) {
      if (
        this._pendingSelectedPath
        && this._pendingSelectedPath === nextSelectedPath
      ) {
        this.releaseSwitchLock();
      }
    },
  },

  methods: {
    acquireSwitchLock(selectedPath = "") {
      if (this._switching) {
        return false;
      }

      this._switching = true;
      this._pendingSelectedPath = selectedPath || "";
      if (this._switchResetTimer) {
        clearTimeout(this._switchResetTimer);
      }
      this._switchResetTimer = setTimeout(() => {
        this.releaseSwitchLock();
      }, 600);
      return true;
    },

    releaseSwitchLock() {
      this._switching = false;
      this._pendingSelectedPath = "";
      if (this._switchResetTimer) {
        clearTimeout(this._switchResetTimer);
        this._switchResetTimer = null;
      }
    },

    setVisible(visible) {
      this.setData({
        show: visible !== false,
      });
    },

    syncFromStore() {
      const state = store.getState();
      const currentProfileId = state.currentProfileId || "";
      const canOpenRecord = Boolean(
        currentProfileId && canWrite(state, currentProfileId),
      );
      if (canOpenRecord === this.lastCanOpenRecord) {
        return;
      }

      this.lastCanOpenRecord = canOpenRecord;
      this.setData({ canOpenRecord });
    },

    syncFontScale() {
      const app = typeof getApp === "function" ? getApp() : null;
      const fontScale = normalizeFontScale(
        app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE,
      );
      if (fontScale === this.data.fontScale && this.data.fs && this.data.fs.caption) {
        return;
      }

      syncFontData.call(this);
    },

    getCurrentRoute() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      return currentPage && currentPage.route
        ? currentPage.route
        : "";
    },

    handleSwitchTab(event) {
      if (this._switching) {
        return;
      }

      const pagePath = event.currentTarget.dataset.path;
      const currentRoute = this.getCurrentRoute();
      if (!pagePath || pagePath === currentRoute || !this.acquireSwitchLock(pagePath)) {
        return;
      }
      wx.switchTab({
        url: `/${pagePath}`,
        fail: () => {
          this.releaseSwitchLock();
        },
      });
    },

    handleOpenRecordPanel() {
      if (!this.data.canOpenRecord || this._switching) {
        return;
      }

      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];

      if (
        currentPage
        && currentPage.route === "pages/data/data"
        && typeof currentPage.handleOpenRecordPanel === "function"
      ) {
        currentPage.handleOpenRecordPanel();
        return;
      }

      const app = getApp();
      if (app && typeof app.requestOpenRecordPanelOnDataTab === "function") {
        app.requestOpenRecordPanelOnDataTab();
      } else if (app && app.globalData) {
        app.globalData.openRecordPanelOnDataTab = true;
      }

      if (!this.acquireSwitchLock("pages/data/data")) {
        return;
      }

      wx.switchTab({
        url: "/pages/data/data",
        fail: () => {
          this.releaseSwitchLock();
        },
      });
    },
  },
});
