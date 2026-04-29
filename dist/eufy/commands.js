"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandBuilder = exports.EufyControlCommands = void 0;
var EufyControlCommands;
(function (EufyControlCommands) {
    EufyControlCommands[EufyControlCommands["START_AUTO_CLEAN"] = 0] = "START_AUTO_CLEAN";
    EufyControlCommands[EufyControlCommands["START_SELECT_ROOMS_CLEAN"] = 1] = "START_SELECT_ROOMS_CLEAN";
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
        const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.START_AUTO_CLEAN });
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
            select_rooms_clean: {
                rooms,
                clean_times: 1,
                mode: 0,
                ...(mapId !== undefined && mapId !== 0 ? { map_id: mapId } : {}),
            },
        });
        return { '152': buf };
    }
    /** Builds clean mode command mapped to Eufy `work_mode`. */
    buildWorkMode(mode) {
        const workMode = {
            AUTO: 0,
            VACUUM_ONLY: 1,
            VACUUM_AND_MOP: 2,
            MOP_ONLY: 3,
        }[mode];
        return { work_mode: String(workMode) };
    }
    /** Builds suction-level command mapped to `clean_speed` (1..4). */
    buildSuctionLevel(level) {
        return { clean_speed: String(level) };
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
