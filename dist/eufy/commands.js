"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandBuilder = exports.EufyControlCommands = void 0;
var EufyControlCommands;
(function (EufyControlCommands) {
    EufyControlCommands[EufyControlCommands["START_AUTO_CLEAN"] = 0] = "START_AUTO_CLEAN";
    EufyControlCommands[EufyControlCommands["START_SELECT_ROOMS_CLEAN"] = 1] = "START_SELECT_ROOMS_CLEAN";
    EufyControlCommands[EufyControlCommands["START_SPOT_CLEAN"] = 3] = "START_SPOT_CLEAN";
    EufyControlCommands[EufyControlCommands["START_GOHOME"] = 6] = "START_GOHOME";
    EufyControlCommands[EufyControlCommands["STOP_TASK"] = 12] = "STOP_TASK";
    EufyControlCommands[EufyControlCommands["PAUSE_TASK"] = 13] = "PAUSE_TASK";
    EufyControlCommands[EufyControlCommands["RESUME_TASK"] = 14] = "RESUME_TASK";
})(EufyControlCommands || (exports.EufyControlCommands = EufyControlCommands = {}));
/**
 * Encodes strongly-typed Eufy control payloads.
 */
class CommandBuilder {
    codec;
    constructor(codec) {
        this.codec = codec;
    }
    /** Builds command for returning to dock. */
    buildGoHome() {
        const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.START_GOHOME });
        return { '152': buf };
    }
    /** Builds pause command. */
    buildPause() {
        const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.PAUSE_TASK });
        return { '152': buf };
    }
    /** Builds resume command. */
    buildResume() {
        const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.RESUME_TASK });
        return { '152': buf };
    }
    /** Builds auto clean command. */
    buildStartAuto() {
        const buf = this.codec.encode('ModeCtrlRequest', {
            method: EufyControlCommands.START_AUTO_CLEAN,
            autoClean: { cleanTimes: 1, forceMapping: false },
        });
        return { '152': buf };
    }
    /** Builds stop command. */
    buildStop() {
        const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.STOP_TASK });
        return { '152': buf };
    }
    /** Builds room-selection clean command. mapId comes from DPS 165 room discovery. */
    buildRoomSelection(roomIds, mapId) {
        const rooms = roomIds.map((id, index) => ({ id, order: index + 1 }));
        const buf = this.codec.encode('ModeCtrlRequest', {
            method: EufyControlCommands.START_SELECT_ROOMS_CLEAN,
            selectRoomsClean: {
                rooms,
                cleanTimes: 1,
                mode: 0,
                releases: 1,
                ...(mapId !== undefined && mapId !== 0 ? { mapId } : {}),
            },
        });
        return { '152': buf };
    }
    /** Builds spot-clean command (cleans the area around the robot's current position). */
    buildSpotClean() {
        const buf = this.codec.encode('ModeCtrlRequest', {
            method: EufyControlCommands.START_SPOT_CLEAN,
            spotClean: { cleanTimes: 1 },
        });
        return { '152': buf };
    }
    /** Builds clean mode command as CleanParamRequest on DPS 154. */
    buildWorkMode(mode) {
        // CleanType.Value: SWEEP_ONLY=0, MOP_ONLY=1, SWEEP_AND_MOP=2, SWEEP_THEN_MOP=3
        // SPOT_CLEAN uses its own DPS 152 command and does not need a work mode update.
        // We set the clean type in BOTH clean_param (global default) AND area_clean_param
        // (used when the next run targets selected rooms / areas). Setting only the
        // global default leaves the device's persisted area_clean_param untouched, so a
        // START_SELECT_ROOMS_CLEAN would silently fall back to the previous area mode
        // (e.g. VACUUM_AND_MOP) regardless of what the user just picked.
        const cleanTypeValue = { AUTO: 2, VACUUM_ONLY: 0, MOP_ONLY: 1, VACUUM_AND_MOP: 2 };
        const cleanType = { value: cleanTypeValue[mode] ?? 2 };
        const buf = this.codec.encode('proto.cloud.CleanParamRequest', {
            cleanParam: { cleanType },
            areaCleanParam: { cleanType },
        });
        return { '154': buf };
    }
    /**
     * Builds suction-level command via DPS 154 CleanParamRequest (fan.suction index 0-4).
     * Maps SuctionLevel 1-5 → fan suction index 0-4 (QUIET/STANDARD/TURBO/MAX/MAX_PLUS).
     */
    buildSuctionLevel(level) {
        const suctionIndex = (level - 1);
        const buf = this.codec.encode('proto.cloud.CleanParamRequest', {
            cleanParam: { fan: { suction: suctionIndex } },
        });
        return { '154': buf };
    }
    /**
     * Triggers the auto-empty station to collect dust from the robot's bin.
     * Sends a StationRequest.ManualActionCmd { go_collect_dust: true } on DPS 179.
     * Only meaningful for models with a self-empty base (e.g. T2351 X10 Pro Omni).
     */
    buildEmptyBin() {
        const buf = this.codec.encode('StationRequest', { manualCmd: { goCollectDust: true } }, true);
        return { '179': buf };
    }
    /**
     * Builds a MAP_GET_ALL request to fetch all stored maps and their room params.
     * The device responds via the res topic with a MultiMapsManageResponse payload
     * on DPS key '154'.
     */
    buildRequestMapData() {
        const buf = this.codec.encode('proto.cloud.MultiMapsManageRequest', { method: 7, seq: 1 }, false);
        return { '154': buf };
    }
}
exports.CommandBuilder = CommandBuilder;
