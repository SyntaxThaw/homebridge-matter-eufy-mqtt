export interface Identity {
  deviceId: string;
  model: string;
  firmware: string;
}

export interface Connectivity {
  online: boolean;
}

export interface Power {
  batteryPercent: number; // 0 - 100
  charging: boolean;
  docked: boolean;
}

export interface Activity {
  runMode: "idle" | "cleaning" | "returning" | "error";
  paused: boolean;
  activeError?: string;
  cleanMode?: string;
}

export interface EufyCapabilities {
  supportsPause: boolean;
  supportsResume: boolean;
  supportsGoHome: boolean;
  supportsCleanModes: boolean;
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

export function createInitialState(identity: Identity, capabilities: EufyCapabilities): NormalizedState {
  return {
    identity,
    connectivity: { online: false },
    power: { batteryPercent: 100, charging: true, docked: true },
    activity: { runMode: "idle", paused: false },
    capabilities,
    debug: { rawDps: {} }
  };
}
