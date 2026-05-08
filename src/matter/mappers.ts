import { NormalizedState, Power } from '../eufy/models';

export enum MatterOperationalState {
  STOPPED = 0x00,
  RUNNING = 0x01,
  PAUSED = 0x02,
  ERROR = 0x03
}

export enum MatterRvcRunMode {
  IDLE = 0x00,
  CLEANING = 0x01,
  RETURNING_HOME = 0x02,
}

export enum MatterChargeState {
  UNKNOWN = 0x00,
  IS_NOT_CHARGING = 0x01,
  IS_AT_MAX_CHARGE = 0x02,
  IS_CHARGING = 0x03,
}

export enum MatterRvcCleanMode {
  AUTO = 0x00,
  VACUUM_ONLY = 0x01,
  MOP_ONLY = 0x02,
  VACUUM_AND_MOP = 0x03,
  SPOT_CLEAN = 0x04,
}

export enum MatterRvcCleanModeTag {
  VACUUM = 0x4001,
  MOP = 0x4002,
  VACUUM_THEN_MOP = 0x4003,
}

export enum MatterRvcRunModeTag {
  IDLE = 0x4000,
  CLEANING = 0x4001,
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
        modeTags: [],
      },
    ];
  }

  public static getOperationalStateList(): Array<{ operationalStateId: number; operationalStateLabel?: string }> {
    return [
      { operationalStateId: MatterOperationalState.STOPPED },
      { operationalStateId: MatterOperationalState.RUNNING },
      { operationalStateId: MatterOperationalState.PAUSED },
      { operationalStateId: MatterOperationalState.ERROR },
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

  public static getSupportedCleanModes(): Array<{ label: string; mode: number; modeTags: Array<{ value: number }> }> {
    return [
      { label: 'Auto', mode: MatterRvcCleanMode.AUTO, modeTags: [{ value: MatterRvcCleanModeTag.VACUUM }] },
      { label: 'Vacuum Only', mode: MatterRvcCleanMode.VACUUM_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.VACUUM }] },
      { label: 'Mop Only', mode: MatterRvcCleanMode.MOP_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.MOP }] },
      {
        label: 'Vacuum and Mop',
        mode: MatterRvcCleanMode.VACUUM_AND_MOP,
        modeTags: [{ value: MatterRvcCleanModeTag.VACUUM_THEN_MOP }],
      },
      {
        label: 'Spot Clean',
        mode: MatterRvcCleanMode.SPOT_CLEAN,
        modeTags: [{ value: MatterRvcCleanModeTag.VACUUM }],
      },
    ];
  }

  public static mapRvcCleanMode(mode: NormalizedState['activity']['cleanMode']): MatterRvcCleanMode {
    switch (mode) {
      case 'VACUUM_ONLY':
        return MatterRvcCleanMode.VACUUM_ONLY;
      case 'MOP_ONLY':
        return MatterRvcCleanMode.MOP_ONLY;
      case 'VACUUM_AND_MOP':
        return MatterRvcCleanMode.VACUUM_AND_MOP;
      case 'SPOT_CLEAN':
        return MatterRvcCleanMode.SPOT_CLEAN;
      case 'AUTO':
      default:
        return MatterRvcCleanMode.AUTO;
    }
  }

  /**
   * Maps internal runMode to Matter's OperationalState enum value
   */
  public static mapOperationalState(state: NormalizedState): MatterOperationalState {
    if (state.activity.activeError) return MatterOperationalState.ERROR;
    if (state.activity.paused) return MatterOperationalState.PAUSED;

    switch (state.activity.runMode) {
      case 'idle':
        return MatterOperationalState.STOPPED;
      case 'cleaning':
      case 'returning':
        return MatterOperationalState.RUNNING;
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
   * Maps power state to Matter BatChargeState enum.
   * `charging` is set by processWorkStatus: true=actively charging (DOING), false=done (DONE).
   */
  public static mapChargeState(power: Pick<Power, 'docked' | 'charging'>): MatterChargeState {
    if (!power.docked) return MatterChargeState.IS_NOT_CHARGING;
    if (power.charging) return MatterChargeState.IS_CHARGING;
    return MatterChargeState.IS_AT_MAX_CHARGE;
  }
}
