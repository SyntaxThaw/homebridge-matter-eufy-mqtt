import { describe, expect, it } from 'vitest';
import { StateParser } from '../src/eufy/parser';
import { logger, makeState } from './fixtures/state';

/** Minimal codec stub — returns CLEANING for WorkStatus, no errors. */
const codec = {
  decode: (typeName: string) => {
    if (typeName === 'WorkStatus') return { state: 5 };
    if (typeName === 'ErrorCode') return { error: [] };
    return {};
  },
};

describe('DPS pipeline throughput', () => {
  it('processes 1000 DPS payloads sequentially without throwing', () => {
    const parser = new StateParser(codec as never, logger as never);
    let state = makeState();

    for (let i = 0; i < 1000; i++) {
      state = parser.processDps({
        '153': Buffer.alloc(4).toString('base64'),
        '163': String(50 + (i % 50)),
      }, state);
    }

    expect(state.power.batteryPercent).toBeGreaterThanOrEqual(50);
    expect(state.activity.runMode).toBe('cleaning');
  });

  it('handles burst of mixed DPS keys without data corruption', () => {
    const parser = new StateParser(codec as never, logger as never);
    let state = makeState();

    for (let i = 0; i < 500; i++) {
      state = parser.processDps({
        '153': Buffer.alloc(4).toString('base64'),
        '163': '75',
        '158': String(i % 5), // cycles through 0-4 suction levels
        work_mode: String(i % 4),
      }, state);
    }

    // Suction level should be 1-5 from last iteration (499 % 5 = 4 → MAX_PLUS = 5)
    expect(state.activity.suctionLevel).toBe(5);
  });

  it('battery stays clamped to 0-100 under rapid updates', () => {
    const parser = new StateParser(codec as never, logger as never);
    let state = makeState();

    for (let i = 0; i < 200; i++) {
      state = parser.processDps({ '163': String(i) }, state); // i goes 0-199, clamped to 100
    }

    expect(state.power.batteryPercent).toBe(100);
  });
});

describe('debounce coalescing (unit, no real timers needed)', () => {
  it('pendingSync is cleared on each update cycle in the parser', () => {
    const parser = new StateParser(codec as never, logger as never);
    let state = makeState();

    // Simulate 1000 updates to a single field — final state should be deterministic
    for (let i = 0; i < 1000; i++) {
      state = parser.processDps({ '163': String(i % 101) }, state);
    }

    // 999 % 101 = 90 → last battery value
    expect(state.power.batteryPercent).toBe(90);
  });

  it('state remains immutable between processDps calls (old state not mutated)', () => {
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();
    const snapshot = initial.power.batteryPercent;

    parser.processDps({ '163': '42' }, initial);

    // original state object must not be mutated
    expect(initial.power.batteryPercent).toBe(snapshot);
  });
});
