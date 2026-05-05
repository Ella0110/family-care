const { store } = require('../../store/index');
const memberService = require('../../services/member-service');
const { getErrorMessage } = require('../../utils/error-messages');
const { getCurrentRelationship, canManage, isOwner } = require('../../utils/permission-helpers');

const STALE_THRESHOLD = 30 * 1000;

const ROLE_LABELS = {
  owner: '管理员',
  collaborator: '共同记录',
  viewer: '仅查看',
};

const ROLE_ORDER = {
  owner: 0,
  collaborator: 1,
  viewer: 2,
};

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getAvatarFallback(nickname) {
  const text = String(nickname || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : '?';
}

function decorateMembers(members, currentUserId, ownerCanManageMembers) {
  return (members || [])
    .map((member) => {
      const role = member.relationship.role;
      const isSelf = member.user && member.user._id === currentUserId;
      const isOwnerMember = role === 'owner';
      return Object.assign({}, member, {
        avatarFallback: getAvatarFallback(member.user && member.user.nickname),
        joinedText: `${isOwnerMember ? '创建于' : '加入于'} ${formatDate(member.relationship.createdAt)}`,
        roleLabel: ROLE_LABELS[role] || role,
        isSelf,
        isOwnerMember,
        showActions: ownerCanManageMembers && !isOwnerMember,
      });
    })
    .sort((left, right) => {
      const leftOrder = Object.prototype.hasOwnProperty.call(ROLE_ORDER, left.relationship.role)
        ? ROLE_ORDER[left.relationship.role]
        : Number.MAX_SAFE_INTEGER;
      const rightOrder = Object.prototype.hasOwnProperty.call(ROLE_ORDER, right.relationship.role)
        ? ROLE_ORDER[right.relationship.role]
        : Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return new Date(left.relationship.createdAt).getTime() - new Date(right.relationship.createdAt).getTime();
    });
}

function findProfile(profileId) {
  const state = store.getState();
  return (state.profiles || []).find((profile) => profile && profile._id === profileId) || null;
}

function goBackOrHome() {
  const pages = getCurrentPages();

  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }

  wx.reLaunch({
    url: '/pages/home/home',
  });
}

function buildTransferCandidates(members) {
  return (members || []).filter((member) => !member.isOwnerMember);
}

Page({
  data: {
    profileId: '',
    profileName: '当前档案',
    pageTitle: '档案成员',
    isTransferMode: false,
    isLoading: false,
    errorText: '',
    members: [],
    currentRelationshipRole: '',
    canManageMembers: false,
    transferCandidates: [],
    isRoleDialogVisible: false,
    roleDialogRelationshipId: '',
    roleDialogMemberName: '',
    roleDialogSelection: 'viewer',
    selectedNewOwnerUserId: '',
    isSubmitting: false,
  },

  onLoad(options = {}) {
    const profileId = options.profileId || '';
    const profile = findProfile(profileId);
    const isTransferMode = options.mode === 'transfer';

    this.currentUserId = store.getState().user && store.getState().user._id;
    this.hasOwnerAccess = isOwner(store.getState(), profileId);
    this.setData({
      profileId,
      profileName: profile ? profile.name : '当前档案',
      isTransferMode,
      pageTitle: isTransferMode ? '选择新管理员' : '档案成员',
    });

    if (!this.hasOwnerAccess) {
      wx.showToast({
        title: '只有管理员可以查看',
        icon: 'none',
      });
      setTimeout(() => {
        goBackOrHome();
      }, 1500);
    }
  },

  onShow() {
    if (!this.hasOwnerAccess) {
      return;
    }

    this.refreshPermissionState();
    if (!this.ensureOwnerAccess()) {
      return;
    }

    if (store.isStale('members', this.data.profileId, STALE_THRESHOLD) || !(this.data.members || []).length) {
      this.loadMembers();
    }
  },

  refreshPermissionState() {
    const state = store.getState();
    const relationship = getCurrentRelationship(state, this.data.profileId);
    this.setData({
      currentRelationshipRole: relationship ? relationship.role : '',
      canManageMembers: canManage(state, this.data.profileId),
    });
  },

  ensureOwnerAccess() {
    const state = store.getState();
    const relationship = getCurrentRelationship(state, this.data.profileId);

    if (!this.data.profileId || !relationship || !isOwner(state, this.data.profileId)) {
      wx.showToast({
        title: '只有管理员可以查看',
        icon: 'none',
      });
      setTimeout(() => {
        goBackOrHome();
      }, 1500);
      return false;
    }

    return true;
  },

  async loadMembers() {
    this.setData({
      isLoading: true,
      errorText: '',
    });

    try {
      const result = await memberService.listProfileMembers(this.data.profileId);
      const members = decorateMembers(result.members, this.currentUserId, this.data.canManageMembers);
      const candidates = buildTransferCandidates(members);

      if (this.data.isTransferMode && candidates.length === 0) {
        wx.showToast({
          title: '暂无可转让的成员',
          icon: 'none',
        });
        this.setData({
          isTransferMode: false,
          pageTitle: '档案成员',
        });
      }

      this.setData({
        members,
        transferCandidates: candidates,
        selectedNewOwnerUserId: candidates.some((member) => member.user._id === this.data.selectedNewOwnerUserId)
          ? this.data.selectedNewOwnerUserId
          : '',
        isLoading: false,
        errorText: '',
      });
    } catch (error) {
      this.setData({
        isLoading: false,
        errorText: getErrorMessage(error),
      });
    }
  },

  handleBack() {
    if (this.data.isTransferMode) {
      this.handleCancelTransferMode();
      return;
    }

    goBackOrHome();
  },

  handleInviteNewMember() {
    wx.navigateTo({
      url: `/pages/invite-create/invite-create?profileId=${this.data.profileId}`,
    });
  },

  handleOpenTransferMode() {
    if (!this.data.canManageMembers) {
      return;
    }

    this.setData({
      isTransferMode: true,
      pageTitle: '选择新管理员',
      selectedNewOwnerUserId: '',
    });
  },

  handleCancelTransferMode() {
    this.setData({
      isTransferMode: false,
      pageTitle: '档案成员',
      selectedNewOwnerUserId: '',
    });
  },

  handleSelectTransferCandidate(event) {
    this.setData({
      selectedNewOwnerUserId: event.currentTarget.dataset.userId || '',
    });
  },

  async handleConfirmTransfer() {
    const newOwnerUserId = this.data.selectedNewOwnerUserId;
    const candidate = (this.data.members || []).find(
      (member) => member.user && member.user._id === newOwnerUserId,
    );

    if (!candidate) {
      return;
    }

    const modalResult = await new Promise((resolve) => {
      wx.showModal({
        title: `确定将管理员转让给「${candidate.user.nickname || '该成员'}」？`,
        content: '此操作不可撤销',
        confirmText: '确定转让',
        confirmColor: '#b42318',
        success: resolve,
        fail() {
          resolve({ confirm: false, cancel: true });
        },
      });
    });

    if (!modalResult || !modalResult.confirm) {
      return;
    }

    this.setData({ isSubmitting: true });

    try {
      await memberService.transferOwnership(this.data.profileId, newOwnerUserId);
      const nextMembers = decorateMembers(
        (this.data.members || []).map((member) => {
          if (member.isSelf) {
            return Object.assign({}, member, {
              relationship: Object.assign({}, member.relationship, {
                role: 'collaborator',
                permissions: {
                  canView: true,
                  canWrite: true,
                  canEditProfile: false,
                  canManage: false,
                  canInvite: false,
                },
              }),
            });
          }

          if (member.user && member.user._id === newOwnerUserId) {
            return Object.assign({}, member, {
              relationship: Object.assign({}, member.relationship, {
                role: 'owner',
                permissions: {
                  canView: true,
                  canWrite: true,
                  canEditProfile: true,
                  canManage: true,
                  canInvite: true,
                },
              }),
            });
          }

          return member;
        }),
        this.currentUserId,
        false,
      );

      this.setData({
        members: nextMembers,
        transferCandidates: buildTransferCandidates(nextMembers),
        currentRelationshipRole: 'collaborator',
        canManageMembers: false,
        isTransferMode: false,
        pageTitle: '档案成员',
        selectedNewOwnerUserId: '',
      });

      wx.showToast({
        title: '已完成转让',
        icon: 'success',
      });
    } catch (error) {
      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  handleOpenMemberActions(event) {
    if (!this.data.canManageMembers) {
      return;
    }

    const relationshipId = event.currentTarget.dataset.relationshipId;
    const member = (this.data.members || []).find(
      (item) => item.relationship && item.relationship._id === relationshipId,
    );

    if (!member || member.isOwnerMember) {
      return;
    }

    wx.showActionSheet({
      itemList: ['调整角色', '移除成员'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.setData({
            isRoleDialogVisible: true,
            roleDialogRelationshipId: relationshipId,
            roleDialogMemberName: member.user.nickname || '该成员',
            roleDialogSelection: member.relationship.role,
          });
        }

        if (res.tapIndex === 1) {
          this.handleRemoveMember(member);
        }
      },
    });
  },

  handleSelectRoleOption(event) {
    this.setData({
      roleDialogSelection: event.currentTarget.dataset.role || 'viewer',
    });
  },

  handleCloseRoleDialog() {
    this.setData({
      isRoleDialogVisible: false,
      roleDialogRelationshipId: '',
      roleDialogMemberName: '',
      roleDialogSelection: 'viewer',
    });
  },

  async handleConfirmRoleUpdate() {
    const relationshipId = this.data.roleDialogRelationshipId;
    const role = this.data.roleDialogSelection;
    const member = (this.data.members || []).find(
      (item) => item.relationship && item.relationship._id === relationshipId,
    );

    if (!member || (role !== 'collaborator' && role !== 'viewer')) {
      this.handleCloseRoleDialog();
      return;
    }

    if (member.relationship.role === role) {
      this.handleCloseRoleDialog();
      return;
    }

    this.setData({ isSubmitting: true });
    try {
      const result = await memberService.updateRelationship(relationshipId, { role });
      const nextMembers = decorateMembers(
        (this.data.members || []).map((item) =>
          item.relationship && item.relationship._id === relationshipId
            ? Object.assign({}, item, { relationship: result.relationship })
            : item,
        ),
        this.currentUserId,
        this.data.canManageMembers,
      );

      this.setData({
        members: nextMembers,
        transferCandidates: buildTransferCandidates(nextMembers),
      });
      this.handleCloseRoleDialog();
      wx.showToast({
        title: `已调整为${ROLE_LABELS[role]}`,
        icon: 'success',
      });
    } catch (error) {
      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  async handleRemoveMember(memberOrEvent) {
    const member = memberOrEvent && memberOrEvent.currentTarget
      ? (this.data.members || []).find(
          (item) => item.relationship && item.relationship._id === memberOrEvent.currentTarget.dataset.relationshipId,
        )
      : memberOrEvent;

    if (!member) {
      return;
    }

    const result = await new Promise((resolve) => {
      wx.showModal({
        title: `确定移除「${member.user.nickname || '该成员'}」？`,
        content: '移除后对方将无法继续查看本档案',
        confirmText: '确定移除',
        confirmColor: '#b42318',
        success: resolve,
        fail() {
          resolve({ confirm: false, cancel: true });
        },
      });
    });

    if (!result || !result.confirm) {
      return;
    }

    this.setData({ isSubmitting: true });
    try {
      await memberService.removeRelationship(member.relationship._id, {
        relationship: member.relationship,
      });
      const nextMembers = decorateMembers(
        (this.data.members || []).filter(
          (item) => item.relationship && item.relationship._id !== member.relationship._id,
        ),
        this.currentUserId,
        this.data.canManageMembers,
      );
      this.setData({
        members: nextMembers,
        transferCandidates: buildTransferCandidates(nextMembers),
        selectedNewOwnerUserId:
          this.data.selectedNewOwnerUserId === (member.user && member.user._id)
            ? ''
            : this.data.selectedNewOwnerUserId,
      });
      wx.showToast({
        title: '已移除',
        icon: 'success',
      });
    } catch (error) {
      wx.showToast({
        title: getErrorMessage(error),
        icon: 'none',
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

});
