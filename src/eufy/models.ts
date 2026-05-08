export interface Identity {
  deviceId: string;
  model: string;
  firmware: string;
}

export interface Connectivity {
  online: boolean;
}

export interface Power {
  batteryPercent: number;
  charging: boolean;
  docked: boolean;
}

export type RunMode = 'idle' | 'cleaning' | 'returning' | 'error';
export type CleaningMode = 'AUTO' | 'VACUUM_ONLY' | 'MOP_ONLY' | 'VACUUM_AND_MOP' | 'SPOT_CLEAN';
/** 1=QUIET, 2=STANDARD, 3=TURBO, 4=MAX, 5=MAX_PLUS */
export type SuctionLevel = 1 | 2 | 3 | 4 | 5;
export type MopLevel = 'LOW' | 'MIDDLE' | 'HIGH';

export interface RoomInfo {
  id: string;
  name: string;
}

/** Usage hours for robot consumables; undefined means not yet reported by device. */
export interface ConsumableData {
  sideBrushHours?: number;
  rollingBrushHours?: number;
  filterMeshHours?: number;
  mopHours?: number;
  dustbagHours?: number;
  dirtyWaterFilterHours?: number;
}

/** Area and duration for the current (or last) cleaning session. */
export interface CleanSession {
  durationSeconds: number;
  /** Area in square decimetres (dm²) as reported by the device. */
  areaSqCm: number;
}

export interface Activity {
  runMode: RunMode;
  paused: boolean;
  activeError: string | undefined;
  cleanMode: CleaningMode;
  suctionLevel: SuctionLevel;
  mopLevel: MopLevel;
  selectedRooms: string[];
  availableRooms: RoomInfo[];
  currentMapId: number | undefined;
  cleanSession?: CleanSession;
  consumables?: ConsumableData;
}

export interface EufyCapabilities {
  supportsPause: boolean;
  supportsResume: boolean;
  supportsGoHome: boolean;
  supportsCleanModes: boolean;
  /** True for models with an auto-empty dock (e.g. X10 Pro Omni T2351). */
  supportsEmptyBin: boolean;
}

export interface NormalizedState {
  identity: Identity;
  connectivity: Connectivity;
  power: Power;
  activity: Activity;
  capabilities: EufyCapabilities;
  debug: {
    rawDps: Record<string, string>;
  };
}

/**
 * Creates the baseline runtime state for a single Eufy robot.
 */
export function createInitialState(identity: Identity, capabilities: EufyCapabilities): NormalizedState {
  return {
    identity,
    connectivity: { online: false },
    power: { batteryPercent: 100, charging: true, docked: true },
    activity: {
      runMode: 'idle',
      paused: false,
      activeError: undefined,
      cleanMode: 'AUTO',
      suctionLevel: 2,
      mopLevel: 'MIDDLE',
      selectedRooms: [],
      availableRooms: [],
      currentMapId: undefined,
    },
    capabilities,
    debug: { rawDps: {} },
  };
}
