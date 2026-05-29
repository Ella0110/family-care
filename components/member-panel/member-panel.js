const { store } = require("../../store/index");
const memberService = require("../../services/member-service");
const { getErrorMessage } = require("../../utils/error-messages");
const { syncFontData } = require('../../utils/font-scale');
const { canManage, isOwner } = require("../../utils/permission-helpers");

const ROLE_LABELS = {
    owner: "管理员",
    collaborator: "协作者",
    viewer: "仅查看",
};

function buildMemberViewModel(member, profileId, currentUserRole) {
    const state = store.getState();
    const currentUserId = state.user && state.user._id;
    const role = (member && member.role) || "";
    const isSelf = Boolean(
        member &&
            (member.isSelf ||
                (member.userId && currentUserId && member.userId === currentUserId)),
    );
    const ownerCanManage = profileId ? canManage(state, profileId) : false;
    const actingUserIsOwner = profileId
        ? isOwner(state, profileId)
        : currentUserRole === "owner";
    const canAdjustRole = Boolean(
        ownerCanManage && actingUserIsOwner && !isSelf && role !== "owner",
    );
    const canTransferOwnership = Boolean(
        actingUserIsOwner && !isSelf && role !== "owner",
    );
    const canRemoveMember = Boolean(
        actingUserIsOwner && !isSelf && role !== "owner",
    );
    const canLeaveProfile = Boolean(isSelf && role !== "owner");

    return Object.assign({}, member || {}, {
        roleLabel: ROLE_LABELS[role] || role || "成员",
        canAdjustRole,
        canTransferOwnership,
        canRemoveMember,
        canLeaveProfile,
        canRecord: role === "collaborator",
    });
}

Component({
    properties: {
        show: {
            type: Boolean,
            value: false,
        },
        member: {
            type: Object,
            value: null,
        },
        currentUserRole: {
            type: String,
            value: "viewer",
        },
        profileId: {
            type: String,
            value: "",
        },
    },

    data: {
        fs: {},
        panelMember: null,
        showConfirmDialog: false,
        confirmTitle: "",
        confirmDescription: "",
        confirmButtonText: "",
        confirmTone: "danger",
        confirmAction: "",
        feedbackToastVisible: false,
        feedbackToastTitle: "",
        feedbackToastTone: "success",
        feedbackToastIconText: "✓",
        isSubmitting: false,
    },

    observers: {
        show(visible) {
            if (visible) {
                syncFontData.call(this);
                this.hydrateMember(this.data.member);
            } else {
                this.resetTransientState();
            }

            this.triggerEvent("visibilitychange", {
                visible: visible === true,
            });
        },

        "member,currentUserRole,profileId"(member) {
            if (!this.data.show) {
                return;
            }

            this.hydrateMember(member);
        },
    },

    lifetimes: {
        attached() {
            syncFontData.call(this);
        },
        detached() {
            this.clearTimers();
        },
    },

    pageLifetimes: {
        show() {
            syncFontData.call(this);
        },
    },

    methods: {
        hydrateMember(member) {
            this.setData({
                panelMember: member
                    ? buildMemberViewModel(
                          member,
                          this.data.profileId,
                          this.data.currentUserRole,
                      )
                    : null,
            });
        },

        clearTimers() {
            if (this.feedbackTimer) {
                clearTimeout(this.feedbackTimer);
                this.feedbackTimer = null;
            }
        },

        resetTransientState() {
            this.clearTimers();
            this.setData({
                showConfirmDialog: false,
                confirmTitle: "",
                confirmDescription: "",
                confirmButtonText: "",
                confirmTone: "danger",
                confirmAction: "",
                feedbackToastVisible: false,
                feedbackToastTitle: "",
                feedbackToastTone: "success",
                feedbackToastIconText: "✓",
                isSubmitting: false,
            });
        },

        noop() {},

        handleMaskTap() {
            this.closePanel();
        },

        closePanel() {
            this.clearTimers();
            this.setData({
                showConfirmDialog: false,
                feedbackToastVisible: false,
                isSubmitting: false,
            });
            this.triggerEvent("close");
        },

        handleCancel() {
            this.closePanel();
        },

        async handleRoleToggle(event) {
            const checked = Boolean(event && event.detail && event.detail.value);
            const member = this.data.panelMember;

            if (
                !member ||
                !member.canAdjustRole ||
                !member.relationshipId ||
                this.data.isSubmitting
            ) {
                return;
            }

            const nextRole = checked ? "collaborator" : "viewer";
            if (member.role === nextRole) {
                return;
            }

            this.setData({ isSubmitting: true });
            try {
                const result = await memberService.updateRelationship(
                    member.relationshipId,
                    { role: nextRole },
                );
                const nextMember = buildMemberViewModel(
                    Object.assign({}, member, {
                        role: result.relationship && result.relationship.role,
                        roleLabel:
                            ROLE_LABELS[
                                result.relationship && result.relationship.role
                            ] || nextRole,
                        relationship:
                            result.relationship ||
                            Object.assign({}, member.relationship, {
                                role: nextRole,
                            }),
                    }),
                    this.data.profileId,
                    this.data.currentUserRole,
                );

                this.setData({
                    panelMember: nextMember,
                    isSubmitting: false,
                });

                this.triggerEvent("memberChanged", {
                    type: "roleUpdated",
                    member: nextMember,
                });

                wx.showToast({
                    title: `已调整为${nextMember.roleLabel}`,
                    icon: "success",
                });
            } catch (error) {
                this.setData({ isSubmitting: false });
                wx.showToast({
                    title: getErrorMessage(error),
                    icon: "none",
                });
            }
        },

        openConfirmDialog(config) {
            this.setData({
                showConfirmDialog: true,
                confirmTitle: config.title || "",
                confirmDescription: config.description || "",
                confirmButtonText: config.confirmText || "确定",
                confirmTone: config.tone || "danger",
                confirmAction: config.action || "",
            });
        },

        handleTransferTap() {
            const member = this.data.panelMember;
            if (!member || !member.canTransferOwnership || !member.userId) {
                return;
            }

            this.openConfirmDialog({
                action: "transfer",
                tone: "primary",
                title: "确定转让管理员？",
                description: `转让后你将变为协作者，${member.displayName || member.nickname || "该成员"} 将成为管理员。此操作不可撤销。`,
                confirmText: "确认转让",
            });
        },

        handleRemoveTap() {
            const member = this.data.panelMember;
            if (!member || !member.canRemoveMember) {
                return;
            }

            this.openConfirmDialog({
                action: "remove",
                tone: "danger",
                title: `确定移除${member.displayName || member.nickname || "该成员"}？`,
                description: "移除后对方将无法查看此档案的数据。",
                confirmText: "确定移除",
            });
        },

        handleLeaveTap() {
            const member = this.data.panelMember;
            if (!member || !member.canLeaveProfile) {
                return;
            }

            this.openConfirmDialog({
                action: "leave",
                tone: "danger",
                title: "确定退出此档案？",
                description: "退出后将无法查看此档案的数据。",
                confirmText: "确认退出",
            });
        },

        handleDangerTap() {
            const member = this.data.panelMember;
            if (!member) {
                return;
            }

            if (member.canLeaveProfile) {
                this.handleLeaveTap();
                return;
            }

            if (member.canRemoveMember) {
                this.handleRemoveTap();
            }
        },

        handleConfirmDialogMaskTap() {
            if (this.data.isSubmitting) {
                return;
            }

            this.handleConfirmCancel();
        },

        handleConfirmCancel() {
            if (this.data.isSubmitting) {
                return;
            }

            this.setData({
                showConfirmDialog: false,
                confirmTitle: "",
                confirmDescription: "",
                confirmButtonText: "",
                confirmTone: "danger",
                confirmAction: "",
            });
        },

        showFeedbackAndClose(options = {}) {
            this.clearTimers();
            this.setData({
                showConfirmDialog: false,
                feedbackToastVisible: true,
                feedbackToastTitle: options.title || "操作已完成",
                feedbackToastTone: options.tone || "success",
                feedbackToastIconText: options.iconText || "✓",
                isSubmitting: false,
            });

            this.feedbackTimer = setTimeout(() => {
                this.feedbackTimer = null;
                this.closePanel();
            }, 1500);
        },

        async handleConfirmAction() {
            const action = this.data.confirmAction;
            const member = this.data.panelMember;

            if (!action || !member || this.data.isSubmitting) {
                return;
            }

            this.setData({ isSubmitting: true });
            try {
                if (action === "transfer") {
                    await memberService.transferOwnership(
                        this.data.profileId,
                        member.userId,
                    );
                    this.triggerEvent("memberChanged", {
                        type: "ownershipTransferred",
                        affectedUserId: member.userId,
                    });
                    this.showFeedbackAndClose({
                        title: "管理员已转让",
                        tone: "primary",
                        iconText: "✓",
                    });
                    return;
                }

                if (action === "remove" || action === "leave") {
                    await memberService.removeRelationship(
                        member.relationshipId,
                        {
                            relationship: member.relationship,
                        },
                    );
                    this.triggerEvent("memberChanged", {
                        type: action === "leave" ? "leftProfile" : "memberRemoved",
                        affectedUserId: member.userId,
                        selfRemoved: Boolean(member.isSelf),
                    });
                    this.showFeedbackAndClose({
                        title:
                            action === "leave"
                                ? "已退出档案"
                                : "成员已移除",
                        tone: "danger",
                        iconText: "🗑",
                    });
                }
            } catch (error) {
                this.setData({ isSubmitting: false });
                wx.showToast({
                    title: getErrorMessage(error),
                    icon: "none",
                });
            }
        },
    },
});
