import {
  API,
  Logger as HomebridgeLogger,
  PlatformAccessory,
} from 'homebridge';

import { NormalizedState } from '../eufy/models';
import { MatterMappers, MatterOperationalState } from './mappers';
import { Logger } from '../util/logger';

export class EufyRobovacAccessory {
  private currentState: NormalizedState;
  private lastSyncedMatterState?: Record<string, unknown>;
  private readonly platformLogger: Logger;

  constructor(
    private readonly platformLog: HomebridgeLogger,
    private readonly accessory: PlatformAccessory,
    initialState: NormalizedState,
    private readonly api: API
  ) {
    this.currentState = initialState;
    this.platformLogger = new Logger(platformLog, 'MatterAccessory');
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

    void this.syncMatterAttributes();
  }

  /**
   * Called by the parser whenever new MQTT data updates the state.
   */
  public onStateUpdate(newState: NormalizedState) {
    this.currentState = newState;
    void this.syncMatterAttributes();
  }

  private async syncMatterAttributes(): Promise<void> {
    const matterState = {
      RvcRunMode: {
        currentMode: MatterMappers.mapRvcRunMode(this.currentState),
        cleanMode: MatterMappers.mapCleanMode(this.currentState.activity.cleanMode),
      },
      RvcOperationalState: {
        operationalState: MatterMappers.mapOperationalState(this.currentState),
        paused: this.currentState.activity.paused,
        error: this.currentState.activity.activeError,
      },
      PowerSource: {
        batPercentRemaining: MatterMappers.mapBatteryLevel(this.currentState.power.batteryPercent),
        batChargeState: MatterMappers.mapChargeState(this.currentState.power.charging),
      },
    };

    if (this.isSameMatterState(matterState)) {
      return;
    }

    this.lastSyncedMatterState = matterState;
    await this.pushMatterState(matterState);
  }

  private isSameMatterState(nextState: Record<string, unknown>): boolean {
    if (!this.lastSyncedMatterState) {
      return false;
    }
    return JSON.stringify(this.lastSyncedMatterState) === JSON.stringify(nextState);
  }

  private async pushMatterState(matterState: Record<string, unknown>): Promise<void> {
    const matterApi = (this.api as unknown as {
      matter?: { updateAccessoryState?: Function; clusterNames?: Record<string, string> };
    }).matter;
    if (!matterApi?.updateAccessoryState) {
      this.platformLogger.warn('api.matter.updateAccessoryState is unavailable; skipping Matter sync.');
      return;
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
        this.platformLogger.error(`Failed Matter state push for cluster ${cluster}: ${message}`);
      }
    }

    const opState = MatterMappers.mapOperationalState(this.currentState);
    const runMode = this.currentState.activity.runMode;
    this.platformLogger.debug(
      `Synced Matter State => runMode=${runMode}, operationalState=${MatterOperationalState[opState]}, battery=${this.currentState.power.batteryPercent}%`
    );
  }
}
