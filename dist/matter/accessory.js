"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyRobovacAccessory = void 0;
const mappers_1 = require("./mappers");
const logger_1 = require("../util/logger");
class EufyRobovacAccessory {
    platformLog;
    accessory;
    handlers;
    api;
    currentState;
    lastSyncedMatterState;
    platformLogger;
    constructor(platformLog, accessory, handlers, initialState, api) {
        this.platformLog = platformLog;
        this.accessory = accessory;
        this.handlers = handlers;
        this.api = api;
        this.currentState = initialState;
        this.platformLogger = new logger_1.Logger(platformLog, 'MatterAccessory');
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
            }
            else if (value === Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS) {
                await this.handlers.handlePauseCommand();
            }
            else if (value === Characteristic.ProgrammableSwitchEvent.LONG_PRESS) {
                await this.handlers.handleGoHomeCommand();
            }
        });
        this.syncMatterAttributes();
    }
    /**
     * Called by the parser whenever new MQTT data updates the state.
     */
    onStateUpdate(newState) {
        this.currentState = newState;
        this.syncMatterAttributes();
    }
    syncMatterAttributes() {
        const matterState = {
            RvcRunMode: {
                currentMode: mappers_1.MatterMappers.mapRvcRunMode(this.currentState),
                cleanMode: mappers_1.MatterMappers.mapCleanMode(this.currentState.activity.cleanMode),
            },
            RvcOperationalState: {
                operationalState: mappers_1.MatterMappers.mapOperationalState(this.currentState),
                paused: this.currentState.activity.paused,
                error: this.currentState.activity.activeError,
            },
            PowerSource: {
                batPercentRemaining: mappers_1.MatterMappers.mapBatteryLevel(this.currentState.power.batteryPercent),
                batChargeState: mappers_1.MatterMappers.mapChargeState(this.currentState.power.charging),
            },
        };
        if (this.isSameMatterState(matterState)) {
            return;
        }
        this.lastSyncedMatterState = matterState;
        this.pushMatterState(matterState);
    }
    isSameMatterState(nextState) {
        if (!this.lastSyncedMatterState) {
            return false;
        }
        return JSON.stringify(this.lastSyncedMatterState) === JSON.stringify(nextState);
    }
    pushMatterState(matterState) {
        const matterApi = this.api.matter;
        if (!matterApi?.updateAccessoryState) {
            this.platformLogger.warn('api.matter.updateAccessoryState is unavailable; skipping Matter sync.');
            return;
        }
        for (const [cluster, payload] of Object.entries(matterState)) {
            try {
                matterApi.updateAccessoryState(this.accessory, cluster, payload);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.platformLogger.error(`Failed Matter state push for cluster ${cluster}: ${message}`);
            }
        }
        const opState = mappers_1.MatterMappers.mapOperationalState(this.currentState);
        const runMode = this.currentState.activity.runMode;
        this.platformLogger.debug(`Synced Matter State => runMode=${runMode}, operationalState=${mappers_1.MatterOperationalState[opState]}, battery=${this.currentState.power.batteryPercent}%`);
    }
}
exports.EufyRobovacAccessory = EufyRobovacAccessory;
