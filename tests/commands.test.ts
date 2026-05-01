import { describe, expect, it } from 'vitest';
import { CommandBuilder } from '../src/eufy/commands';

describe('command builder', () => {
  const codec = { encode: (_: string, payload: unknown) => JSON.stringify(payload) } as never;
  const builder = new CommandBuilder(codec);

  it('builds room selection', () => {
    expect(builder.buildRoomSelection([10])['152']).toContain('select_rooms_clean');
  });

  it('builds work mode and suction payloads', () => {
    const workModePayload = builder.buildWorkMode('VACUUM_ONLY');
    expect(workModePayload['154']).toContain('"cleanParam"');
    expect(workModePayload['154']).toContain('"value":0'); // CleanType.SWEEP_ONLY
    expect(builder.buildSuctionLevel(3)).toEqual({ clean_speed: '3' });
  });

  it('builds go-home payload using mode control command', () => {
    expect(builder.buildGoHome()['152']).toContain('"method":6');
  });
});
