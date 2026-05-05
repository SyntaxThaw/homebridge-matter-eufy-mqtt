import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/eufy/models';
import { MatterClusterMapper } from '../src/matter/clusters';

describe('matter cluster mapping', () => {
  it('maps standard Matter clean mode and service area clusters', () => {
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true });
    state.activity.cleanMode = 'VACUUM_AND_MOP';
    state.activity.suctionLevel = 4;
    state.activity.availableRooms = [
      { id: '1', name: 'Kitchen' },
      { id: '2', name: 'Living Room' },
    ];
    state.activity.selectedRooms = ['2'];

    const clusters = MatterClusterMapper.toMatterState(state) as Record<string, unknown>;
    expect(clusters.RvcCleanMode).toBeDefined();
    expect(clusters.ServiceArea).toBeDefined();
    expect(clusters.EufyCleaningSettings).toBeUndefined();

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
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true, supportsEmptyBin: false });
    // availableRooms is [] from createInitialState — exactly the registration-time scenario.
    const clusters = MatterClusterMapper.toMatterState(state) as Record<string, unknown>;

    expect(clusters.ServiceArea).toBeUndefined();
    expect(clusters.RvcRunMode).toBeDefined();
    expect(clusters.RvcOperationalState).toBeDefined();
    expect(clusters.PowerSource).toBeDefined();
    expect(MatterClusterMapper.buildServiceArea(state)).toBeUndefined();
  });

  it('drops selectedAreas that do not match any supportedArea id', () => {
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true, supportsEmptyBin: false });
    state.activity.availableRooms = [{ id: '1', name: 'Kitchen' }];
    state.activity.selectedRooms = ['1', '99', 'not-a-number'];

    const sa = MatterClusterMapper.buildServiceArea(state);
    expect(sa).toBeDefined();
    expect(sa!.selectedAreas).toEqual([1]);
  });

  it('synthesizes a name when room.name is blank', () => {
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true, supportsEmptyBin: false });
    state.activity.availableRooms = [{ id: '7', name: '   ' }];

    const sa = MatterClusterMapper.buildServiceArea(state)!;
    expect(sa.supportedAreas[0]?.areaInfo.locationInfo?.locationName).toBe('Room 7');
  });
});
