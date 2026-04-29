"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialState = createInitialState;
/**
 * Creates the baseline runtime state for a single Eufy robot.
 */
function createInitialState(identity, capabilities) {
    return {
        identity,
        connectivity: { online: false },
        power: { batteryPercent: 100, charging: true, docked: true },
        activity: {
            runMode: 'idle',
            paused: false,
            activeError: undefined,
            cleanMode: 'AUTO',
            suctionLevel: 2,
            selectedRooms: [],
            availableRooms: [],
            currentMapId: undefined,
        },
        capabilities,
        debug: { rawDps: {} },
    };
}
