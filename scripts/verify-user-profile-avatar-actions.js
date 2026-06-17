const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function loadPageDefinition(pagePath) {
    const originalPage = global.Page;
    let definition = null;

    global.Page = (pageDefinition) => {
        definition = pageDefinition;
    };

    delete require.cache[pagePath];
    require(pagePath);
    global.Page = originalPage;

    assert(definition, `page should register itself: ${pagePath}`);
    return definition;
}

const profileHomePagePath = path.resolve(
    __dirname,
    "../pages/profile-home/profile-home.js",
);
const profileHomeWxml = read("pages/profile-home/profile-home.wxml");
const profileHomeWxss = read("pages/profile-home/profile-home.wxss");
const userProfileEditWxml = read(
    "pages/user-profile-edit/user-profile-edit.wxml",
);

const originalWx = global.wx;
const originalGetApp = global.getApp;

try {
    const definition = loadPageDefinition(profileHomePagePath);

    global.wx = {};
    global.getApp = () => ({ globalData: {} });

    const baseInstance = {
        data: {
            currentProfileId: "profile-1",
            memberItems: [],
            showMemberPanel: false,
            selectedMember: null,
            showSelfActionDialog: false,
            selfActionDialogMember: null,
        },
        setData(patch) {
            this.data = Object.assign({}, this.data, patch);
        },
    };

    const selfWithoutAvatar = Object.assign({}, baseInstance, {
        data: Object.assign({}, baseInstance.data, {
            memberItems: [
                {
                    relationshipId: "rel-self-empty",
                    isSelf: true,
                    avatarUrl: "",
                },
            ],
        }),
    });

    definition.handleMemberTap.call(selfWithoutAvatar, {
        currentTarget: {
            dataset: {
                relationshipId: "rel-self-empty",
            },
        },
    });

    assert.strictEqual(
        selfWithoutAvatar.data.showSelfActionDialog,
        true,
        "self avatar without a configured avatar should open the custom self action dialog",
    );
    assert.strictEqual(
        selfWithoutAvatar.data.showMemberPanel,
        false,
        "self avatar tap should not open the member panel",
    );
    assert.strictEqual(
        selfWithoutAvatar.data.selfActionDialogMember.useAvatarPlaceholderIcon,
        true,
        "self avatar without an uploaded avatar should keep using the placeholder icon inside the sheet",
    );
    assert.strictEqual(
        selfWithoutAvatar.data.selfActionDialogMember.displayName,
        "未命名",
        "self avatar without a nickname should now use the unified 未命名 label in the sheet",
    );

    const selfWithAvatar = Object.assign({}, baseInstance, {
        data: Object.assign({}, baseInstance.data, {
            memberItems: [
                {
                    relationshipId: "rel-self-avatar",
                    isSelf: true,
                    avatarUrl: "cloud://avatar.png",
                    roleLabel: "管理员",
                },
            ],
        }),
    });

    definition.handleMemberTap.call(selfWithAvatar, {
        currentTarget: {
            dataset: {
                relationshipId: "rel-self-avatar",
            },
        },
    });

    assert.strictEqual(
        selfWithAvatar.data.showSelfActionDialog,
        true,
        "self avatar with a configured avatar should still use the custom self action dialog",
    );
    assert.strictEqual(
        selfWithAvatar.data.selfActionDialogMember.useAvatarPlaceholderIcon,
        false,
        "self avatar with a configured avatar should not fall back to the placeholder icon inside the sheet",
    );

    const otherMember = Object.assign({}, baseInstance, {
        data: Object.assign({}, baseInstance.data, {
            memberItems: [
                {
                    relationshipId: "rel-other",
                    isSelf: false,
                    avatarUrl: "",
                    userId: "other-user",
                },
            ],
        }),
    });

    definition.handleMemberTap.call(otherMember, {
        currentTarget: {
            dataset: {
                relationshipId: "rel-other",
            },
        },
    });

    assert.strictEqual(
        otherMember.data.showMemberPanel,
        true,
        "non-self member taps should keep opening the member panel",
    );

    assert.match(
        profileHomeWxml,
        /profile-home__self-action-dialog/,
        "profile-home should render a custom self avatar action dialog",
    );

    assert.doesNotMatch(
        profileHomeWxml,
        /一键授权微信昵称与头像|open-type="chooseAvatar"|bindchooseavatar="handleSelfActionChooseAvatar"|profile-home__self-action-button--wechat|profile-home__self-action-button--outline|wx:if="{{!selfActionDialogHasAvatar}}"/,
        "profile-home self action dialog should no longer keep the avatar-state split or the quick authorize button",
    );

    assert.match(
        profileHomeWxml,
        /profile-home__self-action-button profile-home__self-action-button--primary[\s\S]*修改个人资料[\s\S]*profile-home__self-action-cancel[\s\S]*取消/,
        "profile-home self action dialog should keep a single edit action plus cancel",
    );

    assert.match(
        profileHomeWxml,
        /profile-home__member-avatar-icon/,
        "profile-home should render the member placeholder svg image when the current user has no avatar",
    );

    assert.doesNotMatch(
        profileHomeWxml,
        /item\.avatarFallback|selfActionDialogMember\.avatarFallback|showUnnamedNote/,
        "profile-home should remove the unreachable text avatar fallbacks and unnamed-note branch",
    );

    assert.doesNotMatch(
        read("pages/profile-home/profile-home.js"),
        /handleSelfMemberTap|showUnnamedNote|const avatarFallback =/,
        "profile-home should remove the dead self-member handler and self-action avatar fallback plumbing",
    );

    assert.doesNotMatch(
        profileHomeWxss,
        /\.profile-home__member-name-note|\.profile-home__setting-link|\.profile-home__footer-link|\.profile-home__invite-name/,
        "profile-home should remove the orphaned stylesheet classes called out by cleanup",
    );

    assert.match(
        profileHomeWxss,
        /\.profile-home__self-action-dialog[\s\S]*align-items:\s*flex-end[\s\S]*padding:\s*0;/i,
        "profile-home should pin the self action dialog flush to the bottom edge",
    );

    assert.match(
        profileHomeWxss,
        /\.profile-home__self-action-sheet[\s\S]*width:\s*100%[\s\S]*border-radius:\s*32rpx 32rpx 0 0[\s\S]*padding:\s*40rpx 28rpx calc\(16rpx \+ env\(safe-area-inset-bottom\)\)/i,
        "profile-home self action dialog should use the tightened bottom sheet shape without extra blank space",
    );

    assert.doesNotMatch(
        profileHomeWxml,
        /profile-home__quick-sync-dialog|profile-home__quick-sync-sheet|profile-home__quick-sync-avatar-button/,
        "profile-home should remove the intermediate quick-sync dialog markup",
    );

    assert.doesNotMatch(
        profileHomeWxss,
        /\.profile-home__quick-sync-dialog|\.profile-home__quick-sync-sheet|\.profile-home__quick-sync-avatar-button/,
        "profile-home should remove the intermediate quick-sync dialog styles",
    );

    assert.doesNotMatch(
        read("pages/profile-home/profile-home.js"),
        /showQuickProfileSyncDialog|quickProfileSyncForm|handleQuickProfileSync|openQuickProfileSyncDialog|handleSelfActionAuthorizeTap|handleSelfActionChooseAvatar|selfActionDialogHasAvatar/,
        "profile-home should remove the obsolete quick authorize branch state and handlers",
    );

    assert.doesNotMatch(
        read("pages/user-profile-edit/user-profile-edit.js"),
        /console\.log\('clearRefresh members called'\)/,
        "user-profile-edit should remove the temporary clearRefresh console log",
    );

    assert.doesNotMatch(
        read("pages/user-profile-edit/user-profile-edit.wxss"),
        /font-mono:\s*true/,
        "user-profile-edit should drop the invalid font-mono declaration",
    );

    assert.match(
        userProfileEditWxml,
        /保存修改/,
        "user-profile-edit should keep the save action visible after the redesign",
    );

    console.log("verify-user-profile-avatar-actions: ok");
} finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
}
