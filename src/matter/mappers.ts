import { NormalizedState } from '../eufy/models';

export enum MatterOperationalState {
  STOPPED = 0x00,
  RUNNING = 0x01,
  PAUSED = 0x02,
  ERROR = 0x03,
  SEEKING_CHARGER = 0x04,
  CHARGING = 0x05,
  DOCKED = 0x06
}

export enum MatterChargeState {
  IS_CHARGING = 0x00,
  IS_NOT_CHARGING = 0x01,
  UNKNOWN = 0x02
}

export class MatterMappers {
  /**
   * Maps internal runMode to Matter's OperationalState enum value
   */
  public static mapOperationalState(state: NormalizedState): MatterOperationalState {
    if (state.activity.activeError) return MatterOperationalState.ERROR;
    if (state.activity.paused) return MatterOperationalState.PAUSED;

    switch (state.activity.runMode) {
      case 'idle':
        if (state.power.charging || state.power.docked) {
          return MatterOperationalState.DOCKED;
        }
        return MatterOperationalState.STOPPED;
      case 'cleaning':
        return MatterOperationalState.RUNNING;
      case 'returning':
        return MatterOperationalState.SEEKING_CHARGER;
      case 'error':
      default:
        return MatterOperationalState.ERROR;
    }
  }

  /**
   * Translates 0-100 battery level into Matter's 0-200 BatPercentRemaining scale
   */
  public static mapBatteryLevel(percent: number): number {
    return Math.min(Math.max(percent * 2, 0), 200);
  }

  /**
   * Maps strictly to charging enum
   */
  public static mapChargeState(isCharging: boolean): MatterChargeState {
    return isCharging ? MatterChargeState.IS_CHARGING : MatterChargeState.IS_NOT_CHARGING;
  }
}
