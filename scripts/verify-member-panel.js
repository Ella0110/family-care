const fs = require("fs");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function read(file) {
    return fs.readFileSync(file, "utf8");
}

const profileHomeJson = read("pages/profile-home/profile-home.json");
const profileHomeWxml = read("pages/profile-home/profile-home.wxml");
const profileHomeJs = read("pages/profile-home/profile-home.js");
const memberPanelJs = read("components/member-panel/member-panel.js");
const memberPanelWxml = read("components/member-panel/member-panel.wxml");

assert(
    /"member-panel"\s*:\s*"\/components\/member-panel\/member-panel"/.test(
        profileHomeJson,
    ),
    "profile-home.json should register member-panel",
);

assert(
    /bindtap="handleMemberTap"/.test(profileHomeWxml),
    "member avatar tap should open member panel",
);

assert(
    /<member-panel[\s\S]*bind:memberChanged="handleMemberChanged"/.test(
        profileHomeWxml,
    ),
    "profile-home.wxml should render member-panel and handle memberChanged",
);

assert(
    /handleMemberTap\(/.test(profileHomeJs) &&
        /showMemberPanel:\s*true/.test(profileHomeJs),
    "profile-home.js should open member panel",
);

assert(
    !/pages\/profile-members\/profile-members/.test(profileHomeJs),
    "profile-home.js should no longer navigate to profile-members",
);

assert(
    /memberService\.updateRelationship/.test(memberPanelJs) &&
        /memberService\.removeRelationship/.test(memberPanelJs) &&
        /memberService\.transferOwnership/.test(memberPanelJs),
    "member-panel should use existing member service APIs",
);

assert(
    /triggerEvent\("memberChanged"/.test(memberPanelJs),
    "member-panel should emit memberChanged",
);

assert(
    /可录入与编辑/.test(memberPanelWxml) &&
        !/可编辑/.test(
            memberPanelWxml.replace("可录入与编辑", ""),
        ),
    "member-panel should expose one merged permission toggle",
);

assert(
    /affectedUserId/.test(profileHomeJs) &&
        /currentProfileId:\s*nextProfileId/.test(profileHomeJs),
    "profile-home should recalculate currentProfileId after self removal",
);

assert(
    /确定删除此记录\？/.test(memberPanelWxml) === false,
    "member-panel should define its own confirm dialog copy, not record-panel text",
);

console.log("verify-member-panel: ok");
