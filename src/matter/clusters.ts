import { MatterMappers } from './mappers';
import { NormalizedState } from '../eufy/models';

/** Creates cluster payloads from normalized state. */
export class MatterClusterMapper {
  public static toMatterState(state: NormalizedState): Record<string, unknown> {
    return {
      RvcRunMode: {
        supportedModes: MatterMappers.getSupportedRunModes(),
        currentMode: MatterMappers.mapRvcRunMode(state),
      },
      RvcOperationalState: {
        operationalStateList: MatterMappers.getOperationalStateList(),
        operationalState: MatterMappers.mapOperationalState(state),
        operationalError: MatterMappers.mapOperationalError(state),
      },
      PowerSource: {
        batPercentRemaining: MatterMappers.mapBatteryLevel(state.power.batteryPercent),
        batChargeState: MatterMappers.mapChargeState(state.power.charging),
      },
      EufyCleaningSettings: {
        cleaningMode: state.activity.cleanMode,
        suctionLevel: state.activity.suctionLevel,
        availableRooms: state.activity.availableRooms,
        selectedRooms: state.activity.selectedRooms,
      },
    };
  }
}
