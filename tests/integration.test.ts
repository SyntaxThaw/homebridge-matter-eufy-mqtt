/**
 * Integration test: full data pipeline from DPS payload → StateParser →
 * NormalizedState → MatterClusterMapper → Matter cluster attributes.
 *
 * All I/O (MQTT, cloud HTTP) is mocked; only the pure transformation layer
 * is exercised here. This catches regressions where a parser or mapper change
 * silently breaks the end-to-end cluster values.
 */
import { describe, expect, it } from 'vitest';
import { StateParser } from '../src/eufy/parser';
import { MatterClusterMapper } from '../src/matter/clusters';
import { MatterMappers, MatterOperationalState, MatterRvcCleanMode } from '../src/matter/mappers';
import { logger, makeState } from './fixtures/state';

/** Minimal codec stub that returns canned decoded values per proto type name. */
function makeCodec(overrides: Record<string, unknown> = {}) {
  return {
    decode: (typeName: string): unknown => {
      if (typeName in overrides) return overrides[typeName];
      if (typeName === 'WorkStatus') return { state: 5 }; // CLEANING
      if (typeName === 'ErrorCode') return { error: [] };
      if (typeName.includes('CleanParamResponse')) return {};
      if (typeName.includes('UniversalDataResponse')) return {};
      if (typeName.includes('CleanStatistics')) return {};
      if (typeName.includes('ConsumableResponse')) return {};
      return {};
    },
  };
}

describe('DPS → NormalizedState → Matter clusters (integration)', () => {
  it('maps CLEANING state to Matter RUNNING + CLEANING run mode', () => {
    const codec = makeCodec({ WorkStatus: { state: 5 } }); // CLEANING
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();

    const state = parser.processDps({ '153': 'AAAA', '163': '75' }, initial);

    expect(state.activity.runMode).toBe('cleaning');
    expect(state.power.batteryPercent).toBe(75);

    const opState = MatterMappers.mapOperationalState(state);
    expect(opState).toBe(MatterOperationalState.RUNNING);
  });

  it('maps CHARGING state (docked, charging) to IS_CHARGING + CHARGING (A2)', () => {
    const codec = makeCodec({ WorkStatus: { state: 3, charging: { state: 0 } } }); // CHARGING DOING
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();

    const state = parser.processDps({ '153': 'AAAA', '163': '90' }, initial);

    expect(state.activity.runMode).toBe('idle');
    expect(state.power.docked).toBe(true);
    expect(state.power.charging).toBe(true);
    expect(MatterMappers.mapChargeState(state.power)).toBe(3); // IS_CHARGING
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.CHARGING);
  });

  it('maps fully-charged state (docked, not charging) to IS_AT_MAX_CHARGE', () => {
    const codec = makeCodec({ WorkStatus: { state: 3, charging: { state: 1 } } }); // CHARGING DONE
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();

    const state = parser.processDps({ '153': 'AAAA' }, initial);

    expect(state.power.docked).toBe(true);
    expect(state.power.charging).toBe(false);
    expect(MatterMappers.mapChargeState(state.power)).toBe(2); // IS_AT_MAX_CHARGE
  });

  it('maps PAUSED cleaning state to Matter PAUSED', () => {
    const codec = makeCodec({ WorkStatus: { state: 5, cleaning: { state: 1 } } }); // CLEANING PAUSED
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();

    const state = parser.processDps({ '153': 'AAAA' }, initial);

    expect(state.activity.paused).toBe(true);
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.PAUSED);
  });

  it('maps STANDBY (0) while cleaning → paused without changing runMode', () => {
    const codec = makeCodec({ WorkStatus: { state: 0 } }); // STANDBY
    const parser = new StateParser(codec as never, logger as never);

    // Start in cleaning state
    const initial = makeState((s) => { s.activity.runMode = 'cleaning'; s.activity.paused = false; });

    const state = parser.processDps({ '153': 'AAAA' }, initial);

    expect(state.activity.runMode).toBe('cleaning');
    expect(state.activity.paused).toBe(true);
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.PAUSED);
  });

  it('maps error state to Matter ERROR with error label', () => {
    const codec = makeCodec({ ErrorCode: { error: [2] }, WorkStatus: { state: 2 } }); // FAULT
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();

    const state = parser.processDps({ '153': 'AAAA', '177': 'BBBB' }, initial);

    expect(state.activity.runMode).toBe('error');
    expect(state.activity.activeError).toBe('WHEEL STUCK');
    expect(MatterMappers.mapOperationalState(state)).toBe(MatterOperationalState.ERROR);
  });

  it('maps SPOT_CLEAN mode to Matter RvcCleanMode 0x04', () => {
    const codec = makeCodec({ WorkStatus: { state: 5 } });
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();

    // Directly set SPOT_CLEAN (arrives via clean mode command, not DPS parse)
    const state = parser.processDps({ '153': 'AAAA' }, initial);
    state.activity.cleanMode = 'SPOT_CLEAN';

    expect(MatterMappers.mapRvcCleanMode('SPOT_CLEAN')).toBe(MatterRvcCleanMode.SPOT_CLEAN);
    expect(MatterRvcCleanMode.SPOT_CLEAN).toBe(0x04);
  });

  it('emits ServiceArea supportedAreas with room names when rooms are known', () => {
    const codec = makeCodec({ WorkStatus: { state: 3 } });
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState((s) => {
      s.activity.availableRooms = [
        { id: '1', name: 'Kitchen' },
        { id: '2', name: 'Living Room' },
      ];
      s.activity.currentMapId = 42;
    });

    const state = parser.processDps({ '153': 'AAAA' }, initial);
    const clusters = MatterClusterMapper.toMatterState(state) as Record<string, unknown>;
    const sa = clusters['ServiceArea'] as {
      supportedAreas: Array<{ areaId: number; mapId: null; areaInfo: { locationInfo: { locationName: string } } }>;
    };

    expect(sa.supportedAreas).toHaveLength(2);
    expect(sa.supportedAreas[0]?.areaId).toBe(1);
    expect(sa.supportedAreas[0]?.mapId).toBeNull();
    expect(sa.supportedAreas[0]?.areaInfo.locationInfo.locationName).toBe('Kitchen');
  });

  it('area IDs above 0 use the numeric room ID; non-numeric IDs get 0x10000 offset', () => {
    const initial = makeState((s) => {
      s.activity.availableRooms = [
        { id: '5', name: 'Bedroom' },
        { id: 'special', name: 'Garage' },
      ];
      s.activity.currentMapId = 1;
    });

    const clusters = MatterClusterMapper.toMatterState(initial) as Record<string, unknown>;
    const sa = clusters['ServiceArea'] as { supportedAreas: Array<{ areaId: number }> };

    expect(sa.supportedAreas[0]?.areaId).toBe(5);
    expect(sa.supportedAreas[1]?.areaId).toBe(0x10000 + 1); // 0x10001 (index 1)
  });

  it('battery 0-100 maps linearly to Matter 0-200 BatPercentRemaining', () => {
    expect(MatterMappers.mapBatteryLevel(0)).toBe(0);
    expect(MatterMappers.mapBatteryLevel(50)).toBe(100);
    expect(MatterMappers.mapBatteryLevel(100)).toBe(200);
    expect(MatterMappers.mapBatteryLevel(110)).toBe(200); // clamped
  });

  it('suction level 5 (MAX_PLUS) round-trips through DPS 158 parse', () => {
    const codec = makeCodec({});
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();

    // DPS 158 value "4" = index 4 = MAX_PLUS = level 5
    const state = parser.processDps({ '158': '4' }, initial);
    expect(state.activity.suctionLevel).toBe(5);
  });

  it('standard 4-digit error codes are mapped to human-readable labels', () => {
    const codec = makeCodec({ ErrorCode: { error: [7004] } }); // ROBOT STUCK
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();

    const state = parser.processDps({ '177': 'AAAA' }, initial);
    expect(state.activity.activeError).toBe('ROBOT STUCK');
  });

  it('mop level LOW is parsed from DPS 154 CleanParamResponse', () => {
    const codec = makeCodec({
      'proto.cloud.CleanParamResponse': { cleanParam: { mopMode: { level: 0 } } },
    });
    const parser = new StateParser(codec as never, logger as never);
    const initial = makeState();

    const state = parser.processDps({ '154': 'AAAA' }, initial);
    expect(state.activity.mopLevel).toBe('LOW');
  });
});
