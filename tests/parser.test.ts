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
});
