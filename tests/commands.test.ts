import { describe, expect, it } from 'vitest';
import { CommandBuilder } from '../src/eufy/commands';

describe('command builder', () => {
  const codec = { encode: (_: string, payload: unknown) => JSON.stringify(payload) } as never;
  const builder = new CommandBuilder(codec);

  it('builds room selection', () => {
    expect(builder.buildRoomSelection([10])['152']).toContain('selectRoomsClean');
  });

  it('builds work mode and suction payloads', () => {
    const workModePayload = builder.buildWorkMode('VACUUM_ONLY');
    expect(workModePayload['154']).toContain('"cleanParam"');
    expect(workModePayload['154']).toContain('"value":0'); // CleanType.SWEEP_ONLY
    // suction level 3 (TURBO) → fan.suction index 2
    const suctionPayload = builder.buildSuctionLevel(3);
    expect(suctionPayload['154']).toContain('"fan"');
    expect(suctionPayload['154']).toContain('"suction":2');
    // Level 5 (MAX_PLUS) → fan.suction index 4
    const maxPlusPayload = builder.buildSuctionLevel(5);
    expect(maxPlusPayload['154']).toContain('"suction":4');
  });

  it('builds go-home payload using mode control command', () => {
    expect(builder.buildGoHome()['152']).toContain('"method":6');
  });
});
