"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialState = createInitialState;
function createInitialState(identity, capabilities) {
    return {
        identity,
        connectivity: { online: false },
        power: { batteryPercent: 100, charging: true, docked: true },
        activity: { runMode: "idle", paused: false },
        capabilities,
        debug: { rawDps: {} }
    };
}
