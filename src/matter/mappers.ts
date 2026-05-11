import { NormalizedState, Power } from '../eufy/models';

export enum MatterOperationalState {
  STOPPED = 0x00,
  RUNNING = 0x01,
  PAUSED = 0x02,
  ERROR = 0x03,
  // RvcOperationalState (Matter 1.2, cluster 0x0061) extends OperationalState with:
  SEEKING_CHARGER = 0x40,
  CHARGING = 0x41,
  DOCKED = 0x42,
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
  DEEP_CLEAN = 0x4000,
  VACUUM = 0x4001,
  MOP = 0x4002,
  VACUUM_THEN_MOP = 0x4003,
}

/**
 * Common ModeBase tags (shared across Matter Mode clusters). Used here for
 * 'Auto' so it doesn't clash with the Vacuum tag — otherwise Apple Home picks
 * the first mode carrying the Vacuum tag (Auto) whenever the user selects
 * "vacuum only" in a room-clean action, and Auto maps to SWEEP_AND_MOP on the
 * device.
 */
export enum MatterCommonModeTag {
  AUTO = 0x0000,
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
      { operationalStateId: MatterOperationalState.SEEKING_CHARGER, operationalStateLabel: 'Seeking Charger' },
      { operationalStateId: MatterOperationalState.CHARGING, operationalStateLabel: 'Charging' },
      { operationalStateId: MatterOperationalState.DOCKED, operationalStateLabel: 'Docked' },
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
   * Returns the RvcCleanMode SupportedModes list. Each mode carries a unique
   * standard ModeTag so Apple Home can unambiguously map user-facing actions
   * (e.g. "vacuum only" in a room-clean automation) to the correct mode index.
   * If multiple entries shared the Vacuum tag, Apple Home would pick the first
   * one — 'Auto' — and the device would default to vacuum+mop.
   */
  public static getSupportedCleanModes(): Array<{ label: string; mode: number; modeTags: Array<{ value: number }> }> {
    return [
      { label: 'Auto', mode: MatterRvcCleanMode.AUTO, modeTags: [{ value: MatterCommonModeTag.AUTO }] },
      { label: 'Vacuum Only', mode: MatterRvcCleanMode.VACUUM_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.VACUUM }] },
      { label: 'Mop Only', mode: MatterRvcCleanMode.MOP_ONLY, modeTags: [{ value: MatterRvcCleanModeTag.MOP }] },
      {
        label: 'Vacuum and Mop',
        mode: MatterRvcCleanMode.VACUUM_AND_MOP,
        modeTags: [{ value: MatterRvcCleanModeTag.VACUUM_THEN_MOP }],
      },
      // Spot Clean has no dedicated tag in Matter 1.2 RvcCleanMode; using
      // DEEP_CLEAN here was misleading (intensive ≠ localized). Leave
      // modeTags empty so controllers don't conflate it with a deep-clean
      // preset. A dedicated tag is expected in Matter 1.4+.
      {
        label: 'Spot Clean',
        mode: MatterRvcCleanMode.SPOT_CLEAN,
        modeTags: [],
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
   * Maps internal runMode + power state to Matter's RvcOperationalState.
   *
   * Precedence:
   *   activeError > paused > runMode-specific > docked/charging-derived states.
   *
   * When the robot is `returning`, we emit SeekingCharger (0x40) so controllers
   * (e.g. Apple Home) show "Seeking Charger" instead of generic "Running".
   * When idle and on the dock, we distinguish Charging (0x41) from Docked
   * (0x42, full battery).
   */
  public static mapOperationalState(state: NormalizedState): MatterOperationalState {
    if (state.activity.activeError) return MatterOperationalState.ERROR;
    if (state.activity.paused) return MatterOperationalState.PAUSED;

    switch (state.activity.runMode) {
      case 'cleaning':
        return MatterOperationalState.RUNNING;
      case 'returning':
        return MatterOperationalState.SEEKING_CHARGER;
      case 'idle':
        if (state.power.docked) {
          return state.power.charging ? MatterOperationalState.CHARGING : MatterOperationalState.DOCKED;
        }
        return MatterOperationalState.STOPPED;
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
