const { store } = require('../../store/index');
const medicationService = require('../../services/medication-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { DEFAULT_FONT_SCALE, normalizeFontScale, syncFontData } = require('../../utils/font-scale');
const { canWrite } = require('../../utils/permission-helpers');

const DELETE_ACTION_WIDTH_RPX = 148;
const DELETE_ACTION_THRESHOLD_RPX = 72;

function getCurrentFontScale() {
  const app = typeof getApp === 'function' ? getApp() : null;
  return normalizeFontScale(app && app.globalData ? app.globalData.fontScale : DEFAULT_FONT_SCALE);
}

function buildSwipeStyle(offset = 0) {
  return `transform: translateX(${offset}rpx);`;
}

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function buildTimingText(medication) {
  const timing = String((medication && medication.timing) || '').trim();
  return timing || '服用时间未填写';
}

function normalizeMedicationList(items = [], { historical = false, sectionKey = '' } = {}) {
  return items
    .filter(Boolean)
    .map((item) => ({
      _id: item._id || '',
      drug: item.drug || '未命名药物',
      summaryText: [item.dose || '', item.frequency || '']
        .filter(Boolean)
        .join(' · '),
      timingText: buildTimingText(item),
      isHistorical: historical,
      sectionKey,
      swipeOffsetText: buildSwipeStyle(0),
    }));
}

function showConfirmModal(options) {
  return new Promise((resolve, reject) => {
    wx.showModal(
      Object.assign({}, options, {
        success: resolve,
        fail: reject,
      }),
    );
  });
}

Page({
  data: {
    fontScale: DEFAULT_FONT_SCALE,
    fs: {},
    profileId: '',
    canWriteCurrentProfile: false,
    isLoading: false,
    hasLoadedOnce: false,
    errorText: '',
    activeMedications: [],
    historicalMedications: [],
    hasAnyMedication: false,
    openDeleteMedicationId: '',
    openDeleteSection: '',
    openDeleteIndex: -1,
    activeSwipeMedicationId: '',
    activeSwipeSection: '',
    activeSwipeIndex: -1,
    swipeOffsetRpx: 0,
    isDeletingMedicationId: '',
  },

  onLoad(options = {}) {
    this.syncFontScale();
    const profileId = options.profileId || store.getState().currentProfileId || '';
    const profile = findProfile(profileId);

    this.profileId = profileId;
    this.requestId = 0;
    this.rowTouchState = null;
    this.lastSwipeMoveAt = 0;
    this.lastSwipeGesture = null;

    this.setData({
      profileId,
      canWriteCurrentProfile: canWrite(store.getState(), profileId),
      errorText: profileId && profile ? '' : '档案不存在',
    });
  },

  onShow() {
    this.syncFontScale();
    if (!this.data.profileId) {
      return;
    }

    this.loadMedications();
  },

  syncFontScale() {
    syncFontData.call(this);
  },

  applyMedicationGroups(groups = {}) {
    const activeMedications = normalizeMedicationList(groups.active, {
      historical: false,
      sectionKey: 'activeMedications',
    });
    const historicalMedications = normalizeMedicationList(groups.historical, {
      historical: true,
      sectionKey: 'historicalMedications',
    });

    this.setData({
      activeMedications,
      historicalMedications,
      hasAnyMedication: activeMedications.length + historicalMedications.length > 0,
      hasLoadedOnce: true,
      openDeleteMedicationId: '',
      openDeleteSection: '',
      openDeleteIndex: -1,
      activeSwipeMedicationId: '',
      activeSwipeSection: '',
      activeSwipeIndex: -1,
      swipeOffsetRpx: 0,
    });
  },

  loadMedications() {
    const requestId = this.requestId + 1;
    this.requestId = requestId;

    this.setData({
      isLoading: !this.data.hasLoadedOnce,
      errorText: '',
    });

    return medicationService.loadMedications(this.data.profileId, {
      onCacheHit: (groups) => {
        if (requestId !== this.requestId) {
          return;
        }

        this.applyMedicationGroups(groups);
      },
      onFresh: (groups) => {
        if (requestId !== this.requestId) {
          return;
        }

        this.applyMedicationGroups(groups);
        this.setData({
          isLoading: false,
          errorText: '',
        });
      },
      onError: (error, context = {}) => {
        if (requestId !== this.requestId) {
          return;
        }

        this.setData({
          isLoading: false,
          hasLoadedOnce: true,
          errorText: context.hasCache ? '' : getErrorMessage(error),
        });
      },
    }).finally(() => {
      if (requestId !== this.requestId) {
        return;
      }

      this.setData({
        isLoading: false,
      });
    });
  },

  applySwipePatch(entries = [], nextData = {}) {
    const patch = Object.assign({}, nextData);

    entries.forEach((entry) => {
      if (!entry || !entry.section || entry.index < 0) {
        return;
      }

      patch[`${entry.section}[${entry.index}].swipeOffsetText`] = buildSwipeStyle(entry.offset || 0);
    });

    this.setData(patch);
  },

  closeSwipeCard() {
    if (!this.data.openDeleteMedicationId && !this.data.activeSwipeMedicationId) {
      return;
    }

    const entries = [];
    if (this.data.openDeleteSection && this.data.openDeleteIndex >= 0) {
      entries.push({
        section: this.data.openDeleteSection,
        index: this.data.openDeleteIndex,
        offset: 0,
      });
    }
    if (
      this.data.activeSwipeMedicationId
      && this.data.activeSwipeMedicationId !== this.data.openDeleteMedicationId
      && this.data.activeSwipeSection
      && this.data.activeSwipeIndex >= 0
    ) {
      entries.push({
        section: this.data.activeSwipeSection,
        index: this.data.activeSwipeIndex,
        offset: 0,
      });
    }

    this.applySwipePatch(entries, {
      openDeleteMedicationId: '',
      openDeleteSection: '',
      openDeleteIndex: -1,
      activeSwipeMedicationId: '',
      activeSwipeSection: '',
      activeSwipeIndex: -1,
      swipeOffsetRpx: 0,
    });
  },

  handleCardTouchStart(event) {
    if (!this.data.canWriteCurrentProfile || this.data.isDeletingMedicationId) {
      return;
    }

    const medicationId = event.currentTarget.dataset.id;
    const section = event.currentTarget.dataset.section;
    const index = Number(event.currentTarget.dataset.index);
    const touch = event.touches && event.touches[0];

    if (!medicationId || !section || Number.isNaN(index) || !touch) {
      return;
    }

    if (this.data.openDeleteMedicationId && this.data.openDeleteMedicationId !== medicationId) {
      this.closeSwipeCard();
    }

    this.rowTouchState = {
      medicationId,
      section,
      index,
      startX: touch.clientX,
      startY: touch.clientY,
      baseOffset:
        this.data.openDeleteMedicationId === medicationId ? -DELETE_ACTION_WIDTH_RPX : 0,
      direction: '',
      moved: false,
    };
  },

  handleCardTouchMove(event) {
    const state = this.rowTouchState;
    const medicationId = event.currentTarget.dataset.id;
    const touch = event.touches && event.touches[0];

    if (!state || state.medicationId !== medicationId || !touch) {
      return;
    }

    const deltaX = touch.clientX - state.startX;
    const deltaY = touch.clientY - state.startY;

    if (!state.direction) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
        return;
      }

      state.direction = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }

    if (state.direction !== 'horizontal') {
      return;
    }

    const moveAt = Date.now();
    if (moveAt - this.lastSwipeMoveAt < 16) {
      return;
    }
    this.lastSwipeMoveAt = moveAt;

    let nextOffset = state.baseOffset + deltaX;
    nextOffset = Math.min(0, nextOffset);
    nextOffset = Math.max(-DELETE_ACTION_WIDTH_RPX, nextOffset);

    state.moved = true;

    this.applySwipePatch(
      [
        {
          section: state.section,
          index: state.index,
          offset: nextOffset,
        },
      ],
      {
        activeSwipeMedicationId: state.medicationId,
        activeSwipeSection: state.section,
        activeSwipeIndex: state.index,
        swipeOffsetRpx: nextOffset,
      },
    );
  },

  handleCardTouchEnd() {
    const state = this.rowTouchState;
    if (!state) {
      return;
    }

    if (state.direction !== 'horizontal' || !state.moved) {
      this.rowTouchState = null;
      return;
    }

    const finalOffset = this.data.activeSwipeMedicationId === state.medicationId
      ? this.data.swipeOffsetRpx
      : state.baseOffset;
    const shouldOpen = Math.abs(finalOffset) > DELETE_ACTION_THRESHOLD_RPX;

    this.lastSwipeGesture = {
      medicationId: state.medicationId,
      at: Date.now(),
    };

    this.setData({
      openDeleteMedicationId: shouldOpen ? state.medicationId : '',
      openDeleteSection: shouldOpen ? state.section : '',
      openDeleteIndex: shouldOpen ? state.index : -1,
      activeSwipeMedicationId: '',
      activeSwipeSection: '',
      activeSwipeIndex: -1,
      swipeOffsetRpx: 0,
    });

    this.applySwipePatch([
      {
        section: state.section,
        index: state.index,
        offset: shouldOpen ? -DELETE_ACTION_WIDTH_RPX : 0,
      },
    ]);

    this.rowTouchState = null;
  },

  handleRetry() {
    this.loadMedications();
  },

  handleCreateMedication() {
    if (!this.data.canWriteCurrentProfile) {
      return;
    }

    wx.navigateTo({
      url: `/pages/medication-detail/medication-detail?mode=create&profileId=${this.data.profileId}`,
    });
  },

  handleOpenMedicationDetail(event) {
    const medicationId = event.currentTarget.dataset.id || '';
    if (!medicationId || !this.data.canWriteCurrentProfile) {
      return;
    }

    if (
      this.lastSwipeGesture
      && this.lastSwipeGesture.medicationId === medicationId
      && Date.now() - this.lastSwipeGesture.at < 250
    ) {
      return;
    }

    if (this.data.openDeleteMedicationId === medicationId) {
      this.closeSwipeCard();
      return;
    }

    wx.navigateTo({
      url: `/pages/medication-detail/medication-detail?mode=edit&profileId=${this.data.profileId}&medicationId=${medicationId}`,
    });
  },

  async handleDeleteMedication(event) {
    const medicationId = event.currentTarget.dataset.id || '';

    if (!medicationId || !this.data.canWriteCurrentProfile || this.data.isDeletingMedicationId) {
      return;
    }

    const result = await showConfirmModal({
      title: '确定删除这条用药？',
      content: '删除后无法恢复',
      confirmText: '删除',
      confirmColor: '#ef4444',
      cancelText: '取消',
    });

    if (!result.confirm) {
      return;
    }

    this.setData({
      isDeletingMedicationId: medicationId,
    });

    try {
      await medicationService.deleteMedication(medicationId);
      this.closeSwipeCard();
      wx.showToast({
        title: '已删除',
        icon: 'success',
        duration: 800,
      });
      await this.loadMedications();
    } catch (error) {
      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    } finally {
      this.setData({
        isDeletingMedicationId: '',
      });
    }
  },
});
