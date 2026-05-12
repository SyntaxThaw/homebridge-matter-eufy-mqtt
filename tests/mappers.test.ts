import { describe, expect, it } from 'vitest';
import {
  MatterChargeState,
  MatterMappers,
  MatterOperationalErrorState,
  MatterOperationalState,
  MatterRvcRunMode,
} from '../src/matter/mappers';
import { makeState } from './fixtures/state';

// ─── mapBatteryLevel ────────────────────────────────────────────────────────

describe('mapBatteryLevel', () => {
  it('scales 0-100 to 0-200', () => {
    expect(MatterMappers.mapBatteryLevel(0)).toBe(0);
    expect(MatterMappers.mapBatteryLevel(50)).toBe(100);
    expect(MatterMappers.mapBatteryLevel(100)).toBe(200);
  });

  it('clamps values above 100', () => {
    expect(MatterMappers.mapBatteryLevel(101)).toBe(200);
    expect(MatterMappers.mapBatteryLevel(999)).toBe(200);
  });

  it('clamps values below 0', () => {
    expect(MatterMappers.mapBatteryLevel(-1)).toBe(0);
  });
});

// ─── mapChargeState ─────────────────────────────────────────────────────────

describe('mapChargeState', () => {
  it('returns IS_NOT_CHARGING when not docked', () => {
    expect(MatterMappers.mapChargeState({ docked: false, charging: false })).toBe(MatterChargeState.IS_NOT_CHARGING);
    expect(MatterMappers.mapChargeState({ docked: false, charging: true })).toBe(MatterChargeState.IS_NOT_CHARGING);
  });

  it('returns IS_CHARGING when docked and actively charging', () => {
    expect(MatterMappers.mapChargeState({ docked: true, charging: true })).toBe(MatterChargeState.IS_CHARGING);
  });

  it('returns IS_AT_MAX_CHARGE when docked and charge complete', () => {
    expect(MatterMappers.mapChargeState({ docked: true, charging: false })).toBe(MatterChargeState.IS_AT_MAX_CHARGE);
  });
});

// ─── mapOperationalState ────────────────────────────────────────────────────

describe('mapOperationalState', () => {
  it('maps idle runMode (not docked) to STOPPED', () => {
    const state = makeState((s) => { s.activity.runMode = 'idle'; s.power.docked = false; });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.STOPPED);
  });

  it('maps cleaning runMode to RUNNING', () => {
    const state = makeState((s) => { s.activity.runMode = 'cleaning'; });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.RUNNING);
  });

  it('maps returning runMode to SEEKING_CHARGER (A1)', () => {
    const state = makeState((s) => { s.activity.runMode = 'returning'; });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.SEEKING_CHARGER);
  });

  it('maps idle + docked + charging to CHARGING (A2)', () => {
    const state = makeState((s) => {
      s.activity.runMode = 'idle';
      s.power.docked = true;
      s.power.charging = true;
    });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.CHARGING);
  });

  it('maps idle + docked + not charging to DOCKED (A2)', () => {
    const state = makeState((s) => {
      s.activity.runMode = 'idle';
      s.power.docked = true;
      s.power.charging = false;
    });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.DOCKED);
  });

  it('maps error runMode to ERROR', () => {
    const state = makeState((s) => { s.activity.runMode = 'error'; });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.ERROR);
  });

  it('paused flag overrides runMode to PAUSED', () => {
    const state = makeState((s) => { s.activity.runMode = 'cleaning'; s.activity.paused = true; });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.PAUSED);
  });

  it('activeError overrides runMode to ERROR', () => {
    const state = makeState((s) => { s.activity.runMode = 'idle'; s.activity.activeError = 'STUCK'; });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.ERROR);
  });

  it('activeError takes precedence over paused', () => {
    const state = makeState((s) => {
      s.activity.runMode = 'cleaning';
      s.activity.paused = true;
      s.activity.activeError = 'STUCK';
    });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.ERROR);
  });
});

describe('getOperationalStateList', () => {
  it('includes the three RvcOperationalState extensions (0x40, 0x41, 0x42)', () => {
    const list = MatterMappers.getOperationalStateList();
    const ids = list.map((entry) => entry.operationalStateId);
    expect(ids).toContain(MatterOperationalState.SEEKING_CHARGER);
    expect(ids).toContain(MatterOperationalState.CHARGING);
    expect(ids).toContain(MatterOperationalState.DOCKED);
  });
});

describe('getSupportedCleanModes (Spot Clean tag — C1)', () => {
  it('Spot Clean does not advertise the DEEP_CLEAN tag', () => {
    const modes = MatterMappers.getSupportedCleanModes();
    const spot = modes.find((m) => m.label === 'Spot Clean');
    expect(spot).toBeDefined();
    expect(spot!.modeTags).not.toContainEqual({ value: 0x4000 });
  });
});

// ─── mapOperationalError ────────────────────────────────────────────────────

describe('mapOperationalError', () => {
  it('returns NO_ERROR (0x00) when no activeError', () => {
    const state = makeState();
    const result = MatterMappers.mapOperationalError(state);
    expect(result.errorStateId).toBe(MatterOperationalErrorState.NO_ERROR);
  });

  it('returns STUCK (0x41) when activeError is set without a specific code', () => {
    const state = makeState((s) => { s.activity.activeError = 'Error Active'; s.activity.activeErrorCode = undefined; });
    const result = MatterMappers.mapOperationalError(state);
    expect(result.errorStateId).toBe(MatterOperationalErrorState.STUCK);
  });

  it('includes the error label when activeError is set', () => {
    const state = makeState((s) => { s.activity.activeError = 'WHEEL STUCK'; s.activity.activeErrorCode = 2; });
    const result = MatterMappers.mapOperationalError(state);
    expect(result.errorStateLabel).toBe('WHEEL STUCK');
  });

  // ── Stuck codes ─────────────────────────────────────────────────────────

  it.each([
    [1, 'BUMPER STUCK'],
    [2, 'WHEEL STUCK'],
    [3, 'SIDE BRUSH STUCK'],
    [6, 'TRAPPED'],
    [22, 'FRONT COVER STUCK'],
    [24, 'MIDDLE BRUSH STUCK'],
    [1010, 'LEFT WHEEL OPEN CIRCUIT'],
    [1013, 'LEFT WHEEL OVERCURRENT'],
    [1020, 'RIGHT WHEEL OPEN CIRCUIT'],
    [1023, 'RIGHT WHEEL OVERCURRENT'],
    [1030, 'LEFT AND RIGHT WHEEL OPEN CIRCUIT'],
    [1033, 'LEFT AND RIGHT WHEEL OVERCURRENT'],
    [4111, 'LEFT FRONT COLLISION STUCK'],
    [4112, 'RIGHT FRONT COLLISION STUCK'],
    [4130, 'LASER SHIELD STUCK'],
    [7000, 'SMALL SPACE TIMEOUT'],
    [7001, 'PARTIALLY SUSPENDED'],
    [7002, 'ROBOT LIFTED — WHEELS SUSPENDED'],
    [7003, 'STARTUP FALL DETECTED'],
    [7004, 'ROBOT STUCK'],
    [7053, 'ROBOT TILTED'],
  ] as const)('code %i (%s) → STUCK (0x41)', (code, label) => {
    const state = makeState((s) => { s.activity.activeError = label; s.activity.activeErrorCode = code; });
    expect(MatterMappers.mapOperationalError(state).errorStateId).toBe(MatterOperationalErrorState.STUCK);
  });

  // ── DustBinMissing codes ─────────────────────────────────────────────────

  it.each([
    [5, 'DUSTBOX MISSING OR FULL'],
    [2310, 'DUSTBOX NOT INSTALLED'],
    [6111, 'DUSTBIN AIR LEAK'],
    [6112, 'DUSTBIN BLOCKED'],
    [6113, 'DUSTBAG NOT INSTALLED'],
  ] as const)('code %i (%s) → DUST_BIN_MISSING (0x42)', (code, label) => {
    const state = makeState((s) => { s.activity.activeError = label; s.activity.activeErrorCode = code; });
    expect(MatterMappers.mapOperationalError(state).errorStateId).toBe(MatterOperationalErrorState.DUST_BIN_MISSING);
  });

  // ── WaterTankEmpty codes ──────────────────────────────────────────────────

  it.each([
    [3013, 'ROBOT WATER TANK INSUFFICIENT'],
    [6011, 'CLEAN WATER TANK EMPTY'],
  ] as const)('code %i (%s) → WATER_TANK_EMPTY (0x43)', (code, label) => {
    const state = makeState((s) => { s.activity.activeError = label; s.activity.activeErrorCode = code; });
    expect(MatterMappers.mapOperationalError(state).errorStateId).toBe(MatterOperationalErrorState.WATER_TANK_EMPTY);
  });

  // ── WaterTankMissing codes ────────────────────────────────────────────────

  it.each([
    [3020, 'ROBOT WATER TANK REMOVED'],
    [6010, 'CLEAN WATER TANK NOT INSTALLED'],
    [6020, 'DIRTY WATER TANK NOT INSTALLED'],
    [6025, 'DIRTY WATER TANK FULL OR NOT INSTALLED'],
  ] as const)('code %i (%s) → WATER_TANK_MISSING (0x44)', (code, label) => {
    const state = makeState((s) => { s.activity.activeError = label; s.activity.activeErrorCode = code; });
    expect(MatterMappers.mapOperationalError(state).errorStateId).toBe(MatterOperationalErrorState.WATER_TANK_MISSING);
  });

  // ── MopCleaningPadMissing codes ───────────────────────────────────────────

  it.each([
    [3110, 'LEFT MOP NOT INSTALLED'],
    [3111, 'RIGHT MOP NOT INSTALLED'],
    [6030, 'CLEANING DISC NOT INSTALLED'],
    [6032, 'CLEANING DISC MISSING OR FULL'],
  ] as const)('code %i (%s) → MOP_CLEANING_PAD_MISSING (0x45)', (code, label) => {
    const state = makeState((s) => { s.activity.activeError = label; s.activity.activeErrorCode = code; });
    expect(MatterMappers.mapOperationalError(state).errorStateId).toBe(MatterOperationalErrorState.MOP_CLEANING_PAD_MISSING);
  });

  // ── UnableToStartOrResume codes ───────────────────────────────────────────

  it.each([
    [7010, 'ENTERED FORBIDDEN AREA'],
    [7011, 'ENTERED CARPET ZONE'],
    [7034, 'STARTING POINT NOT FOUND'],
    [7040, 'UNDOCKING FAILED'],
  ] as const)('code %i (%s) → UNABLE_TO_START_OR_RESUME (0x47)', (code, label) => {
    const state = makeState((s) => { s.activity.activeError = label; s.activity.activeErrorCode = code; });
    expect(MatterMappers.mapOperationalError(state).errorStateId).toBe(MatterOperationalErrorState.UNABLE_TO_START_OR_RESUME);
  });

  // ── FailedToFindChargingDock codes ────────────────────────────────────────

  it.each([
    [7031, 'DOCKING FAILED'],
    [7033, 'EXPLORING BASE STATION FAILED'],
    [7035, 'DOCKING FAILED — BASE NOT POWERED'],
    [7036, 'DOCKING FAILED — OMNI-WHEEL JAMMED'],
    [7037, 'DOCKING FAILED — INFRARED INTERFERENCE'],
    [7055, 'BASE STATION NOT FOUND — MOPPING SKIPPED'],
  ] as const)('code %i (%s) → FAILED_TO_FIND_CHARGING_DOCK (0x48)', (code, label) => {
    const state = makeState((s) => { s.activity.activeError = label; s.activity.activeErrorCode = code; });
    expect(MatterMappers.mapOperationalError(state).errorStateId).toBe(MatterOperationalErrorState.FAILED_TO_FIND_CHARGING_DOCK);
  });

  // ── Unknown code falls back to STUCK ──────────────────────────────────────

  it('unknown error code falls back to STUCK (0x41)', () => {
    const state = makeState((s) => { s.activity.activeError = 'Error 9999'; s.activity.activeErrorCode = 9999; });
    expect(MatterMappers.mapOperationalError(state).errorStateId).toBe(MatterOperationalErrorState.STUCK);
  });
});

// ─── getErrorStateList ───────────────────────────────────────────────────────

describe('getErrorStateList', () => {
  it('contains all seven supported error state IDs', () => {
    const list = MatterMappers.getErrorStateList();
    const ids = list.map((e) => e.errorStateId);
    expect(ids).toContain(MatterOperationalErrorState.NO_ERROR);
    expect(ids).toContain(MatterOperationalErrorState.STUCK);
    expect(ids).toContain(MatterOperationalErrorState.DUST_BIN_MISSING);
    expect(ids).toContain(MatterOperationalErrorState.WATER_TANK_EMPTY);
    expect(ids).toContain(MatterOperationalErrorState.WATER_TANK_MISSING);
    expect(ids).toContain(MatterOperationalErrorState.MOP_CLEANING_PAD_MISSING);
    expect(ids).toContain(MatterOperationalErrorState.UNABLE_TO_START_OR_RESUME);
    expect(ids).toContain(MatterOperationalErrorState.FAILED_TO_FIND_CHARGING_DOCK);
  });
});

// ─── mapRvcRunMode ──────────────────────────────────────────────────────────

describe('mapRvcRunMode', () => {
  it('maps cleaning to CLEANING', () => {
    const state = makeState((s) => { s.activity.runMode = 'cleaning'; });
    expect(MatterMappers.mapRvcRunMode(state)).toBe(MatterRvcRunMode.CLEANING);
  });

  it('maps returning to RETURNING_HOME', () => {
    const state = makeState((s) => { s.activity.runMode = 'returning'; });
    expect(MatterMappers.mapRvcRunMode(state)).toBe(MatterRvcRunMode.RETURNING_HOME);
  });

  it('maps idle to IDLE', () => {
    const state = makeState((s) => { s.activity.runMode = 'idle'; });
    expect(MatterMappers.mapRvcRunMode(state)).toBe(MatterRvcRunMode.IDLE);
  });

  it('maps error to IDLE', () => {
    const state = makeState((s) => { s.activity.runMode = 'error'; });
    expect(MatterMappers.mapRvcRunMode(state)).toBe(MatterRvcRunMode.IDLE);
  });
});

// ─── mapRvcCleanMode ────────────────────────────────────────────────────────

describe('mapRvcCleanMode', () => {
  it.each([
    ['AUTO', 0x00],
    ['VACUUM_ONLY', 0x01],
    ['MOP_ONLY', 0x02],
    ['VACUUM_AND_MOP', 0x03],
    ['SPOT_CLEAN', 0x04],
  ] as const)('%s maps to mode index %i', (mode, expected) => {
    expect(MatterMappers.mapRvcCleanMode(mode)).toBe(expected);
  });

  it('undefined falls back to AUTO (0x00)', () => {
    expect(MatterMappers.mapRvcCleanMode(undefined)).toBe(0x00);
  });
});
