import { describe, expect, it } from 'vitest';
import { makeState } from './fixtures/state';
import { MatterClusterMapper } from '../src/matter/clusters';
import { MatterMappers, MatterRvcCleanMode, MatterRvcCleanModeTag } from '../src/matter/mappers';

describe('EufyCleaningSettings mappers (B1/B2)', () => {
  it('EufyCleaningSettings is absent from toMatterState (not pushed until Homebridge supports custom clusters)', () => {
    const state = makeState((s) => { s.activity.suctionLevel = 3; s.activity.mopLevel = 'HIGH'; });
    const clusters = MatterClusterMapper.toMatterState(state) as Record<string, unknown>;
    expect(clusters.EufyCleaningSettings).toBeUndefined();
  });

  it('EufyCleanSessionData is absent from toMatterState (not pushed until Homebridge supports custom clusters)', () => {
    const state = makeState((s) => { s.activity.cleanSession = { durationSeconds: 120, areaSqCm: 15 }; });
    const clusters = MatterClusterMapper.toMatterState(state) as Record<string, unknown>;
    expect(clusters.EufyCleanSessionData).toBeUndefined();
  });

  it('EufyConsumables is absent from toMatterState (not pushed until Homebridge supports custom clusters)', () => {
    const state = makeState((s) => { s.activity.consumables = { sideBrushHours: 5 }; });
    const clusters = MatterClusterMapper.toMatterState(state) as Record<string, unknown>;
    expect(clusters.EufyConsumables).toBeUndefined();
  });

  it('mapMopLevel converts LOW/MIDDLE/HIGH to 0/1/2', () => {
    expect(MatterMappers.mapMopLevel('LOW')).toBe(0);
    expect(MatterMappers.mapMopLevel('MIDDLE')).toBe(1);
    expect(MatterMappers.mapMopLevel('HIGH')).toBe(2);
  });

  it('mapMopLevelFromNumber round-trips all valid values', () => {
    expect(MatterMappers.mapMopLevelFromNumber(0)).toBe('LOW');
    expect(MatterMappers.mapMopLevelFromNumber(1)).toBe('MIDDLE');
    expect(MatterMappers.mapMopLevelFromNumber(2)).toBe('HIGH');
  });

  it('mapMopLevelFromNumber defaults unknown values to MIDDLE', () => {
    expect(MatterMappers.mapMopLevelFromNumber(99)).toBe('MIDDLE');
  });
});

describe('matter cluster mapping', () => {
  it('maps standard Matter clean mode and service area clusters', () => {
    const state = makeState((s) => {
      s.activity.cleanMode = 'VACUUM_AND_MOP';
      s.activity.suctionLevel = 4;
      s.activity.availableRooms = [
        { id: '1', name: 'Kitchen' },
        { id: '2', name: 'Living Room' },
      ];
      s.activity.selectedRooms = ['2'];
    });

    const clusters = MatterClusterMapper.toMatterState(state) as Record<string, unknown>;
    expect(clusters.RvcCleanMode).toBeDefined();
    expect(clusters.ServiceArea).toBeDefined();
    expect(clusters.EufyCleaningSettings).toBeUndefined(); // not pushed until Homebridge supports custom clusters

    const cleanMode = clusters.RvcCleanMode as { currentMode?: number };
    const serviceArea = clusters.ServiceArea as {
      supportedAreas?: Array<{ areaId: number; mapId: null; areaInfo: { locationInfo: { locationName: string; floorNumber: null; areaType: null } | null; landmarkInfo: null } }>;
      selectedAreas?: number[];
    };

    expect(cleanMode.currentMode).toBe(3);
    expect(serviceArea.supportedAreas).toEqual([
      { areaId: 1, mapId: null, areaInfo: { locationInfo: { locationName: 'Kitchen', floorNumber: null, areaType: null }, landmarkInfo: null } },
      { areaId: 2, mapId: null, areaInfo: { locationInfo: { locationName: 'Living Room', floorNumber: null, areaType: null }, landmarkInfo: null } },
    ]);
    expect(serviceArea.selectedAreas).toEqual([2]);
  });

  it('omits ServiceArea entirely when no rooms are known (prevents ServiceAreaServer crash)', () => {
    // availableRooms is [] from makeState — exactly the registration-time scenario.
    const state = makeState();
    const clusters = MatterClusterMapper.toMatterState(state) as Record<string, unknown>;

    expect(clusters.ServiceArea).toBeUndefined();
    expect(clusters.RvcRunMode).toBeDefined();
    expect(clusters.RvcOperationalState).toBeDefined();
    expect(clusters.PowerSource).toBeDefined();
    expect(MatterClusterMapper.buildServiceArea(state)).toBeUndefined();
  });

  it('drops selectedAreas that do not match any supportedArea id', () => {
    const state = makeState((s) => {
      s.activity.availableRooms = [{ id: '1', name: 'Kitchen' }];
      s.activity.selectedRooms = ['1', '99', 'not-a-number'];
    });

    const sa = MatterClusterMapper.buildServiceArea(state);
    expect(sa).toBeDefined();
    expect(sa!.selectedAreas).toEqual([1]);
  });

  it('synthesizes a name when room.name is blank', () => {
    const state = makeState((s) => { s.activity.availableRooms = [{ id: '7', name: '   ' }]; });

    const sa = MatterClusterMapper.buildServiceArea(state)!;
    expect(sa.supportedAreas[0]?.areaInfo.locationInfo?.locationName).toBe('Room 7');
  });

  it('buildServiceArea produces one area per room with correct id and name mapping', () => {
    const state = makeState((s) => {
      s.activity.availableRooms = [
        { id: '10', name: 'Bedroom' },
        { id: '20', name: 'Kitchen' },
      ];
      s.activity.selectedRooms = ['10'];
    });

    const sa = MatterClusterMapper.buildServiceArea(state)!;
    expect(sa.supportedAreas).toHaveLength(2);
    expect(sa.supportedAreas[0]!.areaId).toBe(10);
    expect(sa.supportedAreas[0]!.areaInfo.locationInfo?.locationName).toBe('Bedroom');
    expect(sa.supportedAreas[1]!.areaId).toBe(20);
    expect(sa.selectedAreas).toEqual([10]);
  });

  it('Vacuum / Mop / VacuumThenMop tags each appear on exactly one supported mode', () => {
    // Apple Home picks the first mode that carries a matching tag when the
    // user selects "vacuum only" / "mop only" in an automation or room-clean
    // action. If two modes shared the Vacuum tag, the controller would route
    // the user's "vacuum only" intent to whichever appears first — historically
    // 'Auto', which maps to SWEEP_AND_MOP on the device. Keep tags unique.
    const modes = MatterMappers.getSupportedCleanModes();
    const tagCounts = new Map<number, number>();
    for (const mode of modes) {
      for (const tag of mode.modeTags) {
        tagCounts.set(tag.value, (tagCounts.get(tag.value) ?? 0) + 1);
      }
    }

    expect(tagCounts.get(MatterRvcCleanModeTag.VACUUM)).toBe(1);
    expect(tagCounts.get(MatterRvcCleanModeTag.MOP)).toBe(1);
    expect(tagCounts.get(MatterRvcCleanModeTag.VACUUM_THEN_MOP)).toBe(1);
    // DEEP_CLEAN must NOT be advertised: no Eufy mode is a deep clean, and
    // Spot Clean previously misused this tag (C1, #111).
    expect(tagCounts.get(MatterRvcCleanModeTag.DEEP_CLEAN) ?? 0).toBe(0);

    // Specifically: the Vacuum tag must land on VACUUM_ONLY, not Auto.
    const vacuumTaggedMode = modes.find((m) =>
      m.modeTags.some((t) => t.value === MatterRvcCleanModeTag.VACUUM),
    );
    expect(vacuumTaggedMode?.mode).toBe(MatterRvcCleanMode.VACUUM_ONLY);
  });

  it('each clean mode maps to a distinct Matter RvcCleanMode value', () => {
    const vacuum = MatterMappers.mapRvcCleanMode('VACUUM_ONLY');
    const mop = MatterMappers.mapRvcCleanMode('MOP_ONLY');
    const both = MatterMappers.mapRvcCleanMode('VACUUM_AND_MOP');
    const auto = MatterMappers.mapRvcCleanMode('AUTO');

    expect(vacuum).not.toBe(both);
    expect(mop).not.toBe(both);
    expect(vacuum).not.toBe(mop);
    expect(auto).not.toBe(vacuum);
    // Specific values per MatterRvcCleanMode enum
    expect(auto).toBe(0x00);
    expect(vacuum).toBe(0x01);
    expect(mop).toBe(0x02);
    expect(both).toBe(0x03);
  });
});
