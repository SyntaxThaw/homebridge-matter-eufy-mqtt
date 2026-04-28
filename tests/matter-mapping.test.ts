import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/eufy/models';
import { MatterClusterMapper } from '../src/matter/clusters';

describe('matter cluster mapping', () => {
  it('maps cleaning settings and run state', () => {
    const state = createInitialState({ deviceId: '1', model: 'T', firmware: '1' }, { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true });
    state.activity.cleanMode = 'VACUUM_AND_MOP';
    state.activity.suctionLevel = 4;
    const clusters = MatterClusterMapper.toMatterState(state) as Record<string, unknown>;
    expect(clusters.EufyCleaningSettings).toBeDefined();
  });
});
