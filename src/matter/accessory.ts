import {
  API,
  Logger as HomebridgeLogger,
  PlatformAccessory,
} from 'homebridge';

// (We use standard HAP services for now, as Homebridge 2 bridges these to Matter automatically)

import { NormalizedState } from '../eufy/models';
import { MatterMappers } from './mappers';
import { MatterCommandHandlers } from './handlers';
import { Logger } from '../util/logger';

export class EufyRobovacAccessory {
  private currentState: NormalizedState;

  constructor(
    private readonly platformLog: HomebridgeLogger,
    private readonly accessory: PlatformAccessory,
    private readonly handlers: MatterCommandHandlers,
    initialState: NormalizedState,
    private readonly api: API
  ) {
    this.currentState = initialState;
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

    // Create a Switch service to represent "Cleaning" for now
    const service = this.accessory.getService(Service.Switch) || this.accessory.addService(Service.Switch, 'Cleaning');

    service.getCharacteristic(Characteristic.On)
      .onSet(async (value) => {
        if (value) {
          this.platformLog.info('Starting cleaning via HomeKit');
          await this.handlers.handleStartCommand();
        } else {
          this.platformLog.info('Returning home via HomeKit');
          await this.handlers.handleGoHomeCommand();
        }
      })
      .onGet(() => {
        return this.currentState.activity.runMode === 'cleaning';
      });
  }

  /**
   * Called by the parser whenever new MQTT data updates the state.
   */
  public onStateUpdate(newState: NormalizedState) {
    this.currentState = newState;
    this.syncMatterAttributes();
  }

  private syncMatterAttributes() {
    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;
    
    const service = this.accessory.getService(Service.Switch);
    if (service) {
      service.updateCharacteristic(Characteristic.On, this.currentState.activity.runMode === 'cleaning');
    }

    this.platformLog.debug(`Synced HAP State => Cleaning: ${this.currentState.activity.runMode}, Bat: ${this.currentState.power.batteryPercent}%`);
  }
}
