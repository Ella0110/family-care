const { getErrorMessage } = require("../../utils/error-messages");
const {
    MAX_FUTURE_SKEW_MS,
    MIN_MEASURED_AT_MS,
    getNowParts,
    getDateTimeParts,
    parseInteger,
    parseMeasuredAt,
    saveRecordFromForm,
    updateRecordFromForm,
    deleteRecordById,
} = require("../../utils/record-editor");

const FIELD_LIMITS = {
    systolic: { min: 60, max: 300 },
    diastolic: { min: 30, max: 200 },
    heartRate: { min: 30, max: 250 },
};

const FIELD_ORDER = ["systolic", "diastolic", "heartRate"];
const SHAKE_DURATION_MS = 400;
const FEEDBACK_TOAST_DURATION_MS = 1500;
const KEYPAD_KEYS = [
    { value: "1", label: "1", action: "digit" },
    { value: "2", label: "2", action: "digit" },
    { value: "3", label: "3", action: "digit" },
    { value: "4", label: "4", action: "digit" },
    { value: "5", label: "5", action: "digit" },
    { value: "6", label: "6", action: "digit" },
    { value: "7", label: "7", action: "digit" },
    { value: "8", label: "8", action: "digit" },
    { value: "9", label: "9", action: "digit" },
    { value: "clear", label: "清除", action: "clear" },
    { value: "0", label: "0", action: "digit" },
    { value: "backspace", label: "⌫", action: "backspace" },
];

function buildEmptyFieldFlags() {
    return {
        systolic: false,
        diastolic: false,
        heartRate: false,
        measuredAt: false,
    };
}

function sanitizeDigits(value) {
    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 3);
}

function formatMeasuredDateLabel(dateValue) {
    const [year, month, day] = String(dateValue || "")
        .split("-")
        .map(Number);
    if (!year || !month || !day) {
        return "--";
    }

    return `${month}月${day}日`;
}

function getSourceRecord(properties) {
    return properties.editRecord || properties.record || null;
}

function getFirstFocusableField(form) {
    if (!form || !sanitizeDigits(form.systolic)) {
        return "systolic";
    }

    if (!sanitizeDigits(form.diastolic)) {
        return "diastolic";
    }

    if (!sanitizeDigits(form.heartRate)) {
        return "heartRate";
    }

    return "systolic";
}

function shouldAutoAdvance(fieldName, currentValue) {
    const len = currentValue.length;
    const num = parseInteger(currentValue);
    const range = FIELD_LIMITS[fieldName];

    if (len < 2) {
        return false;
    }

    if (len === 2 && Number.isInteger(num) && num >= 30 && num <= range.max) {
        return true;
    }

    if (len === 3) {
        if (Number.isInteger(num) && num >= range.min && num <= range.max) {
            return true;
        }

        return "error";
    }

    return false;
}

function buildValidationFailure(
    message,
    fieldErrors,
    focusField,
    fieldsToClear = [],
) {
    return {
        message,
        fieldErrors,
        focusField: focusField || "",
        fieldsToClear,
    };
}

function validatePanelForm(profileId, form) {
    const fieldErrors = buildEmptyFieldFlags();
    const systolicRaw = sanitizeDigits(form && form.systolic);
    const diastolicRaw = sanitizeDigits(form && form.diastolic);
    const heartRateRaw = sanitizeDigits(form && form.heartRate);
    const systolic = parseInteger(systolicRaw);
    const diastolic = parseInteger(diastolicRaw);
    const heartRate = parseInteger(heartRateRaw);
    const measuredAt = parseMeasuredAt(
        form && form.measuredDate,
        form && form.measuredTime,
    );
    const maxMeasuredAt = Date.now() + MAX_FUTURE_SKEW_MS;

    if (!profileId) {
        return buildValidationFailure("档案不存在", fieldErrors);
    }

    if (!systolicRaw) {
        fieldErrors.systolic = true;
        return buildValidationFailure("请输入收缩压", fieldErrors, "systolic");
    }

    if (!diastolicRaw) {
        fieldErrors.diastolic = true;
        return buildValidationFailure("请输入舒张压", fieldErrors, "diastolic");
    }

    if (
        !Number.isInteger(systolic) ||
        systolic < FIELD_LIMITS.systolic.min ||
        systolic > FIELD_LIMITS.systolic.max
    ) {
        fieldErrors.systolic = true;
        return buildValidationFailure(
            "收缩压数值超出合理范围（60-300）",
            fieldErrors,
            "systolic",
            ["systolic"],
        );
    }

    if (
        !Number.isInteger(diastolic) ||
        diastolic < FIELD_LIMITS.diastolic.min ||
        diastolic > FIELD_LIMITS.diastolic.max
    ) {
        fieldErrors.diastolic = true;
        return buildValidationFailure(
            "舒张压数值超出合理范围（30-200）",
            fieldErrors,
            "diastolic",
            ["diastolic"],
        );
    }

    if (systolic <= diastolic) {
        fieldErrors.systolic = true;
        fieldErrors.diastolic = true;
        return buildValidationFailure(
            "收缩压必须大于舒张压",
            fieldErrors,
            "systolic",
            ["systolic"],
        );
    }

    if (
        heartRateRaw &&
        (!Number.isInteger(heartRate) ||
            heartRate < FIELD_LIMITS.heartRate.min ||
            heartRate > FIELD_LIMITS.heartRate.max)
    ) {
        fieldErrors.heartRate = true;
        return buildValidationFailure(
            "心率数值超出合理范围（30-250）",
            fieldErrors,
            "heartRate",
            ["heartRate"],
        );
    }

    if (Number.isNaN(measuredAt.getTime())) {
        fieldErrors.measuredAt = true;
        return buildValidationFailure("请选择有效的测量时间", fieldErrors);
    }

    if (measuredAt.getTime() < MIN_MEASURED_AT_MS) {
        fieldErrors.measuredAt = true;
        return buildValidationFailure("测量时间不能早于 2000 年", fieldErrors);
    }

    if (measuredAt.getTime() > maxMeasuredAt) {
        fieldErrors.measuredAt = true;
        return buildValidationFailure("测量时间不能是未来时间", fieldErrors);
    }

    return buildValidationFailure("", fieldErrors);
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
        record: {
            type: Object,
            value: null,
        },
        editRecord: {
            type: Object,
            value: null,
        },
    },

    data: {
        keypadKeys: KEYPAD_KEYS,
        activeField: "systolic",
        isEditMode: false,
        recordId: "",
        panelTitle: "记录血压",
        saveButtonText: "确认保存",
        isSaving: false,
        isDeleting: false,
        hasValidationIssue: false,
        errorText: "",
        fieldErrors: buildEmptyFieldFlags(),
        shakingFields: buildEmptyFieldFlags(),
        showDeleteConfirm: false,
        feedbackToastVisible: false,
        feedbackToastTitle: "",
        feedbackToastTone: "success",
        feedbackToastIconText: "✓",
        minMeasuredDate: "2000-01-01",
        maxMeasuredDate: "",
        measuredDateLabel: "--",
        form: {
            systolic: "",
            diastolic: "",
            heartRate: "",
            measuredDate: "",
            measuredTime: "",
        },
    },

    observers: {
        show(visible) {
            this.triggerEvent("visibilitychange", {
                visible: visible === true,
            });

            if (!visible) {
                this.clearTransientTimers();
                return;
            }

            this.hydrateForm(getSourceRecord(this.properties));
        },

        "editRecord, record"() {
            if (this.data.show) {
                this.hydrateForm(getSourceRecord(this.properties));
            }
        },
    },

    lifetimes: {
        detached() {
            this.clearTransientTimers();
        },
    },

    methods: {
        clearTransientTimers() {
            if (this.shakeTimer) {
                clearTimeout(this.shakeTimer);
                this.shakeTimer = null;
            }

            if (this.feedbackTimer) {
                clearTimeout(this.feedbackTimer);
                this.feedbackTimer = null;
            }
        },

        resetTransientState() {
            this.clearTransientTimers();
            this.setData({
                isSaving: false,
                isDeleting: false,
                hasValidationIssue: false,
                errorText: "",
                fieldErrors: buildEmptyFieldFlags(),
                shakingFields: buildEmptyFieldFlags(),
                showDeleteConfirm: false,
                feedbackToastVisible: false,
                feedbackToastTitle: "",
                feedbackToastTone: "success",
                feedbackToastIconText: "✓",
            });
        },

        hydrateForm(record) {
            const nowParts = getNowParts();
            const isEditMode = Boolean(record && record._id);
            const dateTime = isEditMode
                ? getDateTimeParts(record.measuredAt)
                : nowParts;
            const payload = (record && record.payload) || {};
            const form = {
                systolic: sanitizeDigits(payload.systolic),
                diastolic: sanitizeDigits(payload.diastolic),
                heartRate: sanitizeDigits(payload.heartRate),
                measuredDate: dateTime.date,
                measuredTime: dateTime.time,
            };

            this.clearTransientTimers();
            this.setData({
                activeField: getFirstFocusableField(form),
                isEditMode,
                recordId: isEditMode ? record._id : "",
                panelTitle: isEditMode ? "编辑记录" : "记录血压",
                saveButtonText: isEditMode ? "保存修改" : "确认保存",
                isSaving: false,
                isDeleting: false,
                hasValidationIssue: false,
                errorText: "",
                fieldErrors: buildEmptyFieldFlags(),
                shakingFields: buildEmptyFieldFlags(),
                showDeleteConfirm: false,
                feedbackToastVisible: false,
                feedbackToastTitle: "",
                feedbackToastTone: "success",
                feedbackToastIconText: "✓",
                minMeasuredDate: nowParts.minDate,
                maxMeasuredDate: nowParts.maxDate,
                measuredDateLabel: formatMeasuredDateLabel(form.measuredDate),
                form,
            });
        },

        canDismissPanel() {
            return !(
                this.data.isSaving ||
                this.data.isDeleting ||
                this.data.feedbackToastVisible ||
                this.data.showDeleteConfirm
            );
        },

        closePanel() {
            this.triggerEvent("close");
        },

        setActiveField(field) {
            if (!FIELD_ORDER.includes(field)) {
                return;
            }

            this.setData({
                activeField: field,
            });
        },

        handleFieldTap(event) {
            this.setActiveField(event.currentTarget.dataset.field);
        },

        getValidationResult() {
            return validatePanelForm(this.data.profileId, this.data.form);
        },

        syncAfterFormChange(form) {
            const nextData = {
                form,
                measuredDateLabel: formatMeasuredDateLabel(form.measuredDate),
            };

            if (
                this.data.hasValidationIssue ||
                Object.values(this.data.fieldErrors || {}).some(Boolean)
            ) {
                nextData.hasValidationIssue = false;
                nextData.errorText = "";
                nextData.fieldErrors = buildEmptyFieldFlags();
            }

            this.setData(nextData);
        },

        updateFieldValue(field, value, options = {}) {
            const nextForm = Object.assign({}, this.data.form, {
                [field]: sanitizeDigits(value),
            });
            const nextData = {};

            if (options.activeField) {
                nextData.activeField = options.activeField;
            }

            this.setData(nextData, () => {
                this.syncAfterFormChange(nextForm);
            });
        },

        getNextAutoField(field, form) {
            const currentIndex = FIELD_ORDER.indexOf(field);
            if (currentIndex === -1) {
                return field;
            }

            for (
                let index = currentIndex + 1;
                index < FIELD_ORDER.length;
                index += 1
            ) {
                if (!sanitizeDigits(form[FIELD_ORDER[index]])) {
                    return FIELD_ORDER[index];
                }
            }

            return field;
        },

        handleDigitTap(value) {
            const field = this.data.activeField;
            if (!FIELD_ORDER.includes(field)) {
                return;
            }

            const currentValue = sanitizeDigits(this.data.form[field]);
            if (currentValue.length >= 3) {
                return;
            }

            const nextValue = sanitizeDigits(`${currentValue}${value}`);
            const nextForm = Object.assign({}, this.data.form, {
                [field]: nextValue,
            });
            const autoAdvance = shouldAutoAdvance(field, nextValue);
            if (autoAdvance === "error") {
                const fieldErrors = buildEmptyFieldFlags();
                fieldErrors[field] = true;
                const range = FIELD_LIMITS[field];
                const labelMap = {
                    systolic: "收缩压",
                    diastolic: "舒张压",
                    heartRate: "心率",
                };

                this.applyValidationFailure(
                    buildValidationFailure(
                        `${labelMap[field]}数值超出合理范围（${range.min}-${range.max}）`,
                        fieldErrors,
                        field,
                        [field],
                    ),
                );
                return;
            }

            const nextField = autoAdvance
                ? this.getNextAutoField(field, nextForm)
                : field;

            this.setData(
                {
                    activeField: nextField,
                },
                () => {
                    this.syncAfterFormChange(nextForm);
                },
            );
        },

        handleBackspaceTap() {
            const field = this.data.activeField;
            if (!FIELD_ORDER.includes(field)) {
                return;
            }

            const currentValue = sanitizeDigits(this.data.form[field]);
            if (!currentValue) {
                return;
            }

            this.updateFieldValue(field, currentValue.slice(0, -1));
        },

        handleClearTap() {
            const field = this.data.activeField;
            if (!FIELD_ORDER.includes(field)) {
                return;
            }

            this.updateFieldValue(field, "");
        },

        handleKeyTap(event) {
            const { action, value } = event.currentTarget.dataset;
            if (
                this.data.isSaving ||
                this.data.isDeleting ||
                this.data.feedbackToastVisible
            ) {
                return;
            }

            if (action === "digit") {
                this.handleDigitTap(value);
                return;
            }

            if (action === "backspace") {
                this.handleBackspaceTap();
                return;
            }

            if (action === "clear") {
                this.handleClearTap();
            }
        },

        onMeasuredDateChange(event) {
            const nextForm = Object.assign({}, this.data.form, {
                measuredDate: event.detail.value,
            });
            this.syncAfterFormChange(nextForm);
        },

        onMeasuredTimeChange(event) {
            const nextForm = Object.assign({}, this.data.form, {
                measuredTime: event.detail.value,
            });
            this.syncAfterFormChange(nextForm);
        },

        triggerShake(fieldErrors) {
            const nextShakingFields = buildEmptyFieldFlags();
            Object.keys(nextShakingFields).forEach((key) => {
                nextShakingFields[key] = Boolean(
                    fieldErrors && fieldErrors[key],
                );
            });

            if (this.shakeTimer) {
                clearTimeout(this.shakeTimer);
                this.shakeTimer = null;
            }

            this.setData(
                {
                    shakingFields: buildEmptyFieldFlags(),
                },
                () => {
                    this.setData({
                        shakingFields: nextShakingFields,
                    });
                },
            );

            this.shakeTimer = setTimeout(() => {
                this.setData({
                    shakingFields: buildEmptyFieldFlags(),
                });
                this.shakeTimer = null;
            }, SHAKE_DURATION_MS);
        },

        applyValidationFailure(validation) {
            const nextForm = Object.assign({}, this.data.form);
            (validation.fieldsToClear || []).forEach((field) => {
                if (Object.prototype.hasOwnProperty.call(nextForm, field)) {
                    nextForm[field] = "";
                }
            });

            this.setData({
                form: nextForm,
                measuredDateLabel: formatMeasuredDateLabel(
                    nextForm.measuredDate,
                ),
                activeField: validation.focusField || this.data.activeField,
                hasValidationIssue: true,
                errorText: validation.message,
                fieldErrors: validation.fieldErrors,
            });
            this.triggerShake(validation.fieldErrors);
        },

        handleMaskTap() {
            if (!this.canDismissPanel()) {
                return;
            }

            this.closePanel();
        },

        handleClose() {
            if (!this.canDismissPanel()) {
                return;
            }

            this.closePanel();
        },

        showFeedbackToast(options = {}) {
            this.clearTransientTimers();

            const eventName = options.eventName || "";
            const eventDetail = options.eventDetail || {};
            const tone = options.tone === "danger" ? "danger" : "success";

            this.setData({
                isSaving: false,
                isDeleting: false,
                hasValidationIssue: false,
                errorText: "",
                fieldErrors: buildEmptyFieldFlags(),
                shakingFields: buildEmptyFieldFlags(),
                showDeleteConfirm: false,
                feedbackToastVisible: true,
                feedbackToastTitle: options.title || "记录已保存",
                feedbackToastTone: tone,
                feedbackToastIconText:
                    options.iconText || (tone === "danger" ? "🗑" : "✓"),
            });

            this.feedbackTimer = setTimeout(() => {
                this.feedbackTimer = null;
                this.setData(
                    {
                        feedbackToastVisible: false,
                    },
                    () => {
                        if (eventName) {
                            this.triggerEvent(eventName, eventDetail);
                        }
                        this.closePanel();
                    },
                );
            }, FEEDBACK_TOAST_DURATION_MS);
        },

        async handleCreateSave() {
            try {
                const { result } = await saveRecordFromForm(
                    this.data.profileId,
                    this.data.form,
                );
                this.showFeedbackToast({
                    title: "记录已保存",
                    tone: "success",
                    iconText: "✓",
                    eventName: "success",
                    eventDetail: {
                        mode: "create",
                        record: result.record,
                    },
                });
            } catch (error) {
                this.setData({
                    isSaving: false,
                    errorText: getErrorMessage(error),
                });
            }
        },

        async handleUpdateSave() {
            try {
                const { result } = await updateRecordFromForm(
                    this.data.recordId,
                    this.data.form,
                );
                this.showFeedbackToast({
                    title: "修改已保存",
                    tone: "success",
                    iconText: "✔",
                    eventName: "success",
                    eventDetail: {
                        mode: "edit",
                        record: result.record,
                    },
                });
            } catch (error) {
                this.setData({
                    isSaving: false,
                    errorText: getErrorMessage(error),
                });
            }
        },

        handleSave() {
            if (
                this.data.isSaving ||
                this.data.isDeleting ||
                this.data.feedbackToastVisible ||
                this.data.showDeleteConfirm
            ) {
                return;
            }

            const validation = this.getValidationResult();
            if (validation.message) {
                this.applyValidationFailure(validation);
                return;
            }

            this.setData({
                isSaving: true,
                hasValidationIssue: false,
                errorText: "",
                fieldErrors: buildEmptyFieldFlags(),
            });

            if (this.data.isEditMode) {
                this.handleUpdateSave();
                return;
            }

            this.handleCreateSave();
        },

        handleDelete() {
            if (
                !this.data.isEditMode ||
                this.data.isDeleting ||
                !this.data.recordId ||
                this.data.feedbackToastVisible ||
                this.data.isSaving
            ) {
                return;
            }

            this.setData({
                showDeleteConfirm: true,
            });
        },

        handleDeleteDialogMaskTap() {
            if (this.data.isDeleting) {
                return;
            }

            this.setData({
                showDeleteConfirm: false,
            });
        },

        handleDeleteCancel() {
            if (this.data.isDeleting) {
                return;
            }

            this.setData({
                showDeleteConfirm: false,
            });
        },

        async handleDeleteConfirm() {
            if (this.data.isDeleting || !this.data.recordId) {
                return;
            }

            this.setData({
                isDeleting: true,
            });

            try {
                await deleteRecordById(this.data.recordId, this.data.profileId);
                this.showFeedbackToast({
                    title: "记录已删除",
                    tone: "danger",
                    iconText: "🗑",
                    eventName: "delete",
                    eventDetail: {
                        recordId: this.data.recordId,
                    },
                });
            } catch (error) {
                this.setData({
                    isDeleting: false,
                    errorText: getErrorMessage(error),
                    showDeleteConfirm: false,
                });
            }
        },

        noop() {},
    },
});
