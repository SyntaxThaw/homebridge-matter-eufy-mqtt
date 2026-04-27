"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterMappers = exports.MatterOperationalErrorState = exports.MatterRvcRunModeTag = exports.MatterChargeState = exports.MatterRvcRunMode = exports.MatterOperationalState = void 0;
var MatterOperationalState;
(function (MatterOperationalState) {
    MatterOperationalState[MatterOperationalState["STOPPED"] = 0] = "STOPPED";
    MatterOperationalState[MatterOperationalState["RUNNING"] = 1] = "RUNNING";
    MatterOperationalState[MatterOperationalState["PAUSED"] = 2] = "PAUSED";
    MatterOperationalState[MatterOperationalState["ERROR"] = 3] = "ERROR";
    MatterOperationalState[MatterOperationalState["SEEKING_CHARGER"] = 4] = "SEEKING_CHARGER";
    MatterOperationalState[MatterOperationalState["CHARGING"] = 5] = "CHARGING";
    MatterOperationalState[MatterOperationalState["DOCKED"] = 6] = "DOCKED";
})(MatterOperationalState || (exports.MatterOperationalState = MatterOperationalState = {}));
var MatterRvcRunMode;
(function (MatterRvcRunMode) {
    MatterRvcRunMode[MatterRvcRunMode["IDLE"] = 0] = "IDLE";
    MatterRvcRunMode[MatterRvcRunMode["CLEANING"] = 1] = "CLEANING";
    MatterRvcRunMode[MatterRvcRunMode["RETURNING_HOME"] = 2] = "RETURNING_HOME";
})(MatterRvcRunMode || (exports.MatterRvcRunMode = MatterRvcRunMode = {}));
var MatterChargeState;
(function (MatterChargeState) {
    MatterChargeState[MatterChargeState["IS_CHARGING"] = 0] = "IS_CHARGING";
    MatterChargeState[MatterChargeState["IS_NOT_CHARGING"] = 1] = "IS_NOT_CHARGING";
    MatterChargeState[MatterChargeState["UNKNOWN"] = 2] = "UNKNOWN";
})(MatterChargeState || (exports.MatterChargeState = MatterChargeState = {}));
var MatterRvcRunModeTag;
(function (MatterRvcRunModeTag) {
    MatterRvcRunModeTag[MatterRvcRunModeTag["IDLE"] = 16384] = "IDLE";
    MatterRvcRunModeTag[MatterRvcRunModeTag["CLEANING"] = 16385] = "CLEANING";
    MatterRvcRunModeTag[MatterRvcRunModeTag["MAPPING"] = 16386] = "MAPPING";
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
                modeTags: [{ value: MatterRvcRunModeTag.MAPPING }],
            },
        ];
    }
    static getOperationalStateList() {
        return [
            { operationalStateId: MatterOperationalState.STOPPED, operationalStateLabel: 'Stopped' },
            { operationalStateId: MatterOperationalState.RUNNING, operationalStateLabel: 'Running' },
            { operationalStateId: MatterOperationalState.PAUSED, operationalStateLabel: 'Paused' },
            { operationalStateId: MatterOperationalState.ERROR, operationalStateLabel: 'Error' },
            { operationalStateId: MatterOperationalState.SEEKING_CHARGER, operationalStateLabel: 'Seeking Charger' },
            { operationalStateId: MatterOperationalState.CHARGING, operationalStateLabel: 'Charging' },
            { operationalStateId: MatterOperationalState.DOCKED, operationalStateLabel: 'Docked' },
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
     * Maps internal runMode to Matter's OperationalState enum value
     */
    static mapOperationalState(state) {
        if (state.activity.activeError)
            return MatterOperationalState.ERROR;
        if (state.activity.paused)
            return MatterOperationalState.PAUSED;
        switch (state.activity.runMode) {
            case 'idle':
                if (state.power.charging || state.power.docked) {
                    return MatterOperationalState.DOCKED;
                }
                return MatterOperationalState.STOPPED;
            case 'cleaning':
                return MatterOperationalState.RUNNING;
            case 'returning':
                return MatterOperationalState.SEEKING_CHARGER;
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
