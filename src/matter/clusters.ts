import { MatterMappers } from './mappers';
import { NormalizedState, RoomInfo } from '../eufy/models';

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

export interface ServiceAreaPayload {
  supportedMaps: never[];
  supportedAreas: SupportedArea[];
  selectedAreas: number[];
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
    const rooms = MatterClusterMapper.normalizeRooms(state.activity.availableRooms);
    if (rooms.length === 0) return undefined;

    const supportedAreas: SupportedArea[] = rooms.map((room, index) => {
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

    return result;
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
