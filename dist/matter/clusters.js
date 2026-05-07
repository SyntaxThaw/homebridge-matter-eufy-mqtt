"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterClusterMapper = void 0;
const mappers_1 = require("./mappers");
const NON_NUMERIC_AREA_OFFSET = 0x10000;
/** Creates cluster payloads from normalized state. */
class MatterClusterMapper {
    /**
     * Builds the ServiceArea payload, or returns `undefined` when the device has
     * no known rooms. Returning undefined lets callers omit the serviceArea
     * cluster entirely — registering it with an empty supportedAreas array
     * crashes the Matter ServiceAreaServer behavior in #assertSupportedMaps.
     */
    static buildServiceArea(state) {
        const rooms = MatterClusterMapper.normalizeRooms(state.activity.availableRooms);
        if (rooms.length === 0)
            return undefined;
        const supportedAreas = rooms.map((room, index) => {
            const parsed = Number.parseInt(room.id, 10);
            const areaId = Number.isFinite(parsed) && parsed > 0 ? parsed : NON_NUMERIC_AREA_OFFSET + index;
            const trimmedName = (room.name ?? '').trim();
            return {
                areaId,
                mapId: null,
                areaInfo: {
                    locationInfo: {
                        locationName: trimmedName.length > 0 ? trimmedName : `Room ${areaId}`,
                        floorNumber: null,
                        areaType: null,
                    },
                    landmarkInfo: null,
                },
            };
        });
        const validAreaIds = new Set(supportedAreas.map((a) => a.areaId));
        const selectedSource = Array.isArray(state.activity.selectedRooms) ? state.activity.selectedRooms : [];
        const selectedAreas = selectedSource
            .map((roomId) => Number.parseInt(roomId, 10))
            .filter((areaId) => Number.isFinite(areaId) && validAreaIds.has(areaId));
        return { supportedMaps: [], supportedAreas, selectedAreas };
    }
    static toMatterState(state) {
        const result = {
            RvcRunMode: {
                supportedModes: mappers_1.MatterMappers.getSupportedRunModes(),
                currentMode: mappers_1.MatterMappers.mapRvcRunMode(state),
            },
            RvcCleanMode: {
                supportedModes: mappers_1.MatterMappers.getSupportedCleanModes(),
                currentMode: mappers_1.MatterMappers.mapRvcCleanMode(state.activity.cleanMode),
            },
            RvcOperationalState: {
                operationalStateList: mappers_1.MatterMappers.getOperationalStateList(),
                operationalState: mappers_1.MatterMappers.mapOperationalState(state),
                operationalError: mappers_1.MatterMappers.mapOperationalError(state),
            },
            PowerSource: {
                batPercentRemaining: mappers_1.MatterMappers.mapBatteryLevel(state.power.batteryPercent),
                batChargeState: mappers_1.MatterMappers.mapChargeState(state.power),
            },
        };
        const serviceArea = MatterClusterMapper.buildServiceArea(state);
        if (serviceArea) {
            result.ServiceArea = serviceArea;
        }
        return result;
    }
    static normalizeRooms(value) {
        if (!Array.isArray(value))
            return [];
        return value.filter((room) => typeof room === 'object'
            && room !== null
            && typeof room.id === 'string'
            && room.id.length > 0);
    }
}
exports.MatterClusterMapper = MatterClusterMapper;
