"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyRobovacAccessory = void 0;
class EufyRobovacAccessory {
    platformLog;
    accessory;
    handlers;
    api;
    currentState;
    constructor(platformLog, accessory, handlers, initialState, api) {
        this.platformLog = platformLog;
        this.accessory = accessory;
        this.handlers = handlers;
        this.api = api;
        this.currentState = initialState;
        this.setupMatterClusters();
    }
    getCurrentState() {
        return this.currentState;
    }
    setupMatterClusters() {
        const Service = this.api.hap.Service;
        const Characteristic = this.api.hap.Characteristic;
        // Set Accessory Information
        this.accessory.getService(Service.AccessoryInformation)
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
            }
            else {
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
    onStateUpdate(newState) {
        this.currentState = newState;
        this.syncMatterAttributes();
    }
    syncMatterAttributes() {
        const Service = this.api.hap.Service;
        const Characteristic = this.api.hap.Characteristic;
        const service = this.accessory.getService(Service.Switch);
        if (service) {
            service.updateCharacteristic(Characteristic.On, this.currentState.activity.runMode === 'cleaning');
        }
        this.platformLog.debug(`Synced HAP State => Cleaning: ${this.currentState.activity.runMode}, Bat: ${this.currentState.power.batteryPercent}%`);
    }
}
exports.EufyRobovacAccessory = EufyRobovacAccessory;
