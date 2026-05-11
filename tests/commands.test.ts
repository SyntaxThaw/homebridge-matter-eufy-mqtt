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

  it('buildWorkMode also sets areaCleanParam so room cleans honour the chosen mode', () => {
    // Regression: room/area cleans consult area_clean_param (field 2 of
    // CleanParamRequest). Setting only clean_param leaves the persisted area
    // mode untouched, so START_SELECT_ROOMS_CLEAN would silently fall back to
    // the previous area mode (commonly VACUUM_AND_MOP) — the X10 Pro Omni
    // kept mopping after the user picked Vacuum Only.
    const payload = builder.buildWorkMode('VACUUM_ONLY');
    expect(payload['154']).toContain('"areaCleanParam"');
    const parsed = JSON.parse(payload['154'] as string);
    expect(parsed.areaCleanParam.cleanType.value).toBe(0);
    expect(parsed.cleanParam.cleanType.value).toBe(0);
  });

  it('builds go-home payload using mode control command', () => {
    expect(builder.buildGoHome()['152']).toContain('"method":6');
  });
});
