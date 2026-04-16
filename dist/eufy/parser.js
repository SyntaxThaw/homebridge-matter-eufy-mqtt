"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateParser = void 0;
// Standard Matter/Normalized State Maps based on const.py
// WorkStatus.state -> runMode
const WORK_STATUS_MAP = {
    0: 'idle',
    1: 'idle',
    2: 'error',
    3: 'idle', // docked
    4: 'cleaning',
    5: 'cleaning',
    7: 'returning'
};
const ERROR_CODES = {
    0: "NONE",
    1: "CRASH BUFFER STUCK",
    2: "WHEEL STUCK",
    // ... omitting large map for brevity
};
class StateParser {
    codec;
    log;
    constructor(codec, log) {
        this.codec = codec;
        this.log = log;
    }
    processDps(rawDps, state) {
        const newState = { ...state };
        // Clone nested objects to avoid mutability bugs
        newState.power = { ...state.power };
        newState.activity = { ...state.activity };
        newState.debug = { rawDps: { ...state.debug.rawDps, ...rawDps } };
        for (const [dpsKey, value] of Object.entries(rawDps)) {
            try {
                switch (dpsKey) {
                    case '153': // WORK_STATUS
                        this.processWorkStatus(value, newState);
                        break;
                    case '163': // BATTERY_LEVEL
                        newState.power.batteryPercent = parseInt(value, 10);
                        break;
                    case '177': // ERROR_CODE
                        this.processErrorCode(value, newState);
                        break;
                }
            }
            catch (err) {
                this.log.error(`Failed to parse DPS ${dpsKey}: ${err.message}`);
            }
        }
        return newState;
    }
    processWorkStatus(base64Val, state) {
        const decoded = this.codec.decode('WorkStatus', base64Val);
        if (decoded.state !== undefined) {
            const mode = WORK_STATUS_MAP[decoded.state] || 'idle';
            state.activity.runMode = mode;
            state.power.docked = (decoded.state === 3);
            if (mode === 'cleaning')
                state.activity.paused = false;
            if (mode === 'error')
                state.activity.activeError = "Error Active";
        }
    }
    processErrorCode(base64Val, state) {
        const decoded = this.codec.decode('ErrorCode', base64Val);
        if (decoded.code !== undefined && decoded.code !== 0) {
            state.activity.activeError = ERROR_CODES[decoded.code] || `Error ${decoded.code}`;
            state.activity.runMode = 'error';
        }
        else {
            state.activity.activeError = undefined;
        }
    }
}
exports.StateParser = StateParser;
