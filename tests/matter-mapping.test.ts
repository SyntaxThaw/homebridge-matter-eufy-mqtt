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
});
