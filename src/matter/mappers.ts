import { MopLevel, NormalizedState, Power } from '../eufy/models';

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
  STUCK = 0x41,
  DUST_BIN_MISSING = 0x42,
  WATER_TANK_EMPTY = 0x43,
  WATER_TANK_MISSING = 0x44,
  MOP_CLEANING_PAD_MISSING = 0x45,
  UNABLE_TO_START_OR_RESUME = 0x47,
  FAILED_TO_FIND_CHARGING_DOCK = 0x48,
}

// Maps DPS 177 raw integer error codes to granular Matter RVC error states.
// Codes not in this table fall back to STUCK (most general "blocked" state).
const ERROR_CODE_TO_MATTER_STATE: Record<number, MatterOperationalErrorState> = {
  // ── Stuck / physically trapped ───────────────────────────────────────────
  1: MatterOperationalErrorState.STUCK,    // BUMPER STUCK
  2: MatterOperationalErrorState.STUCK,    // WHEEL STUCK
  3: MatterOperationalErrorState.STUCK,    // SIDE BRUSH STUCK
  6: MatterOperationalErrorState.STUCK,    // TRAPPED
  22: MatterOperationalErrorState.STUCK,   // FRONT COVER STUCK
  24: MatterOperationalErrorState.STUCK,   // MIDDLE BRUSH STUCK
  // Wheel motor errors (E1xxx) — robot can't move
  1010: MatterOperationalErrorState.STUCK, 1011: MatterOperationalErrorState.STUCK,
  1012: MatterOperationalErrorState.STUCK, 1013: MatterOperationalErrorState.STUCK,
  1020: MatterOperationalErrorState.STUCK, 1021: MatterOperationalErrorState.STUCK,
  1022: MatterOperationalErrorState.STUCK, 1023: MatterOperationalErrorState.STUCK,
  1030: MatterOperationalErrorState.STUCK, 1031: MatterOperationalErrorState.STUCK,
  1032: MatterOperationalErrorState.STUCK, 1033: MatterOperationalErrorState.STUCK,
  // Collision / navigation stuck (E4xxx, E7xxx)
  4111: MatterOperationalErrorState.STUCK, // LEFT FRONT COLLISION STUCK
  4112: MatterOperationalErrorState.STUCK, // RIGHT FRONT COLLISION STUCK
  4130: MatterOperationalErrorState.STUCK, // LASER SHIELD STUCK
  7000: MatterOperationalErrorState.STUCK, // SMALL SPACE TIMEOUT
  7001: MatterOperationalErrorState.STUCK, // PARTIALLY SUSPENDED
  7002: MatterOperationalErrorState.STUCK, // ROBOT LIFTED — WHEELS SUSPENDED
  7003: MatterOperationalErrorState.STUCK, // STARTUP FALL DETECTED
  7004: MatterOperationalErrorState.STUCK, // ROBOT STUCK
  7053: MatterOperationalErrorState.STUCK, // ROBOT TILTED

  // ── Dust bin / bag missing ───────────────────────────────────────────────
  5: MatterOperationalErrorState.DUST_BIN_MISSING,    // DUSTBOX MISSING OR FULL
  2310: MatterOperationalErrorState.DUST_BIN_MISSING, // DUSTBOX NOT INSTALLED
  6111: MatterOperationalErrorState.DUST_BIN_MISSING, // DUSTBIN AIR LEAK
  6112: MatterOperationalErrorState.DUST_BIN_MISSING, // DUSTBIN BLOCKED
  6113: MatterOperationalErrorState.DUST_BIN_MISSING, // DUSTBAG NOT INSTALLED

  // ── Water tank empty ─────────────────────────────────────────────────────
  3013: MatterOperationalErrorState.WATER_TANK_EMPTY, // ROBOT WATER TANK INSUFFICIENT
  6011: MatterOperationalErrorState.WATER_TANK_EMPTY, // CLEAN WATER TANK EMPTY

  // ── Water tank missing ───────────────────────────────────────────────────
  3020: MatterOperationalErrorState.WATER_TANK_MISSING, // ROBOT WATER TANK REMOVED
  6010: MatterOperationalErrorState.WATER_TANK_MISSING, // CLEAN WATER TANK NOT INSTALLED
  6020: MatterOperationalErrorState.WATER_TANK_MISSING, // DIRTY WATER TANK NOT INSTALLED
  6025: MatterOperationalErrorState.WATER_TANK_MISSING, // DIRTY WATER TANK FULL OR NOT INSTALLED

  // ── Mop / cleaning pad missing ───────────────────────────────────────────
  3110: MatterOperationalErrorState.MOP_CLEANING_PAD_MISSING, // LEFT MOP NOT INSTALLED
  3111: MatterOperationalErrorState.MOP_CLEANING_PAD_MISSING, // RIGHT MOP NOT INSTALLED
  6030: MatterOperationalErrorState.MOP_CLEANING_PAD_MISSING, // CLEANING DISC NOT INSTALLED
  6032: MatterOperationalErrorState.MOP_CLEANING_PAD_MISSING, // CLEANING DISC MISSING OR FULL

  // ── Unable to start or resume ────────────────────────────────────────────
  7010: MatterOperationalErrorState.UNABLE_TO_START_OR_RESUME, // ENTERED FORBIDDEN AREA
  7011: MatterOperationalErrorState.UNABLE_TO_START_OR_RESUME, // ENTERED CARPET ZONE
  7034: MatterOperationalErrorState.UNABLE_TO_START_OR_RESUME, // STARTING POINT NOT FOUND
  7040: MatterOperationalErrorState.UNABLE_TO_START_OR_RESUME, // UNDOCKING FAILED

  // ── Failed to find charging dock ─────────────────────────────────────────
  7031: MatterOperationalErrorState.FAILED_TO_FIND_CHARGING_DOCK, // DOCKING FAILED
  7033: MatterOperationalErrorState.FAILED_TO_FIND_CHARGING_DOCK, // EXPLORING BASE STATION FAILED
  7035: MatterOperationalErrorState.FAILED_TO_FIND_CHARGING_DOCK, // DOCKING FAILED — BASE NOT POWERED
  7036: MatterOperationalErrorState.FAILED_TO_FIND_CHARGING_DOCK, // DOCKING FAILED — OMNI-WHEEL JAMMED
  7037: MatterOperationalErrorState.FAILED_TO_FIND_CHARGING_DOCK, // DOCKING FAILED — INFRARED INTERFERENCE
  7055: MatterOperationalErrorState.FAILED_TO_FIND_CHARGING_DOCK, // BASE STATION NOT FOUND — MOPPING SKIPPED
};

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
      { operationalStateId: MatterOperationalState.SEEKING_CHARGER },
      { operationalStateId: MatterOperationalState.CHARGING },
      { operationalStateId: MatterOperationalState.DOCKED },
    ];
  }

  public static mapOperationalError(state: NormalizedState): { errorStateId: number; errorStateLabel?: string } {
    if (!state.activity.activeError) {
      return { errorStateId: MatterOperationalErrorState.NO_ERROR };
    }

    const code = state.activity.activeErrorCode;
    const errorStateId = (code !== undefined && ERROR_CODE_TO_MATTER_STATE[code] !== undefined)
      ? ERROR_CODE_TO_MATTER_STATE[code]!
      : MatterOperationalErrorState.STUCK;

    return { errorStateId, errorStateLabel: state.activity.activeError };
  }

  public static getErrorStateList(): Array<{ errorStateId: number }> {
    return [
      { errorStateId: MatterOperationalErrorState.NO_ERROR },
      { errorStateId: MatterOperationalErrorState.STUCK },
      { errorStateId: MatterOperationalErrorState.DUST_BIN_MISSING },
      { errorStateId: MatterOperationalErrorState.WATER_TANK_EMPTY },
      { errorStateId: MatterOperationalErrorState.WATER_TANK_MISSING },
      { errorStateId: MatterOperationalErrorState.MOP_CLEANING_PAD_MISSING },
      { errorStateId: MatterOperationalErrorState.UNABLE_TO_START_OR_RESUME },
      { errorStateId: MatterOperationalErrorState.FAILED_TO_FIND_CHARGING_DOCK },
    ];
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

  /** Maps MopLevel string to numeric index (LOW=0, MIDDLE=1, HIGH=2). */
  public static mapMopLevel(level: MopLevel): 0 | 1 | 2 {
    const map: Record<MopLevel, 0 | 1 | 2> = { LOW: 0, MIDDLE: 1, HIGH: 2 };
    return map[level];
  }

  /** Reverse of mapMopLevel — validates and converts numeric index to MopLevel. */
  public static mapMopLevelFromNumber(level: number): MopLevel {
    if (level === 0) return 'LOW';
    if (level === 2) return 'HIGH';
    return 'MIDDLE';
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

  /**
   * Returns the clean session data for the current (or last) cleaning session,
   * or null when no session data is available. The device reports area in dm²
   * even though the model field is named areaSqCm; the public attribute is
   * renamed to areaSqDm to reflect the actual unit.
   */
  public static mapCleanSession(state: NormalizedState): { durationSeconds: number; areaSqDm: number } | null {
    const session = state.activity.cleanSession;
    if (!session) return null;
    return { durationSeconds: session.durationSeconds, areaSqDm: session.areaSqCm };
  }
}
