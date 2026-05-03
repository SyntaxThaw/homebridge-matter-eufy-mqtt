import {
  API,
  Logger as HomebridgeLogger,
  PlatformAccessory,
} from 'homebridge';

import { NormalizedState } from '../eufy/models';
import { MatterMappers, MatterOperationalState } from './mappers';
import { MatterClusterMapper } from './clusters';
import { Logger } from '../util/logger';

type MatterClusterNameMap = {
  RvcRunMode?: string;
  RvcCleanMode?: string;
  RvcOperationalState?: string;
  ServiceArea?: string;
  PowerSource?: string;
};

type MatterStateApi = {
  updateAccessoryState?: (
    accessoryUuid: string,
    cluster: string,
    payload: unknown
  ) => void | Promise<void>;
  clusterNames?: MatterClusterNameMap;
};

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort().map(k => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

export function isTransientMatterSessionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('unknown session')
    || normalized.includes('session') && normalized.includes('is closing')
    || normalized.includes('ignoring message for unknown session')
    || normalized.includes('peer is no longer responding to active session')
    || (normalized.includes('active session') && normalized.includes('timed out'));
}

export class EufyRobovacAccessory {
  private currentState: NormalizedState;
  private lastSyncedMatterState?: Record<string, unknown>;
  private readonly platformLogger: Logger;
  private matterStatePushEnabled: boolean;
  private syncInFlight = false;
  private pendingSync = false;
  private syncDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private static readonly SYNC_DEBOUNCE_MS = 100;
  private syncRetryTimer: ReturnType<typeof setTimeout> | undefined;
  private syncRetryDelayMs = 2000;
  private syncRetryAttempts = 0;
  private transientSessionRetryDelayMs = 30000;
  private unknownSessionBackoffUntil = 0;
  private hasLoggedUnknownSessionBackoff = false;
  private consecutiveUnknownSessionErrors = 0;
  private statePushRecoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private periodicSyncTimer: ReturnType<typeof setInterval> | undefined;
  private static readonly PERIODIC_SYNC_INTERVAL_MS = 60_000;
  // Per-cluster push timeout. With parallel pushes total wall time is bounded
  // by this value (was 10s sequential = up to 50s for 5 clusters).
  private static readonly PER_CLUSTER_PUSH_TIMEOUT_MS = 3_000;
  private readonly unsupportedClustersLogged = new Set<string>();

  constructor(
    private readonly platformLog: HomebridgeLogger,
    private readonly accessory: PlatformAccessory,
    initialState: NormalizedState,
    private readonly api: API,
    options?: { disableMatterStatePush?: boolean }
  ) {
    this.currentState = initialState;
    this.platformLogger = new Logger(platformLog, 'MatterAccessory');
    this.matterStatePushEnabled = !options?.disableMatterStatePush;
    this.setupMatterClusters();
    this.startPeriodicSync();
  }

  public getCurrentState(): NormalizedState {
    return this.currentState;
  }

  private setupMatterClusters() {
    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    // Set Accessory Information
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Eufy')
      .setCharacteristic(Characteristic.Model, this.currentState.identity.model)
      .setCharacteristic(Characteristic.SerialNumber, this.currentState.identity.deviceId)
      .setCharacteristic(Characteristic.FirmwareRevision, this.currentState.identity.firmware);

    const staleSwitch = this.accessory.getService(Service.Switch);
    if (staleSwitch) {
      this.accessory.removeService(staleSwitch);
      this.platformLog.info('Removed legacy Switch service for Matter RVC migration.');
    }

    const staleStatelessSwitch = this.accessory.getService(Service.StatelessProgrammableSwitch);
    if (staleStatelessSwitch) {
      this.accessory.removeService(staleStatelessSwitch);
      this.platformLog.info('Removed legacy StatelessProgrammableSwitch service for pure Matter RVC migration.');
    }

    this.requestSync();
  }

  /**
   * Called by the parser whenever new MQTT data updates the state.
   */
  public onStateUpdate(newState: NormalizedState) {
    this.currentState = newState;
    this.requestSync();
  }

  private requestSync(): void {
    this.pendingSync = true;
    if (this.syncInFlight) return;
    if (this.syncDebounceTimer) return; // already coalescing

    this.syncDebounceTimer = setTimeout(() => {
      this.syncDebounceTimer = undefined;
      void this.flushSync();
    }, EufyRobovacAccessory.SYNC_DEBOUNCE_MS);
  }

  private async flushSync(): Promise<void> {
    if (this.syncInFlight) return;
    this.syncInFlight = true;
    try {
      while (this.pendingSync) {
        this.pendingSync = false;
        await this.syncMatterAttributes();
      }
    } finally {
      this.syncInFlight = false;
    }
  }

  private async syncMatterAttributes(): Promise<void> {
    const matterState = MatterClusterMapper.toMatterState(this.currentState);

    if (this.isSameMatterState(matterState)) {
      return;
    }

    const syncResult = await this.pushMatterState(matterState);
    if (syncResult.pushed) {
      this.syncRetryAttempts = 0;
      this.syncRetryDelayMs = 2000;
      this.consecutiveUnknownSessionErrors = 0;
      this.lastSyncedMatterState = matterState;
      return;
    }

    if (!syncResult.shouldRetry) {
      return;
    }

    this.syncRetryAttempts += 1;
    const shouldLogRetryWarning = this.syncRetryAttempts === 1 || this.syncRetryAttempts % 5 === 0;
    if (shouldLogRetryWarning) {
      this.platformLogger.warn(
        `Matter state sync is waiting for an active commissioning session (attempt ${this.syncRetryAttempts}). `
        + 'If Home app keeps showing "updating", remove the stale tile and pair again with a fresh setup code.'
      );
    }

    this.scheduleSyncRetry(this.syncRetryDelayMs);
    this.syncRetryDelayMs = Math.min(this.syncRetryDelayMs * 2, 15000);
  }

  private isSameMatterState(nextState: Record<string, unknown>): boolean {
    if (!this.lastSyncedMatterState) {
      return false;
    }
    return JSON.stringify(sortKeys(this.lastSyncedMatterState)) === JSON.stringify(sortKeys(nextState));
  }

  private scheduleSyncRetry(delayMs = 2000): void {
    if (this.syncRetryTimer) {
      return;
    }

    this.syncRetryTimer = setTimeout(() => {
      this.syncRetryTimer = undefined;
      this.requestSync();
    }, delayMs);
  }

  private async pushMatterState(
    matterState: Record<string, unknown>
  ): Promise<{ pushed: boolean; shouldRetry: boolean }> {
    if (!this.matterStatePushEnabled) {
      return { pushed: false, shouldRetry: false };
    }

    const matterApi = (this.api as unknown as { matter?: MatterStateApi }).matter;
    if (!matterApi?.updateAccessoryState) {
      this.platformLogger.warn('api.matter.updateAccessoryState is unavailable; skipping Matter sync.');
      return { pushed: false, shouldRetry: false };
    }

    const now = Date.now();
    if (now < this.unknownSessionBackoffUntil) {
      this.scheduleSyncRetry(this.unknownSessionBackoffUntil - now);
      if (!this.hasLoggedUnknownSessionBackoff) {
        const backoffSeconds = Math.ceil((this.unknownSessionBackoffUntil - now) / 1000);
        this.platformLogger.debug(
          `Skipping Matter state push for ${this.accessory.UUID}; waiting ${backoffSeconds}s before retrying after unknown session.`
        );
        this.hasLoggedUnknownSessionBackoff = true;
      }
      return { pushed: false, shouldRetry: false };
    }

    const clusterNames = {
      RvcRunMode: matterApi.clusterNames?.RvcRunMode ?? 'rvcRunMode',
      RvcCleanMode: matterApi.clusterNames?.RvcCleanMode ?? 'rvcCleanMode',
      RvcOperationalState: matterApi.clusterNames?.RvcOperationalState ?? 'rvcOperationalState',
      ServiceArea: matterApi.clusterNames?.ServiceArea ?? 'serviceArea',
      PowerSource: matterApi.clusterNames?.PowerSource ?? 'powerSource',
    };

    type PushResult =
      | { kind: 'pushed' }
      | { kind: 'retry' }
      | { kind: 'session-error' }
      | { kind: 'unsupported'; cluster: string; message: string }
      | { kind: 'failed'; cluster: string; message: string };

    const pushOne = async (clusterKey: string, payload: unknown): Promise<PushResult> => {
      const cluster = clusterNames[clusterKey as keyof typeof clusterNames] ?? clusterKey;
      try {
        const update = Promise.resolve(matterApi.updateAccessoryState!(this.accessory.UUID, cluster, payload));
        const timeout = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('updateAccessoryState timed out after 3s')), EufyRobovacAccessory.PER_CLUSTER_PUSH_TIMEOUT_MS)
        );
        await Promise.race([update, timeout]);
        return { kind: 'pushed' };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('not found or not registered')) return { kind: 'retry' };
        if (isTransientMatterSessionError(message)) return { kind: 'session-error' };
        if (message.includes('Unknown cluster name') || message.includes('Behavior ID')) {
          return { kind: 'unsupported', cluster, message };
        }
        return { kind: 'failed', cluster, message };
      }
    };

    // Push all clusters in parallel — matter.js handles concurrent updateAccessoryState
    // calls fine, and serializing them blocks the commissioner with up to 5x timeout
    // duration (15s with 3s/cluster, 50s with the previous 10s/cluster timeout).
    const results = await Promise.all(
      Object.entries(matterState).map(([k, p]) => pushOne(k, p))
    );

    if (results.some(r => r.kind === 'retry')) {
      this.platformLogger.debug(
        `Matter accessory ${this.accessory.UUID} is not registered yet; scheduling state sync retry.`
      );
      return { pushed: false, shouldRetry: true };
    }

    if (results.some(r => r.kind === 'session-error')) {
      this.consecutiveUnknownSessionErrors += 1;
      if (this.consecutiveUnknownSessionErrors >= 3) {
        this.matterStatePushEnabled = false;
        this.unknownSessionBackoffUntil = 0;
        this.hasLoggedUnknownSessionBackoff = false;
        this.platformLogger.warn(
          `Temporarily pausing Matter state pushes for ${this.accessory.UUID} after repeated session timeout/unknown-session errors. `
          + 'Will automatically retry in 60s to recover after bridge/controller restarts.'
        );
        this.scheduleStatePushRecovery(60000);
        return { pushed: false, shouldRetry: false };
      }
      this.unknownSessionBackoffUntil = Date.now() + this.transientSessionRetryDelayMs;
      this.hasLoggedUnknownSessionBackoff = false;
      this.scheduleSyncRetry(this.transientSessionRetryDelayMs);
      this.platformLogger.debug(
        `Matter exchange session expired for ${this.accessory.UUID}; pausing state pushes for ${Math.ceil(this.transientSessionRetryDelayMs / 1000)} seconds while commissioner re-opens the session.`
      );
      return { pushed: false, shouldRetry: false };
    }

    for (const r of results) {
      if (r.kind === 'unsupported' && !this.unsupportedClustersLogged.has(r.cluster)) {
        this.unsupportedClustersLogged.add(r.cluster);
        this.platformLogger.warn(
          `Skipping unsupported Matter cluster ${r.cluster} for ${this.accessory.UUID}: ${r.message}`
        );
      }
    }

    const failures = results.filter((r): r is Extract<PushResult, { kind: 'failed' }> => r.kind === 'failed');
    if (failures.length > 0) {
      for (const f of failures) {
        this.platformLogger.error(`Failed Matter state push for cluster ${f.cluster}: ${f.message}`);
      }
      return { pushed: false, shouldRetry: false };
    }

    const opState = MatterMappers.mapOperationalState(this.currentState);
    const runMode = this.currentState.activity.runMode;
    this.platformLogger.debug(
      `Synced Matter State => runMode=${runMode}, operationalState=${MatterOperationalState[opState]}, battery=${this.currentState.power.batteryPercent}%`
    );
    this.consecutiveUnknownSessionErrors = 0;
    this.unknownSessionBackoffUntil = 0;
    this.hasLoggedUnknownSessionBackoff = false;
    return { pushed: true, shouldRetry: false };
  }

  /** Clears retry timers to avoid leaks during shutdown. */
  public dispose(): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = undefined;
    }
    if (this.syncRetryTimer) {
      clearTimeout(this.syncRetryTimer);
      this.syncRetryTimer = undefined;
    }
    if (this.statePushRecoveryTimer) {
      clearTimeout(this.statePushRecoveryTimer);
      this.statePushRecoveryTimer = undefined;
    }
    if (this.periodicSyncTimer) {
      clearInterval(this.periodicSyncTimer);
      this.periodicSyncTimer = undefined;
    }
  }

  private startPeriodicSync(): void {
    if (this.periodicSyncTimer) return;
    this.periodicSyncTimer = setInterval(() => {
      this.requestSync();
    }, EufyRobovacAccessory.PERIODIC_SYNC_INTERVAL_MS);
  }

  private scheduleStatePushRecovery(delayMs: number): void {
    if (this.statePushRecoveryTimer) {
      return;
    }

    this.statePushRecoveryTimer = setTimeout(() => {
      this.statePushRecoveryTimer = undefined;
      this.matterStatePushEnabled = true;
      this.consecutiveUnknownSessionErrors = 0;
      this.platformLogger.info(
        `Re-enabling Matter state pushes for ${this.accessory.UUID} after transient session errors.`
      );
      // Clear the deduplication cache so the upcoming requestSync() always
      // pushes current state to any newly commissioned subscribers, even if
      // the device hasn't changed state since the last successful push.
      delete this.lastSyncedMatterState;
      this.requestSync();
    }, delayMs);
  }

}
