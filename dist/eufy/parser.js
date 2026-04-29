"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateParser = void 0;
const WORK_STATUS_MAP = {
    0: 'idle',
    1: 'idle',
    2: 'error',
    3: 'idle',
    4: 'cleaning',
    5: 'cleaning',
    7: 'returning',
};
const ERROR_CODES = {
    0: 'NONE',
    1: 'CRASH BUFFER STUCK',
    2: 'WHEEL STUCK',
};
// DPS 158 fan suction index (0-4) → suctionLevel (1-4)
const FAN_SUCTION_MAP = {
    0: 1, // QUIET
    1: 2, // STANDARD
    2: 3, // TURBO
    3: 4, // MAX
    4: 4, // MAX_PLUS (cap at 4)
};
/** Parses DPS payload data into normalized vacuum state. */
class StateParser {
    codec;
    log;
    seenUnmappedDpsKeys = new Set();
    constructor(codec, log) {
        this.codec = codec;
        this.log = log;
    }
    processDps(rawDps, state) {
        const newState = {
            ...state,
            connectivity: { ...state.connectivity, online: true },
            power: { ...state.power },
            activity: { ...state.activity, selectedRooms: [...state.activity.selectedRooms], availableRooms: [...state.activity.availableRooms] },
            debug: { rawDps: { ...state.debug.rawDps, ...rawDps } },
        };
        this.log.info(`DPS update received. Keys: ${Object.keys(rawDps).join(', ')}`);
        for (const [dpsKey, value] of Object.entries(rawDps)) {
            try {
                if (!value)
                    continue;
                switch (dpsKey) {
                    case '153':
                        this.processWorkStatus(value, newState);
                        break;
                    case '154':
                        this.processCleanParamResponse(value, newState);
                        break;
                    case '158':
                        this.processCleanSpeedIndex(value, newState);
                        break;
                    case '163':
                        this.processBatteryLevel(value, newState);
                        break;
                    case '165':
                        this.processUniversalData(value, newState);
                        break;
                    case '177':
                        this.processErrorCode(value, newState);
                        break;
                    case 'clean_param':
                        this.processCleanParam(value, newState);
                        break;
                    case 'work_mode':
                        this.processWorkMode(value, newState);
                        break;
                    case 'clean_speed':
                        this.processCleanSpeedString(value, newState);
                        break;
                    default:
                        if (!this.seenUnmappedDpsKeys.has(dpsKey)) {
                            this.seenUnmappedDpsKeys.add(dpsKey);
                            this.log.debug(`Ignoring unmapped DPS key: ${dpsKey}`);
                        }
                        this.tryProcessRooms(dpsKey, value, newState);
                }
            }
            catch (error) {
                this.log.error(`Failed to parse DPS ${dpsKey}: ${String(error)}`);
            }
        }
        return newState;
    }
    processBatteryLevel(rawValue, state) {
        const parsed = Number.parseInt(rawValue, 10);
        if (Number.isNaN(parsed))
            throw new Error(`Invalid battery level payload: ${rawValue}`);
        state.power.batteryPercent = Math.min(Math.max(parsed, 0), 100);
    }
    processWorkStatus(base64Val, state) {
        const decoded = this.codec.decode('WorkStatus', base64Val);
        if (decoded.state === undefined)
            return;
        const mode = WORK_STATUS_MAP[decoded.state] ?? 'idle';
        state.activity.runMode = mode;
        state.power.docked = decoded.state === 3;
        if (mode === 'cleaning')
            state.activity.paused = false;
        state.activity.activeError = mode === 'error' ? 'Error Active' : undefined;
    }
    processErrorCode(base64Val, state) {
        const decoded = this.codec.decode('ErrorCode', base64Val);
        if (decoded.code !== undefined && decoded.code !== 0) {
            state.activity.activeError = ERROR_CODES[decoded.code] ?? `Error ${decoded.code}`;
            state.activity.runMode = 'error';
        }
        else {
            state.activity.activeError = undefined;
        }
    }
    /**
     * DPS 165 — MAP_DATA: contains room names/IDs in UniversalDataResponse.
     * This is the primary source for room discovery on modern Eufy robots.
     */
    processUniversalData(base64Val, state) {
        const errors = [];
        for (const withPrefix of [true, false]) {
            try {
                const decoded = this.codec.decode('proto.cloud.UniversalDataResponse', base64Val, withPrefix);
                const table = decoded.curMapRoom;
                if (!table?.data?.length) {
                    this.log.debug(`DPS 165 decoded (withPrefix=${withPrefix}) but curMapRoom.data is empty. decoded=${JSON.stringify(decoded).substring(0, 120)}`);
                    continue;
                }
                const rooms = this.normalizeRoomArray(table.data);
                if (rooms.length > 0) {
                    this.log.info(`Discovered ${rooms.length} rooms from DPS 165: ${rooms.map((r) => r.name).join(', ')}`);
                    state.activity.availableRooms = rooms;
                    state.activity.selectedRooms = rooms.map((r) => r.id);
                    if (table.mapId !== undefined && table.mapId !== 0) {
                        state.activity.currentMapId = table.mapId;
                        this.log.info(`Current map ID: ${table.mapId}`);
                    }
                    return;
                }
            }
            catch (e) {
                errors.push(`withPrefix=${withPrefix}: ${String(e)}`);
            }
        }
        this.log.warn(`DPS 165 received but no rooms decoded. Errors: [${errors.join('; ')}]. Raw (first 80): ${base64Val.substring(0, 80)}`);
    }
    /**
     * DPS 154 — CleanParamResponse: cleaning parameters including fan speed and clean type.
     */
    processCleanParamResponse(base64Val, state) {
        for (const withPrefix of [true, false]) {
            try {
                const decoded = this.codec.decode('proto.cloud.CleanParamResponse', base64Val, withPrefix);
                const param = decoded.cleanParam ?? decoded.runningCleanParam;
                if (!param)
                    continue;
                if (param.fan?.suction !== undefined) {
                    const mapped = FAN_SUCTION_MAP[param.fan.suction];
                    if (mapped !== undefined)
                        state.activity.suctionLevel = mapped;
                }
                if (param.cleanType?.value !== undefined) {
                    const modes = { 0: 'VACUUM_ONLY', 1: 'MOP_ONLY', 2: 'VACUUM_AND_MOP', 3: 'VACUUM_AND_MOP' };
                    state.activity.cleanMode = modes[param.cleanType.value] ?? 'AUTO';
                }
                return;
            }
            catch { /* try other prefix */ }
        }
    }
    /**
     * DPS 158 — CLEAN_SPEED: suction level as integer index (0=quiet … 4=max+).
     * Named `clean_param` DPS key is handled separately for older model compatibility.
     */
    processCleanSpeedIndex(rawValue, state) {
        const index = Number.parseInt(rawValue, 10);
        const mapped = FAN_SUCTION_MAP[index];
        if (mapped !== undefined)
            state.activity.suctionLevel = mapped;
    }
    processCleanParam(rawValue, state) {
        const rooms = this.extractRooms(rawValue);
        if (rooms.length > 0) {
            state.activity.availableRooms = rooms;
            state.activity.selectedRooms = rooms.map((r) => r.id);
        }
    }
    /**
     * Called for every DPS key that isn't explicitly handled. Tries to extract
     * room info from both JSON and protobuf formats.
     */
    tryProcessRooms(dpsKey, value, state) {
        this.log.info(`Trying room extraction for DPS '${dpsKey}' (${value.length} chars)`);
        const rooms = this.extractRooms(value);
        if (rooms.length > 0) {
            this.log.info(`Discovered ${rooms.length} rooms from DPS '${dpsKey}': ${rooms.map((r) => r.name).join(', ')}`);
            state.activity.availableRooms = rooms;
            state.activity.selectedRooms = rooms.map((r) => r.id);
        }
        else {
            this.log.debug(`No rooms found in DPS '${dpsKey}'. Raw value (first 80 chars): ${value.substring(0, 80)}`);
        }
    }
    /**
     * Tries to extract a room list from a DPS value.
     * Supports:
     *  - JSON: `{ "rooms": [{ "id": 1, "name": "Kitchen" }] }`
     *  - Protobuf RoomParams (with or without varint length prefix)
     */
    extractRooms(value) {
        if (value.startsWith('{')) {
            try {
                const parsed = JSON.parse(value);
                const rooms = this.normalizeRoomArray(parsed.rooms);
                if (rooms.length > 0)
                    return rooms;
            }
            catch { /* not valid JSON or no rooms */ }
            return [];
        }
        for (const withPrefix of [true, false]) {
            try {
                const decoded = this.codec.decode('proto.cloud.stream.RoomParams', value, withPrefix);
                const rooms = this.normalizeRoomArray(decoded.rooms);
                if (rooms.length > 0)
                    return rooms;
            }
            catch { /* not a valid RoomParams */ }
        }
        return [];
    }
    normalizeRoomArray(raw) {
        if (!Array.isArray(raw))
            return [];
        return raw
            .map((entry) => {
            if (typeof entry !== 'object' || entry === null)
                return null;
            const r = entry;
            const id = r.id !== undefined ? String(r.id) : undefined;
            if (!id || id === '0')
                return null;
            const name = (typeof r.name === 'string' && r.name.trim())
                ? r.name.trim()
                : (typeof r.label === 'string' && r.label.trim())
                    ? r.label.trim()
                    : `Room ${id}`;
            return { id, name };
        })
            .filter((r) => r !== null);
    }
    processWorkMode(rawValue, state) {
        const workMode = Number.parseInt(rawValue, 10);
        const mapped = { 0: 'AUTO', 1: 'VACUUM_ONLY', 2: 'VACUUM_AND_MOP', 3: 'MOP_ONLY' }[workMode] ?? 'AUTO';
        state.activity.cleanMode = mapped;
    }
    /** Named DPS key `clean_speed` from older/alternate firmware (values 1-4). */
    processCleanSpeedString(rawValue, state) {
        const level = Number.parseInt(rawValue, 10);
        if (level >= 1 && level <= 4) {
            state.activity.suctionLevel = level;
        }
    }
}
exports.StateParser = StateParser;
