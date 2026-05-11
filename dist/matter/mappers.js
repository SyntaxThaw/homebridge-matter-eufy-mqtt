"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterMappers = exports.MatterOperationalErrorState = exports.MatterRvcRunModeTag = exports.MatterCommonModeTag = exports.MatterRvcCleanModeTag = exports.MatterRvcCleanMode = exports.MatterChargeState = exports.MatterRvcRunMode = exports.MatterOperationalState = void 0;
var MatterOperationalState;
(function (MatterOperationalState) {
    MatterOperationalState[MatterOperationalState["STOPPED"] = 0] = "STOPPED";
    MatterOperationalState[MatterOperationalState["RUNNING"] = 1] = "RUNNING";
    MatterOperationalState[MatterOperationalState["PAUSED"] = 2] = "PAUSED";
    MatterOperationalState[MatterOperationalState["ERROR"] = 3] = "ERROR";
})(MatterOperationalState || (exports.MatterOperationalState = MatterOperationalState = {}));
var MatterRvcRunMode;
(function (MatterRvcRunMode) {
    MatterRvcRunMode[MatterRvcRunMode["IDLE"] = 0] = "IDLE";
    MatterRvcRunMode[MatterRvcRunMode["CLEANING"] = 1] = "CLEANING";
    MatterRvcRunMode[MatterRvcRunMode["RETURNING_HOME"] = 2] = "RETURNING_HOME";
})(MatterRvcRunMode || (exports.MatterRvcRunMode = MatterRvcRunMode = {}));
var MatterChargeState;
(function (MatterChargeState) {
    MatterChargeState[MatterChargeState["UNKNOWN"] = 0] = "UNKNOWN";
    MatterChargeState[MatterChargeState["IS_NOT_CHARGING"] = 1] = "IS_NOT_CHARGING";
    MatterChargeState[MatterChargeState["IS_AT_MAX_CHARGE"] = 2] = "IS_AT_MAX_CHARGE";
    MatterChargeState[MatterChargeState["IS_CHARGING"] = 3] = "IS_CHARGING";
})(MatterChargeState || (exports.MatterChargeState = MatterChargeState = {}));
var MatterRvcCleanMode;
(function (MatterRvcCleanMode) {
    MatterRvcCleanMode[MatterRvcCleanMode["AUTO"] = 0] = "AUTO";
    MatterRvcCleanMode[MatterRvcCleanMode["VACUUM_ONLY"] = 1] = "VACUUM_ONLY";
    MatterRvcCleanMode[MatterRvcCleanMode["MOP_ONLY"] = 2] = "MOP_ONLY";
    MatterRvcCleanMode[MatterRvcCleanMode["VACUUM_AND_MOP"] = 3] = "VACUUM_AND_MOP";
    MatterRvcCleanMode[MatterRvcCleanMode["SPOT_CLEAN"] = 4] = "SPOT_CLEAN";
})(MatterRvcCleanMode || (exports.MatterRvcCleanMode = MatterRvcCleanMode = {}));
var MatterRvcCleanModeTag;
(function (MatterRvcCleanModeTag) {
    MatterRvcCleanModeTag[MatterRvcCleanModeTag["DEEP_CLEAN"] = 16384] = "DEEP_CLEAN";
    MatterRvcCleanModeTag[MatterRvcCleanModeTag["VACUUM"] = 16385] = "VACUUM";
    MatterRvcCleanModeTag[MatterRvcCleanModeTag["MOP"] = 16386] = "MOP";
    MatterRvcCleanModeTag[MatterRvcCleanModeTag["VACUUM_THEN_MOP"] = 16387] = "VACUUM_THEN_MOP";
})(MatterRvcCleanModeTag || (exports.MatterRvcCleanModeTag = MatterRvcCleanModeTag = {}));
/**
 * Common ModeBase tags (shared across Matter Mode clusters). Used here for
 * 'Auto' so it doesn't clash with the Vacuum tag — otherwise Apple Home picks
 * the first mode carrying the Vacuum tag (Auto) whenever the user selects
 * "vacuum only" in a room-clean action, and Auto maps to SWEEP_AND_MOP on the
 * device.
 */
var MatterCommonModeTag;
(function (MatterCommonModeTag) {
    MatterCommonModeTag[MatterCommonModeTag["AUTO"] = 0] = "AUTO";
})(MatterCommonModeTag || (exports.MatterCommonModeTag = MatterCommonModeTag = {}));
var MatterRvcRunModeTag;
(function (MatterRvcRunModeTag) {
    MatterRvcRunModeTag[MatterRvcRunModeTag["IDLE"] = 16384] = "IDLE";
    MatterRvcRunModeTag[MatterRvcRunModeTag["CLEANING"] = 16385] = "CLEANING";
})(MatterRvcRunModeTag || (exports.MatterRvcRunModeTag = MatterRvcRunModeTag = {}));
var MatterOperationalErrorState;
(function (MatterOperationalErrorState) {
    MatterOperationalErrorState[MatterOperationalErrorState["NO_ERROR"] = 0] = "NO_ERROR";
    MatterOperationalErrorState[MatterOperationalErrorState["STUCK"] = 65] = "STUCK";
})(MatterOperationalErrorState || (exports.MatterOperationalErrorState = MatterOperationalErrorState = {}));
class MatterMappers {
    static getSupportedRunModes() {
        return [
            {
                label: 'Idle',
                mode: MatterRvcRunMode.IDLE,
                modeTags: [{ value: MatterRvcRunModeTag.IDLE }],
            },
            {
                label: 'Cleaning',
                mode: MatterRvcRunMode.CLEANING,
                modeTags: [{ value: MatterRvcRunModeTag.CLEANING }],
            },
            {
                label: 'Returning Home',
                mode: MatterRvcRunMode.RETURNING_HOME,
                modeTags: [],
            },
        ];
    }
    static getOperationalStateList() {
        return [
            { operationalStateId: MatterOperationalState.STOPPED },
            { operationalStateId: MatterOperationalState.RUNNING },
            { operationalStateId: MatterOperationalState.PAUSED },
            { operationalStateId: MatterOperationalState.ERROR },
        ];
    }
    static mapOperationalError(state) {
        if (state.activity.activeError) {
            return {
                errorStateId: MatterOperationalErrorState.STUCK,
                errorStateLabel: 'Vacuum reported an active error',
            };
        }
        return { errorStateId: MatterOperationalErrorState.NO_ERROR };
    }
    static mapRvcRunMode(state) {
        switch (state.activity.runMode) {
            case 'cleaning':
                return MatterRvcRunMode.CLEANING;
            case 'returning':
                return MatterRvcRunMode.RETURNING_HOME;
            case 'error':
            case 'idle':
            default:
                return MatterRvcRunMode.IDLE;
        }
    }
    static mapCleanMode(mode) {
        return mode || 'auto';
    }
    /**
     * Returns the RvcCleanMode SupportedModes list. Each mode carries a unique
     * standard ModeTag so Apple Home can unambiguously map user-facing actions
     * (e.g. "vacuum only" in a room-clean automation) to the correct mode index.
     * If multiple entries shared the Vacuum tag, Apple Home would pick the first
     * one — 'Auto' — and the device would default to vacuum+mop.
     */
    static getSupportedCleanModes() {
        return [
            { label: 'Auto', mode: MatterRvcCleanMode.AUTO, modeTags: [{ value: MatterCommonModeTag.AUTO }] },
            { label: 'Vacuum Only', mode: MatterRvcCleanMode.VACUUM_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.VACUUM }] },
            { label: 'Mop Only', mode: MatterRvcCleanMode.MOP_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.MOP }] },
            {
                label: 'Vacuum and Mop',
                mode: MatterRvcCleanMode.VACUUM_AND_MOP,
                modeTags: [{ value: MatterRvcCleanModeTag.VACUUM_THEN_MOP }],
            },
            {
                label: 'Spot Clean',
                mode: MatterRvcCleanMode.SPOT_CLEAN,
                modeTags: [{ value: MatterRvcCleanModeTag.DEEP_CLEAN }],
            },
        ];
    }
    static mapRvcCleanMode(mode) {
        switch (mode) {
            case 'VACUUM_ONLY':
                return MatterRvcCleanMode.VACUUM_ONLY;
            case 'MOP_ONLY':
                return MatterRvcCleanMode.MOP_ONLY;
            case 'VACUUM_AND_MOP':
                return MatterRvcCleanMode.VACUUM_AND_MOP;
            case 'SPOT_CLEAN':
                return MatterRvcCleanMode.SPOT_CLEAN;
            case 'AUTO':
            default:
                return MatterRvcCleanMode.AUTO;
        }
    }
    /**
     * Maps internal runMode to Matter's OperationalState enum value
     */
    static mapOperationalState(state) {
        if (state.activity.activeError)
            return MatterOperationalState.ERROR;
        if (state.activity.paused)
            return MatterOperationalState.PAUSED;
        switch (state.activity.runMode) {
            case 'idle':
                return MatterOperationalState.STOPPED;
            case 'cleaning':
            case 'returning':
                return MatterOperationalState.RUNNING;
            case 'error':
            default:
                return MatterOperationalState.ERROR;
        }
    }
    /**
     * Translates 0-100 battery level into Matter's 0-200 BatPercentRemaining scale
     */
    static mapBatteryLevel(percent) {
        return Math.min(Math.max(percent * 2, 0), 200);
    }
    /**
     * Maps power state to Matter BatChargeState enum.
     * `charging` is set by processWorkStatus: true=actively charging (DOING), false=done (DONE).
     */
    static mapChargeState(power) {
        if (!power.docked)
            return MatterChargeState.IS_NOT_CHARGING;
        if (power.charging)
            return MatterChargeState.IS_CHARGING;
        return MatterChargeState.IS_AT_MAX_CHARGE;
    }
}
exports.MatterMappers = MatterMappers;
