import { describe, expect, it } from 'vitest';
import { StateParser } from '../src/eufy/parser';
import { createInitialState } from '../src/eufy/models';

const logger = { debug() {}, error() {}, info() {}, warn() {} } as const;

describe('parser', () => {
  it('maps status payload fields into internal state', () => {
    const parser = new StateParser({ decode: () => ({ state: 4 }) } as never, logger as never);
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true });
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
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true });
    const next = parser.processDps({ '168': 'base64data' }, state);
    expect(next.activity.cleanSession?.durationSeconds).toBe(120);
    expect(next.activity.cleanSession?.areaSqCm).toBe(15);
  });

  it('DPS 168 — leaves cleanSession unchanged when proto decode yields no data', () => {
    const codec = { decode: () => ({}) };
    const parser = new StateParser(codec as never, logger as never);
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true });
    const next = parser.processDps({ '168': 'base64data' }, state);
    expect(next.activity.cleanSession).toBeUndefined();
  });

  it('DPS 177 — active error code sets activeError and switches runMode to error', () => {
    // Error code 17 = 'BATTERY LOW'
    const codec = { decode: () => ({ error: [17] }) };
    const parser = new StateParser(codec as never, logger as never);
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true });
    const next = parser.processDps({ '177': 'base64data' }, state);
    expect(next.activity.activeError).toBe('BATTERY LOW');
    expect(next.activity.runMode).toBe('error');
  });

  it('DPS 177 — error code 0 clears activeError', () => {
    const codec = { decode: () => ({ error: [0] }) };
    const parser = new StateParser(codec as never, logger as never);
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true });
    const next = parser.processDps({ '177': 'base64data' }, state);
    expect(next.activity.activeError).toBeUndefined();
  });

  it('DPS 177 — unknown error code falls back to generic label', () => {
    const codec = { decode: () => ({ error: [999] }) };
    const parser = new StateParser(codec as never, logger as never);
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true });
    const next = parser.processDps({ '177': 'base64data' }, state);
    expect(next.activity.activeError).toBe('Error 999');
  });

  it('DPS 173 — station activity sets runMode to idle and docked=true', () => {
    const codec = {
      decode: () => ({ washingDryingSystem: { state: 1 } }), // 1 = DRYING
    };
    const parser = new StateParser(codec as never, logger as never);
    const state = createInitialState(
      { deviceId: '1', model: 'T', firmware: '1' },
      { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true },
    );
    // Simulate robot appearing to be cleaning before DPS 173 arrives
    state.activity.runMode = 'cleaning';
    state.activity.paused = false;
    const next = parser.processDps({ '173': 'base64data' }, state);
    expect(next.activity.runMode).toBe('idle');
    expect(next.activity.paused).toBe(false);
    expect(next.power.docked).toBe(true);
    expect(next.power.charging).toBe(false);
  });

  it('DPS 173 — no station activity leaves runMode unchanged', () => {
    const codec = {
      decode: () => ({}), // no station fields
    };
    const parser = new StateParser(codec as never, logger as never);
    const state = createInitialState(
      { deviceId: '1', model: 'T', firmware: '1' },
      { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true },
    );
    state.activity.runMode = 'cleaning';
    const next = parser.processDps({ '173': 'base64data' }, state);
    expect(next.activity.runMode).toBe('cleaning');
  });
});
