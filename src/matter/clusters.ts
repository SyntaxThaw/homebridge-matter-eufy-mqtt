import { MatterMappers } from './mappers';
import { MapRooms, NormalizedState, RoomInfo } from '../eufy/models';

export interface SupportedArea {
  areaId: number;
  mapId: number | null;
  areaInfo: {
    locationInfo: {
      locationName: string;
      floorNumber: number | null;
      areaType: number | null;
    } | null;
    landmarkInfo: null;
  };
}

export interface SupportedMap {
  mapId: number;
  mapName: string;
}

export interface ServiceAreaPayload {
  supportedMaps: SupportedMap[];
  supportedAreas: SupportedArea[];
  selectedAreas: number[];
}

export interface EufyCleanSessionData {
  durationSeconds: number;
  areaSqDm: number;
}

/** Mirrors ConsumableData — all fields optional since not all models report all consumables. */
export interface EufyConsumablesPayload {
  sideBrushHours?: number;
  rollingBrushHours?: number;
  filterMeshHours?: number;
  mopHours?: number;
  dustbagHours?: number;
  dirtyWaterFilterHours?: number;
}

const NON_NUMERIC_AREA_OFFSET = 0x10000;

/** Creates cluster payloads from normalized state. */
export class MatterClusterMapper {
  /**
   * Builds the ServiceArea payload, or returns `undefined` when the device has
   * no known rooms. Returning undefined lets callers omit the serviceArea
   * cluster entirely — registering it with an empty supportedAreas array
   * crashes the Matter ServiceAreaServer behavior in #assertSupportedMaps.
   */
  public static buildServiceArea(state: NormalizedState): ServiceAreaPayload | undefined {
    const knownMaps = state.activity.knownMaps ?? [];
    const mapsWithRooms = knownMaps
      .map((m) => ({ ...m, rooms: MatterClusterMapper.normalizeRooms(m.rooms) }))
      .filter((m) => m.rooms.length > 0);

    // Fall back to mapless mode when knownMaps is empty (no mapId in DPS 165, or
    // device has a single floor without an explicit map ID).
    const useMapMode = mapsWithRooms.length > 0;

    let supportedMaps: SupportedMap[] = [];
    let supportedAreas: SupportedArea[] = [];

    if (useMapMode) {
      supportedMaps = mapsWithRooms.map((m, index) => ({
        mapId: m.mapId,
        mapName: `Floor ${index + 1}`,
      }));

      let globalIndex = 0;
      for (const map of mapsWithRooms) {
        for (const room of map.rooms) {
          const parsed = Number.parseInt(room.id, 10);
          const areaId = Number.isFinite(parsed) && parsed > 0 ? parsed : NON_NUMERIC_AREA_OFFSET + globalIndex;
          const trimmedName = (room.name ?? '').trim();
          supportedAreas.push({
            areaId,
            mapId: map.mapId,
            areaInfo: {
              locationInfo: {
                locationName: trimmedName.length > 0 ? trimmedName : `Room ${areaId}`,
                floorNumber: null,
                areaType: null,
              },
              landmarkInfo: null,
            },
          });
          globalIndex += 1;
        }
      }
    } else {
      // Mapless mode: flat list of rooms without floor association.
      const rooms = MatterClusterMapper.normalizeRooms(state.activity.availableRooms);
      if (rooms.length === 0) return undefined;

      supportedAreas = rooms.map((room, index) => {
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
    }

    if (supportedAreas.length === 0) return undefined;

    const validAreaIds = new Set(supportedAreas.map((a) => a.areaId));
    const selectedSource = Array.isArray(state.activity.selectedRooms) ? state.activity.selectedRooms : [];
    const selectedAreas = selectedSource
      .map((roomId) => Number.parseInt(roomId, 10))
      .filter((areaId) => Number.isFinite(areaId) && validAreaIds.has(areaId));

    return { supportedMaps, supportedAreas, selectedAreas };
  }

  public static toMatterState(state: NormalizedState): Record<string, unknown> {
    const result: Record<string, unknown> = {
      RvcRunMode: {
        supportedModes: MatterMappers.getSupportedRunModes(),
        currentMode: MatterMappers.mapRvcRunMode(state),
      },
      RvcCleanMode: {
        supportedModes: MatterMappers.getSupportedCleanModes(),
        currentMode: MatterMappers.mapRvcCleanMode(state.activity.cleanMode),
      },
      RvcOperationalState: {
        operationalStateList: MatterMappers.getOperationalStateList(),
        operationalState: MatterMappers.mapOperationalState(state),
        operationalError: MatterMappers.mapOperationalError(state),
      },
      PowerSource: {
        batPercentRemaining: MatterMappers.mapBatteryLevel(state.power.batteryPercent),
        batChargeState: MatterMappers.mapChargeState(state.power),
      },
    };

    const serviceArea = MatterClusterMapper.buildServiceArea(state);
    if (serviceArea) {
      result.ServiceArea = serviceArea;
    }

    // EufyCleaningSettings (suctionLevel / mopLevel) is intentionally omitted
    // from the Matter state push: Homebridge does not yet support custom cluster
    // behaviors, and pushing an unknown cluster causes a matter.js transaction
    // rollback on every sync. The full implementation (CommandBuilder, handlers,
    // mappers, platform wiring) is in place — add it back here once Homebridge
    // exposes a custom-cluster API.

    // EufyCleanSessionData (durationSeconds / areaSqDm) is also omitted for the
    // same reason — custom cluster behaviors are not yet supported by Homebridge.
    // Call buildCleanSession() directly when the API becomes available.

    // EufyConsumables (consumable wear hours) is intentionally omitted from
    // the Matter state push: Homebridge does not yet support custom cluster
    // behaviors, and pushing an unknown cluster causes a matter.js transaction
    // rollback on every sync. The full implementation (buildConsumables,
    // mappers, interface) is in place — add it back here once Homebridge
    // exposes a custom-cluster API.

    return result;
  }

  public static buildCleanSession(state: NormalizedState): EufyCleanSessionData | undefined {
    const session = MatterMappers.mapCleanSession(state);
    if (!session) return undefined;
    return session;
  }

  /**
   * Builds the EufyConsumables payload from normalized state, or returns null
   * when consumable data has not yet been reported by the device.
   * Not pushed to Matter until Homebridge supports custom cluster behaviors.
   */
  public static buildConsumables(state: NormalizedState): EufyConsumablesPayload | null {
    return MatterMappers.mapConsumables(state);
  }

  private static normalizeRooms(value: RoomInfo[] | undefined): RoomInfo[] {
    if (!Array.isArray(value)) return [];
    return value.filter((room): room is RoomInfo =>
      typeof room === 'object'
      && room !== null
      && typeof room.id === 'string'
      && room.id.length > 0,
    );
  }
}

// EufyMapSelection (F1): currentMapId is used internally by handleStartCommand()
// for room-clean payloads. Exposing map switching to Apple Home requires both
// a list of available maps (not tracked — DPS 165 provides rooms but not a map
// catalogue) and Homebridge custom cluster support. Deferred until both
// prerequisites are met.
