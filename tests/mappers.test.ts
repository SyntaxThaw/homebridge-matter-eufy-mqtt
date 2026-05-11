import { describe, expect, it } from 'vitest';
import {
  MatterChargeState,
  MatterMappers,
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
  it('maps idle runMode to STOPPED', () => {
    const state = makeState((s) => { s.activity.runMode = 'idle'; });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.STOPPED);
  });

  it('maps cleaning runMode to RUNNING', () => {
    const state = makeState((s) => { s.activity.runMode = 'cleaning'; });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.RUNNING);
  });

  it('maps returning runMode to RUNNING', () => {
    const state = makeState((s) => { s.activity.runMode = 'returning'; });
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.RUNNING);
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

// ─── mapOperationalError ────────────────────────────────────────────────────

describe('mapOperationalError', () => {
  it('returns NO_ERROR (0x00) when no activeError', () => {
    const state = makeState();
    const result = MatterMappers.mapOperationalError(state);
    expect(result.errorStateId).toBe(0x00);
  });

  it('returns STUCK (0x41) when activeError is set', () => {
    const state = makeState((s) => { s.activity.activeError = 'STUCK'; });
    const result = MatterMappers.mapOperationalError(state);
    expect(result.errorStateId).toBe(0x41);
  });

  it('includes a non-empty label when activeError is set', () => {
    const state = makeState((s) => { s.activity.activeError = 'STUCK'; });
    const result = MatterMappers.mapOperationalError(state);
    expect(result.errorStateLabel).toBeTruthy();
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
