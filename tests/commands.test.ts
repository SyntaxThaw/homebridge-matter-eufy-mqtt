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

  it('buildRoomSelection defaults to GENERAL mode and omits the releases field', () => {
    // Regression: we used to hardcode releases=1, which the X10 Pro Omni
    // appears to interpret as a stale map revision. jeppesens/eufy-clean
    // leaves it at the proto default (0/absent) and that path works.
    const payload = builder.buildRoomSelection([3], 10);
    const decoded = JSON.parse(payload['152'] as string);
    expect(decoded.selectRoomsClean.mode).toBeFalsy();  // GENERAL=0
    expect(decoded.selectRoomsClean.releases).toBeUndefined();
  });

  it('buildRoomSelection uses CUSTOMIZE mode when caller asks for it', () => {
    // CUSTOMIZE (1) is only correct AFTER a SET_ROOMS_CUSTOM has been pushed
    // for the same rooms — see handlers.handleStartCommand for the wiring.
    const payload = builder.buildRoomSelection([3], 10, true);
    const decoded = JSON.parse(payload['152'] as string);
    expect(decoded.selectRoomsClean.mode).toBe(1);  // CUSTOMIZE=1
  });

  it('buildMopLevel encodes LOW/MIDDLE/HIGH as 0/1/2 via DPS 154', () => {
    const low = builder.buildMopLevel('LOW');
    expect(low['154']).toContain('"mopMode"');
    expect(JSON.parse(low['154'] as string).cleanParam.mopMode.level).toBe(0);

    const mid = builder.buildMopLevel('MIDDLE');
    expect(JSON.parse(mid['154'] as string).cleanParam.mopMode.level).toBe(1);

    const high = builder.buildMopLevel('HIGH');
    expect(JSON.parse(high['154'] as string).cleanParam.mopMode.level).toBe(2);
  });

  it('buildSetRoomCustom emits a MapEditRequest on DPS 170 with per-room clean type', () => {
    // Regression: the X10 Pro Omni stores per-room clean mode on the map and
    // ignores the global DPS 154 clean_param for room cleans. The plugin has
    // to push a MapEditRequest with method=SET_ROOMS_CUSTOM (=5) carrying the
    // chosen clean_type for each selected room, otherwise picking Vacuum Only
    // in Apple Home still triggers Vacuum + Mop on the floor. See
    // jeppesens/eufy-clean build_set_room_custom_command for the same shape.
    const payload = builder.buildSetRoomCustom([3, 7], 'VACUUM_ONLY', 10);
    expect(Object.keys(payload)).toEqual(['170']);
    const decoded = JSON.parse(payload['170'] as string);
    expect(decoded.method).toBe(5);
    expect(decoded.mapId).toBe(10);
    expect(decoded.roomsCustom.roomsParm.rooms).toEqual([
      { id: 3, custom: { cleanType: { value: 0 } } },  // SWEEP_ONLY
      { id: 7, custom: { cleanType: { value: 0 } } },
    ]);
  });
});
