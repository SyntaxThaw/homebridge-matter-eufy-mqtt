import {
  API,
  Logger as HomebridgeLogger,
  PlatformAccessory,
} from 'homebridge';

import { NormalizedState } from '../eufy/models';
import { MatterMappers, MatterOperationalState } from './mappers';
import { MatterCommandHandlers } from './handlers';
import { Logger } from '../util/logger';

export class EufyRobovacAccessory {
  private currentState: NormalizedState;
  private lastSyncedMatterState?: Record<string, unknown>;
  private readonly platformLogger: Logger;

  constructor(
    private readonly platformLog: HomebridgeLogger,
    private readonly accessory: PlatformAccessory,
    private readonly handlers: MatterCommandHandlers,
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

    // Temporary command bridge via stateless switch-like service.
    // Matter command handlers remain primary path for command execution.
    const controlService = this.accessory.getService(Service.StatelessProgrammableSwitch)
      || this.accessory.addService(Service.StatelessProgrammableSwitch, 'Vacuum Controls');
    controlService.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
      .onSet(async (value) => {
        if (value === Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS) {
          await this.handlers.handleStartCommand();
        } else if (value === Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS) {
          await this.handlers.handlePauseCommand();
        } else if (value === Characteristic.ProgrammableSwitchEvent.LONG_PRESS) {
          await this.handlers.handleGoHomeCommand();
        }
      });

    this.syncMatterAttributes();
  }

  /**
   * Called by the parser whenever new MQTT data updates the state.
   */
  public onStateUpdate(newState: NormalizedState) {
    this.currentState = newState;
    this.syncMatterAttributes();
  }

  private syncMatterAttributes() {
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
    this.pushMatterState(matterState);
  }

  private isSameMatterState(nextState: Record<string, unknown>): boolean {
    if (!this.lastSyncedMatterState) {
      return false;
    }
    return JSON.stringify(this.lastSyncedMatterState) === JSON.stringify(nextState);
  }

  private pushMatterState(matterState: Record<string, unknown>) {
    const matterApi = (this.api as unknown as { matter?: { updateAccessoryState?: Function } }).matter;
    if (!matterApi?.updateAccessoryState) {
      this.platformLogger.warn('api.matter.updateAccessoryState is unavailable; skipping Matter sync.');
      return;
    }

    for (const [cluster, payload] of Object.entries(matterState)) {
      try {
        matterApi.updateAccessoryState(this.accessory, cluster, payload);
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
