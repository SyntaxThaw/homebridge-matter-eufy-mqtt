"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterMappers = exports.MatterChargeState = exports.MatterOperationalState = void 0;
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
var MatterChargeState;
(function (MatterChargeState) {
    MatterChargeState[MatterChargeState["IS_CHARGING"] = 0] = "IS_CHARGING";
    MatterChargeState[MatterChargeState["IS_NOT_CHARGING"] = 1] = "IS_NOT_CHARGING";
    MatterChargeState[MatterChargeState["UNKNOWN"] = 2] = "UNKNOWN";
})(MatterChargeState || (exports.MatterChargeState = MatterChargeState = {}));
class MatterMappers {
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
