import { MatterMappers } from './mappers';
import { NormalizedState } from '../eufy/models';

/** Creates cluster payloads from normalized state. */
export class MatterClusterMapper {
  public static toMatterState(state: NormalizedState): Record<string, unknown> {
    const supportedAreas = state.activity.availableRooms
      .map((room, index) => {
        const parsed = Number.parseInt(room.id, 10);
        // Use a large offset for non-numeric IDs to avoid colliding with numeric room IDs (typically 1-16)
        const areaId = Number.isFinite(parsed) && parsed > 0 ? parsed : 0x10000 + index;
        return {
          areaId,
          mapId: null,
          areaInfo: {
            locationInfo: {
              locationName: room.name.trim(),
              floorNumber: null,
              areaType: null,
            },
            landmarkInfo: null,
          },
        };
      });

    const selectedAreas = state.activity.selectedRooms
      .map((roomId) => Number.parseInt(roomId, 10))
      .filter((areaId) => Number.isFinite(areaId));

    return {
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
      ServiceArea: {
        supportedMaps: [],
        supportedAreas,
        selectedAreas,
      },
      PowerSource: {
        batPercentRemaining: MatterMappers.mapBatteryLevel(state.power.batteryPercent),
        batChargeState: MatterMappers.mapChargeState(state.power),
      },
    };
  }
}
