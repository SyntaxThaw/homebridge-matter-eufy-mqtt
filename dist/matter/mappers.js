"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterMappers = exports.MatterOperationalErrorState = exports.MatterRvcRunModeTag = exports.MatterRvcCleanModeTag = exports.MatterRvcCleanMode = exports.MatterChargeState = exports.MatterRvcRunMode = exports.MatterOperationalState = void 0;
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
    MatterRvcRunMode[MatterRvcRunMode["EMPTY_BIN"] = 3] = "EMPTY_BIN";
})(MatterRvcRunMode || (exports.MatterRvcRunMode = MatterRvcRunMode = {}));
var MatterChargeState;
(function (MatterChargeState) {
    MatterChargeState[MatterChargeState["IS_CHARGING"] = 0] = "IS_CHARGING";
    MatterChargeState[MatterChargeState["IS_NOT_CHARGING"] = 1] = "IS_NOT_CHARGING";
    MatterChargeState[MatterChargeState["UNKNOWN"] = 2] = "UNKNOWN";
})(MatterChargeState || (exports.MatterChargeState = MatterChargeState = {}));
var MatterRvcCleanMode;
(function (MatterRvcCleanMode) {
    MatterRvcCleanMode[MatterRvcCleanMode["AUTO"] = 0] = "AUTO";
    MatterRvcCleanMode[MatterRvcCleanMode["VACUUM_ONLY"] = 1] = "VACUUM_ONLY";
    MatterRvcCleanMode[MatterRvcCleanMode["MOP_ONLY"] = 2] = "MOP_ONLY";
    MatterRvcCleanMode[MatterRvcCleanMode["VACUUM_AND_MOP"] = 3] = "VACUUM_AND_MOP";
    MatterRvcCleanMode[MatterRvcCleanMode["EMPTY_BIN"] = 4] = "EMPTY_BIN";
})(MatterRvcCleanMode || (exports.MatterRvcCleanMode = MatterRvcCleanMode = {}));
var MatterRvcCleanModeTag;
(function (MatterRvcCleanModeTag) {
    MatterRvcCleanModeTag[MatterRvcCleanModeTag["VACUUM"] = 16385] = "VACUUM";
    MatterRvcCleanModeTag[MatterRvcCleanModeTag["MOP"] = 16386] = "MOP";
    MatterRvcCleanModeTag[MatterRvcCleanModeTag["VACUUM_THEN_MOP"] = 16387] = "VACUUM_THEN_MOP";
    // Application-specific tag (common namespace 0x0000) so Apple Home falls back
    // to the mode label ("Empty Bin") instead of a localized standard name.
    MatterRvcCleanModeTag[MatterRvcCleanModeTag["EMPTY_BIN"] = 0] = "EMPTY_BIN";
})(MatterRvcCleanModeTag || (exports.MatterRvcCleanModeTag = MatterRvcCleanModeTag = {}));
var MatterRvcRunModeTag;
(function (MatterRvcRunModeTag) {
    MatterRvcRunModeTag[MatterRvcRunModeTag["IDLE"] = 16384] = "IDLE";
    MatterRvcRunModeTag[MatterRvcRunModeTag["CLEANING"] = 16385] = "CLEANING";
    MatterRvcRunModeTag[MatterRvcRunModeTag["MAPPING"] = 16386] = "MAPPING";
    // 0x4003 is outside the three standard RvcRunMode tags; Apple Home uses the label field as fallback.
    MatterRvcRunModeTag[MatterRvcRunModeTag["EMPTY_BIN"] = 16387] = "EMPTY_BIN";
})(MatterRvcRunModeTag || (exports.MatterRvcRunModeTag = MatterRvcRunModeTag = {}));
var MatterOperationalErrorState;
(function (MatterOperationalErrorState) {
    MatterOperationalErrorState[MatterOperationalErrorState["NO_ERROR"] = 0] = "NO_ERROR";
    MatterOperationalErrorState[MatterOperationalErrorState["STUCK"] = 65] = "STUCK";
})(MatterOperationalErrorState || (exports.MatterOperationalErrorState = MatterOperationalErrorState = {}));
class MatterMappers {
    static getSupportedRunModes(includeEmptyBin = false) {
        const modes = [
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
                modeTags: [{ value: MatterRvcRunModeTag.MAPPING }],
            },
        ];
        if (includeEmptyBin) {
            modes.push({
                label: 'Empty Bin',
                mode: MatterRvcRunMode.EMPTY_BIN,
                modeTags: [{ value: MatterRvcRunModeTag.EMPTY_BIN }],
            });
        }
        return modes;
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
    static getSupportedCleanModes(includeEmptyBin = false) {
        const modes = [
            { label: 'Auto', mode: MatterRvcCleanMode.AUTO, modeTags: [{ value: MatterRvcCleanModeTag.VACUUM }] },
            { label: 'Vacuum Only', mode: MatterRvcCleanMode.VACUUM_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.VACUUM }] },
            { label: 'Mop Only', mode: MatterRvcCleanMode.MOP_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.MOP }] },
            {
                label: 'Vacuum and Mop',
                mode: MatterRvcCleanMode.VACUUM_AND_MOP,
                modeTags: [{ value: MatterRvcCleanModeTag.VACUUM_THEN_MOP }],
            },
        ];
        if (includeEmptyBin) {
            // Tag 0x0000 (common namespace "Auto") is unrecognized in the RvcCleanMode
            // namespace, so Apple Home falls back to the label field ("Empty Bin").
            modes.push({ label: 'Empty Bin', mode: MatterRvcCleanMode.EMPTY_BIN, modeTags: [{ value: MatterRvcCleanModeTag.EMPTY_BIN }] });
        }
        return modes;
    }
    static mapRvcCleanMode(mode) {
        switch (mode) {
            case 'VACUUM_ONLY':
                return MatterRvcCleanMode.VACUUM_ONLY;
            case 'MOP_ONLY':
                return MatterRvcCleanMode.MOP_ONLY;
            case 'VACUUM_AND_MOP':
                return MatterRvcCleanMode.VACUUM_AND_MOP;
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
     * Maps strictly to charging enum
     */
    static mapChargeState(isCharging) {
        return isCharging ? MatterChargeState.IS_CHARGING : MatterChargeState.IS_NOT_CHARGING;
    }
}
exports.MatterMappers = MatterMappers;
