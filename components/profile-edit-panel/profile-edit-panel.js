const { store } = require("../../store/index");
const profileService = require("../../services/profile-service");
const { getErrorMessage } = require("../../utils/error-messages");
const { syncFontData } = require('../../utils/font-scale');
const { findProfileById } = require("../../utils/profile-store");

const PHONE_PATTERN = /^1\d{10}$/;
const GENDER_OPTIONS = [
    { label: "男", value: "male" },
    { label: "女", value: "female" },
];

function trimText(value) {
    return String(value || "").trim();
}

function normalizeEmergencyContact(contact) {
    const name = trimText(contact && contact.name);
    const phone = trimText(contact && contact.phone);

    if (!name && !phone) {
        return null;
    }

    return {
        name,
        phone,
    };
}

function buildEmptyForm() {
    return {
        name: "",
        gender: "",
        birthDate: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
    };
}

function buildFormFromProfile(profile) {
    const emergencyContact = normalizeEmergencyContact(
        profile && profile.emergencyContact,
    );

    return {
        name: trimText(profile && profile.name),
        gender: trimText(profile && profile.gender),
        birthDate: trimText(profile && profile.birthDate),
        emergencyContactName: emergencyContact ? emergencyContact.name : "",
        emergencyContactPhone: emergencyContact ? emergencyContact.phone : "",
    };
}

function buildProfileValues(form) {
    const name = trimText(form && form.name);
    const gender = trimText(form && form.gender);
    const birthDate = trimText(form && form.birthDate);
    const emergencyContactName = trimText(form && form.emergencyContactName);
    const emergencyContactPhone = trimText(form && form.emergencyContactPhone);
    const emergencyContact = normalizeEmergencyContact({
        name: emergencyContactName,
        phone: emergencyContactPhone,
    });

    return {
        name,
        gender: gender || null,
        birthDate: birthDate || null,
        emergencyContact,
    };
}

function buildOriginalValues(profile) {
    return {
        name: trimText(profile && profile.name),
        gender: trimText(profile && profile.gender) || null,
        birthDate: trimText(profile && profile.birthDate) || null,
        emergencyContact: normalizeEmergencyContact(
            profile && profile.emergencyContact,
        ),
    };
}

function syncProfileIntoStore(profileId, nextProfile) {
    const state = store.getState();
    store.setState({
        profiles: (state.profiles || []).map((profile) =>
            profile && profile._id === profileId ? nextProfile : profile,
        ),
    });
}

function emitVisibilityChange(instance, visible) {
    const nextVisible = visible === true;

    if (!instance._hasInitializedVisibility) {
        instance._hasInitializedVisibility = true;
        instance._lastVisibleState = nextVisible;

        if (!nextVisible) {
            return;
        }
    } else if (instance._lastVisibleState === nextVisible) {
        return;
    } else {
        instance._lastVisibleState = nextVisible;
    }

    instance.triggerEvent("visibilitychange", {
        visible: nextVisible,
    });
}

Component({
    properties: {
        show: {
            type: Boolean,
            value: false,
        },
        profileId: {
            type: String,
            value: "",
        },
    },

    data: {
        fs: {},
        genderOptions: GENDER_OPTIONS,
        isSaving: false,
        errorText: "",
        form: buildEmptyForm(),
    },

    observers: {
        show(visible) {
            emitVisibilityChange(this, visible);

            if (visible) {
                syncFontData.call(this);
                this.hydrateForm(this.data.profileId || this.properties.profileId);
                return;
            }

            this.resetState();
        },

        profileId(profileId) {
            if (!this.data.show) {
                return;
            }

            this.hydrateForm(profileId);
        },
    },

    lifetimes: {
        attached() {
            syncFontData.call(this);
        },
    },

    pageLifetimes: {
        show() {
            syncFontData.call(this);
        },
    },

    methods: {
        noop() {},

        resetState() {
            this.originalProfile = null;
            this.setData({
                isSaving: false,
                errorText: "",
                form: buildEmptyForm(),
            });
        },

        canClosePanel() {
            return !this.data.isSaving;
        },

        closePanel() {
            this.triggerEvent("close");
        },

        handleMaskTap() {
            if (!this.canClosePanel()) {
                return;
            }

            this.closePanel();
        },

        handleCloseTap() {
            if (!this.canClosePanel()) {
                return;
            }

            this.closePanel();
        },

        hydrateForm(profileId) {
            const profile = findProfileById(profileId);
            if (!profile) {
                this.originalProfile = null;
                this.setData({
                    errorText: getErrorMessage({ code: "PROFILE_NOT_FOUND" }),
                    form: buildEmptyForm(),
                });
                return;
            }

            this.originalProfile = profile;
            this.setData({
                isSaving: false,
                errorText: "",
                form: buildFormFromProfile(profile),
            });
        },

        onNameInput(event) {
            this.setData({
                "form.name": event.detail.value,
                errorText: "",
            });
        },

        onGenderTap(event) {
            this.setData({
                "form.gender": event.currentTarget.dataset.value || "",
                errorText: "",
            });
        },

        onBirthDateChange(event) {
            this.setData({
                "form.birthDate": event.detail.value,
                errorText: "",
            });
        },

        onEmergencyContactNameInput(event) {
            this.setData({
                "form.emergencyContactName": event.detail.value,
                errorText: "",
            });
        },

        onEmergencyContactPhoneInput(event) {
            this.setData({
                "form.emergencyContactPhone": String(
                    event.detail.value || "",
                ).replace(/\D/g, ""),
                errorText: "",
            });
        },

        validateForm() {
            const values = buildProfileValues(this.data.form);
            const emergencyContactName = trimText(
                this.data.form.emergencyContactName,
            );
            const emergencyContactPhone = trimText(
                this.data.form.emergencyContactPhone,
            );

            if (!values.name) {
                return "请填写姓名";
            }

            if (values.name.length > 20) {
                return "姓名不能超过 20 个字";
            }

            if (emergencyContactName && emergencyContactName.length > 20) {
                return "紧急联系人姓名不能超过 20 个字";
            }

            if (Boolean(emergencyContactName) !== Boolean(emergencyContactPhone)) {
                return "请同时填写紧急联系人姓名和手机号";
            }

            if (
                emergencyContactPhone &&
                !PHONE_PATTERN.test(emergencyContactPhone)
            ) {
                return "请输入正确的手机号";
            }

            return "";
        },

        buildPatch() {
            const original = buildOriginalValues(this.originalProfile);
            const current = buildProfileValues(this.data.form);
            const patch = {};

            ["name", "gender", "birthDate"].forEach((key) => {
                if (current[key] !== original[key]) {
                    patch[key] = current[key];
                }
            });

            if (
                JSON.stringify(current.emergencyContact || null) !==
                JSON.stringify(original.emergencyContact || null)
            ) {
                patch.emergencyContact = current.emergencyContact
                    ? {
                          name: current.emergencyContact.name || "",
                          phone: current.emergencyContact.phone || "",
                      }
                    : null;
            }

            return patch;
        },

        async handleSave() {
            if (!this.data.profileId || this.data.isSaving) {
                return;
            }

            const validationMessage = this.validateForm();
            if (validationMessage) {
                this.setData({ errorText: validationMessage });
                wx.showToast({
                    title: validationMessage,
                    icon: "none",
                });
                return;
            }

            const patch = this.buildPatch();
            if (!Object.keys(patch).length) {
                wx.showToast({
                    title: "未做修改",
                    icon: "none",
                });
                return;
            }

            this.setData({
                isSaving: true,
                errorText: "",
            });

            try {
                const result = await profileService.updateProfile(
                    this.data.profileId,
                    patch,
                );

                syncProfileIntoStore(this.data.profileId, result.profile);
                this.originalProfile = result.profile;

                wx.showToast({
                    title: "已保存",
                    icon: "success",
                    duration: 800,
                });

                this.triggerEvent("saved", {
                    profileId: this.data.profileId,
                    profile: result.profile,
                });
                this.triggerEvent("close");
            } catch (error) {
                const errorText = getErrorMessage(error);
                this.setData({ errorText });
                wx.showToast({
                    title: errorText,
                    icon: "none",
                });
            } finally {
                this.setData({ isSaving: false });
            }
        },
    },
});
