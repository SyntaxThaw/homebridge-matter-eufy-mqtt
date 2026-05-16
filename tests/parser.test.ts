import { describe, expect, it } from 'vitest';
import { StateParser } from '../src/eufy/parser';
import { logger, makeState } from './fixtures/state';

describe('parser', () => {
  it('maps status payload fields into internal state', () => {
    const parser = new StateParser({ decode: () => ({ state: 4 }) } as never, logger as never);
    const state = makeState();
    const next = parser.processDps({ '153': 'x', clean_speed: '4', work_mode: '3', clean_param: '{"rooms":[{"id":2,"name":"Kitchen"}]}' }, state);
    expect(next.activity.runMode).toBe('cleaning');
    expect(next.activity.suctionLevel).toBe(4);
    expect(next.activity.cleanMode).toBe('MOP_ONLY');
    expect(next.activity.availableRooms[0]?.name).toBe('Kitchen');
  });

  it('DPS 168 — parses clean session duration and area', () => {
    const codec = {
      decode: (_type: string) => ({ single: { cleanDuration: 120, cleanArea: 15 } }),
    };
    const parser = new StateParser(codec as never, logger as never);
    const next = parser.processDps({ '168': 'base64data' }, makeState());
    expect(next.activity.cleanSession?.durationSeconds).toBe(120);
    expect(next.activity.cleanSession?.areaSqCm).toBe(15);
  });

  it('DPS 168 — leaves cleanSession unchanged when proto decode yields no data', () => {
    const codec = { decode: () => ({}) };
    const parser = new StateParser(codec as never, logger as never);
    const next = parser.processDps({ '168': 'base64data' }, makeState());
    expect(next.activity.cleanSession).toBeUndefined();
  });

  it('DPS 177 — active error code sets activeError and switches runMode to error', () => {
    // Error code 17 = 'BATTERY LOW'
    const codec = { decode: () => ({ error: [17] }) };
    const parser = new StateParser(codec as never, logger as never);
    const next = parser.processDps({ '177': 'base64data' }, makeState());
    expect(next.activity.activeError).toBe('BATTERY LOW');
    expect(next.activity.runMode).toBe('error');
  });

  it('DPS 177 — error code 0 clears activeError', () => {
    const codec = { decode: () => ({ error: [0] }) };
    const parser = new StateParser(codec as never, logger as never);
    const next = parser.processDps({ '177': 'base64data' }, makeState());
    expect(next.activity.activeError).toBeUndefined();
  });

  it('DPS 177 — unknown error code falls back to generic label', () => {
    const codec = { decode: () => ({ error: [999] }) };
    const parser = new StateParser(codec as never, logger as never);
    const next = parser.processDps({ '177': 'base64data' }, makeState());
    expect(next.activity.activeError).toBe('Error 999');
  });

  it('DPS 173 — nested station.washingDryingSystem (real proto layout) flips runMode to idle', () => {
    // proto.cloud.WorkStatus.Station lives at field 14 of WorkStatus, so the
    // decoded shape is { station: { washingDryingSystem: { state: 1 } } } —
    // not the previously assumed top-level layout. Asserting on the nested
    // shape so the parser regression that left Apple Home stuck on
    // "Cleaning" (X10 Pro Omni, mop drying on dock) cannot reappear.
    const codec = {
      decode: () => ({ station: { washingDryingSystem: { state: 1 } } }),
    };
    const parser = new StateParser(codec as never, logger as never);
    const state = makeState((s) => { s.activity.runMode = 'cleaning'; s.activity.paused = false; });
    const next = parser.processDps({ '173': 'base64data' }, state);
    expect(next.activity.runMode).toBe('idle');
    expect(next.activity.paused).toBe(false);
    expect(next.power.docked).toBe(true);
    expect(next.power.charging).toBe(false);
  });

  it('DPS 173 — legacy top-level station fields still flip runMode to idle', () => {
    // Some payloads observed in the wild place the station fields at the
    // top level; keep that path working so we don't regress older devices.
    const codec = {
      decode: () => ({ washingDryingSystem: { state: 1 } }),
    };
    const parser = new StateParser(codec as never, logger as never);
    const state = makeState((s) => { s.activity.runMode = 'cleaning'; s.activity.paused = false; });
    const next = parser.processDps({ '173': 'base64data' }, state);
    expect(next.activity.runMode).toBe('idle');
    expect(next.power.docked).toBe(true);
  });

  it('DPS 173 — no station activity leaves runMode unchanged', () => {
    const codec = { decode: () => ({}) };
    const parser = new StateParser(codec as never, logger as never);
    const state = makeState((s) => { s.activity.runMode = 'cleaning'; });
    const next = parser.processDps({ '173': 'base64data' }, state);
    expect(next.activity.runMode).toBe('cleaning');
  });
});

// ─── robustness / fuzz ──────────────────────────────────────────────────────

describe('processDps robustness', () => {
  const noopCodec = { decode: () => ({}) };

  it('does not throw on empty DPS object', () => {
    const parser = new StateParser(noopCodec as never, logger as never);
    expect(() => parser.processDps({}, makeState())).not.toThrow();
  });

  it('does not throw on unknown DPS keys', () => {
    const parser = new StateParser(noopCodec as never, logger as never);
    expect(() => parser.processDps({ '999': 'x', '12345': '' }, makeState())).not.toThrow();
  });

  it('does not throw on oversized string value', () => {
    const parser = new StateParser(noopCodec as never, logger as never);
    expect(() => parser.processDps({ '153': 'x'.repeat(100_000) }, makeState())).not.toThrow();
  });

  it('does not throw when codec.decode throws', () => {
    const badCodec = { decode: () => { throw new Error('proto decode error'); } };
    const parser = new StateParser(badCodec as never, logger as never);
    expect(() => parser.processDps({ '168': 'base64data' }, makeState())).not.toThrow();
  });

  it('returns a valid NormalizedState on arbitrary input', () => {
    const parser = new StateParser(noopCodec as never, logger as never);
    const result = parser.processDps(
      { '153': '', clean_speed: 'bad', work_mode: '-1', '177': 'x', '168': 'x', '173': 'x' },
      makeState(),
    );
    expect(result).toHaveProperty('activity');
    expect(result).toHaveProperty('power');
  });
});
