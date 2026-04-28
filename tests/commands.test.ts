import { describe, expect, it } from 'vitest';
import { CommandBuilder } from '../src/eufy/commands';

describe('command builder', () => {
  const codec = { encode: (_: string, payload: unknown) => JSON.stringify(payload) } as never;
  const builder = new CommandBuilder(codec);

  it('builds room selection', () => {
    expect(builder.buildRoomSelection([10])['152']).toContain('select_rooms_clean');
  });

  it('builds work mode and suction payloads', () => {
    expect(builder.buildWorkMode('VACUUM_ONLY')).toEqual({ work_mode: '1' });
    expect(builder.buildSuctionLevel(3)).toEqual({ clean_speed: '3' });
  });
});
