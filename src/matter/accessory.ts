import {
  API,
  Logger as HomebridgeLogger,
  PlatformAccessory,
} from 'homebridge';

import { NormalizedState } from '../eufy/models';
import { MatterMappers, MatterOperationalState } from './mappers';
import { Logger } from '../util/logger';

type MatterClusterNameMap = {
  RvcRunMode?: string;
  RvcOperationalState?: string;
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

export class EufyRobovacAccessory {
  private currentState: NormalizedState;
  private lastSyncedMatterState?: Record<string, unknown>;
  private readonly platformLogger: Logger;
  private matterStatePushEnabled: boolean;
  private syncInFlight = false;
  private pendingSync = false;
  private syncRetryTimer?: ReturnType<typeof setTimeout>;
  private syncRetryDelayMs = 2000;
  private syncRetryAttempts = 0;

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

    void this.requestSync();
  }

  /**
   * Called by the parser whenever new MQTT data updates the state.
   */
  public onStateUpdate(newState: NormalizedState) {
    this.currentState = newState;
    void this.requestSync();
  }

  private async requestSync(): Promise<void> {
    this.pendingSync = true;
    if (this.syncInFlight) {
      return;
    }

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
    const matterState = {
      RvcRunMode: {
        supportedModes: MatterMappers.getSupportedRunModes(),
        currentMode: MatterMappers.mapRvcRunMode(this.currentState),
      },
      RvcOperationalState: {
        operationalStateList: MatterMappers.getOperationalStateList(),
        operationalState: MatterMappers.mapOperationalState(this.currentState),
        operationalError: MatterMappers.mapOperationalError(this.currentState),
      },
      PowerSource: {
        batPercentRemaining: MatterMappers.mapBatteryLevel(this.currentState.power.batteryPercent),
        batChargeState: MatterMappers.mapChargeState(this.currentState.power.charging),
      },
    };

    if (this.isSameMatterState(matterState)) {
      return;
    }

    const syncResult = await this.pushMatterState(matterState);
    if (syncResult.pushed) {
      this.syncRetryAttempts = 0;
      this.syncRetryDelayMs = 2000;
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
    return JSON.stringify(this.lastSyncedMatterState) === JSON.stringify(nextState);
  }

  private scheduleSyncRetry(delayMs = 2000): void {
    if (this.syncRetryTimer) {
      return;
    }

    this.syncRetryTimer = setTimeout(() => {
      this.syncRetryTimer = undefined;
      void this.requestSync();
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

    const clusterNames = {
      RvcRunMode: matterApi.clusterNames?.RvcRunMode ?? 'rvcRunMode',
      RvcOperationalState: matterApi.clusterNames?.RvcOperationalState ?? 'rvcOperationalState',
      PowerSource: matterApi.clusterNames?.PowerSource ?? 'powerSource',
    };

    for (const [clusterKey, payload] of Object.entries(matterState)) {
      const cluster = clusterNames[clusterKey as keyof typeof clusterNames] ?? clusterKey;
      try {
        await Promise.resolve(matterApi.updateAccessoryState(this.accessory.UUID, cluster, payload));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('not found or not registered')) {
          this.platformLogger.debug(
            `Matter accessory ${this.accessory.UUID} is not registered yet; scheduling state sync retry.`
          );
          return { pushed: false, shouldRetry: true };
        }
        if (message.toLowerCase().includes('unknown session')) {
          this.platformLogger.debug(
            `Matter exchange session expired for ${this.accessory.UUID}; waiting for commissioner to re-open the session.`
          );
          return { pushed: false, shouldRetry: true };
        }
        this.platformLogger.error(`Failed Matter state push for cluster ${cluster}: ${message}`);
        return { pushed: false, shouldRetry: false };
      }
    }

    const opState = MatterMappers.mapOperationalState(this.currentState);
    const runMode = this.currentState.activity.runMode;
    this.platformLogger.debug(
      `Synced Matter State => runMode=${runMode}, operationalState=${MatterOperationalState[opState]}, battery=${this.currentState.power.batteryPercent}%`
    );
    return { pushed: true, shouldRetry: false };
  }
}
