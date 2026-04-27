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

export enum MatterRvcRunMode {
  IDLE = 0x00,
  CLEANING = 0x01,
  RETURNING_HOME = 0x02
}

export enum MatterChargeState {
  IS_CHARGING = 0x00,
  IS_NOT_CHARGING = 0x01,
  UNKNOWN = 0x02
}

export enum MatterRvcRunModeTag {
  IDLE = 0x4000,
  CLEANING = 0x4001,
  MAPPING = 0x4002
}

export enum MatterOperationalErrorState {
  NO_ERROR = 0x00,
  STUCK = 0x41
}

export class MatterMappers {
  public static getSupportedRunModes(): Array<{ label: string; mode: number; modeTags: Array<{ value: number }> }> {
    return [
      {
        label: 'Idle',
        mode: MatterRvcRunMode.IDLE,
        modeTags: [{ value: MatterRvcRunModeTag.IDLE }],
      },
      {
        label: 'Cleaning',
        mode: MatterRvcRunMode.CLEANING,
        modeTags: [{ value: MatterRvcRunModeTag.CLEANING }],
      },
      {
        label: 'Returning Home',
        mode: MatterRvcRunMode.RETURNING_HOME,
        modeTags: [{ value: MatterRvcRunModeTag.MAPPING }],
      },
    ];
  }

  public static getOperationalStateList(): Array<{ operationalStateId: number; operationalStateLabel?: string }> {
    return [
      { operationalStateId: MatterOperationalState.STOPPED },
      { operationalStateId: MatterOperationalState.RUNNING },
      { operationalStateId: MatterOperationalState.PAUSED },
      { operationalStateId: MatterOperationalState.ERROR },
      { operationalStateId: MatterOperationalState.SEEKING_CHARGER },
      { operationalStateId: MatterOperationalState.CHARGING },
      { operationalStateId: MatterOperationalState.DOCKED },
    ];
  }

  public static mapOperationalError(state: NormalizedState): { errorStateId: number; errorStateLabel?: string } {
    if (state.activity.activeError) {
      return {
        errorStateId: MatterOperationalErrorState.STUCK,
        errorStateLabel: 'Vacuum reported an active error',
      };
    }

    return { errorStateId: MatterOperationalErrorState.NO_ERROR };
  }

  public static mapRvcRunMode(state: NormalizedState): MatterRvcRunMode {
    switch (state.activity.runMode) {
      case 'cleaning':
        return MatterRvcRunMode.CLEANING;
      case 'returning':
        return MatterRvcRunMode.RETURNING_HOME;
      case 'error':
      case 'idle':
      default:
        return MatterRvcRunMode.IDLE;
    }
  }

  public static mapCleanMode(mode?: string): string {
    return mode || 'auto';
  }

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
