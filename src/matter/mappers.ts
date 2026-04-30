import { NormalizedState } from '../eufy/models';

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
  EMPTY_BIN = 0x03,
}

export enum MatterChargeState {
  IS_CHARGING = 0x00,
  IS_NOT_CHARGING = 0x01,
  UNKNOWN = 0x02
}

export enum MatterRvcCleanMode {
  AUTO = 0x00,
  VACUUM_ONLY = 0x01,
  MOP_ONLY = 0x02,
  VACUUM_AND_MOP = 0x03,
  EMPTY_BIN = 0x04,
}

export enum MatterRvcCleanModeTag {
  VACUUM = 0x4001,
  MOP = 0x4002,
  VACUUM_THEN_MOP = 0x4003,
  // Application-specific tag (common namespace 0x0000) so Apple Home falls back
  // to the mode label ("Empty Bin") instead of a localized standard name.
  EMPTY_BIN = 0x0000,
}

export enum MatterRvcRunModeTag {
  IDLE = 0x4000,
  CLEANING = 0x4001,
  MAPPING = 0x4002,
  // 0x4003 is outside the three standard RvcRunMode tags; Apple Home uses the label field as fallback.
  EMPTY_BIN = 0x4003,
}

export enum MatterOperationalErrorState {
  NO_ERROR = 0x00,
  STUCK = 0x41
}

export class MatterMappers {
  public static getSupportedRunModes(includeEmptyBin = false): Array<{ label: string; mode: number; modeTags: Array<{ value: number }> }> {
    const modes: Array<{ label: string; mode: number; modeTags: Array<{ value: number }> }> = [
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

    if (includeEmptyBin) {
      modes.push({
        label: 'Empty Bin',
        mode: MatterRvcRunMode.EMPTY_BIN,
        modeTags: [{ value: MatterRvcRunModeTag.EMPTY_BIN }],
      });
    }

    return modes;
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

  public static getSupportedCleanModes(includeEmptyBin = false): Array<{ label: string; mode: number; modeTags: Array<{ value: number }> }> {
    const modes: Array<{ label: string; mode: number; modeTags: Array<{ value: number }> }> = [
      { label: 'Auto', mode: MatterRvcCleanMode.AUTO, modeTags: [{ value: MatterRvcCleanModeTag.VACUUM }] },
      { label: 'Vacuum Only', mode: MatterRvcCleanMode.VACUUM_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.VACUUM }] },
      { label: 'Mop Only', mode: MatterRvcCleanMode.MOP_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.MOP }] },
      {
        label: 'Vacuum and Mop',
        mode: MatterRvcCleanMode.VACUUM_AND_MOP,
        modeTags: [{ value: MatterRvcCleanModeTag.VACUUM_THEN_MOP }],
      },
    ];
    if (includeEmptyBin) {
      // Tag 0x0000 (common namespace "Auto") is unrecognized in the RvcCleanMode
      // namespace, so Apple Home falls back to the label field ("Empty Bin").
      modes.push({ label: 'Empty Bin', mode: MatterRvcCleanMode.EMPTY_BIN, modeTags: [{ value: MatterRvcCleanModeTag.EMPTY_BIN }] });
    }
    return modes;
  }

  public static mapRvcCleanMode(mode: NormalizedState['activity']['cleanMode']): MatterRvcCleanMode {
    switch (mode) {
      case 'VACUUM_ONLY':
        return MatterRvcCleanMode.VACUUM_ONLY;
      case 'MOP_ONLY':
        return MatterRvcCleanMode.MOP_ONLY;
      case 'VACUUM_AND_MOP':
        return MatterRvcCleanMode.VACUUM_AND_MOP;
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
   * Maps strictly to charging enum
   */
  public static mapChargeState(isCharging: boolean): MatterChargeState {
    return isCharging ? MatterChargeState.IS_CHARGING : MatterChargeState.IS_NOT_CHARGING;
  }
}
