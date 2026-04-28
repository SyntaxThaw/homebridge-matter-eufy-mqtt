"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyRobovacAccessory = void 0;
const mappers_1 = require("./mappers");
const logger_1 = require("../util/logger");
class EufyRobovacAccessory {
    platformLog;
    accessory;
    api;
    currentState;
    lastSyncedMatterState;
    platformLogger;
    matterStatePushEnabled;
    syncInFlight = false;
    pendingSync = false;
    syncRetryTimer;
    syncRetryDelayMs = 2000;
    syncRetryAttempts = 0;
    constructor(platformLog, accessory, initialState, api, options) {
        this.platformLog = platformLog;
        this.accessory = accessory;
        this.api = api;
        this.currentState = initialState;
        this.platformLogger = new logger_1.Logger(platformLog, 'MatterAccessory');
        this.matterStatePushEnabled = !options?.disableMatterStatePush;
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
    onStateUpdate(newState) {
        this.currentState = newState;
        void this.requestSync();
    }
    async requestSync() {
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
        }
        finally {
            this.syncInFlight = false;
        }
    }
    async syncMatterAttributes() {
        const matterState = {
            RvcRunMode: {
                supportedModes: mappers_1.MatterMappers.getSupportedRunModes(),
                currentMode: mappers_1.MatterMappers.mapRvcRunMode(this.currentState),
            },
            RvcOperationalState: {
                operationalStateList: mappers_1.MatterMappers.getOperationalStateList(),
                operationalState: mappers_1.MatterMappers.mapOperationalState(this.currentState),
                operationalError: mappers_1.MatterMappers.mapOperationalError(this.currentState),
            },
            PowerSource: {
                batPercentRemaining: mappers_1.MatterMappers.mapBatteryLevel(this.currentState.power.batteryPercent),
                batChargeState: mappers_1.MatterMappers.mapChargeState(this.currentState.power.charging),
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
            this.platformLogger.warn(`Matter state sync is waiting for an active commissioning session (attempt ${this.syncRetryAttempts}). `
                + 'If Home app keeps showing "updating", remove the stale tile and pair again with a fresh setup code.');
        }
        this.scheduleSyncRetry(this.syncRetryDelayMs);
        this.syncRetryDelayMs = Math.min(this.syncRetryDelayMs * 2, 15000);
    }
    isSameMatterState(nextState) {
        if (!this.lastSyncedMatterState) {
            return false;
        }
        return JSON.stringify(this.lastSyncedMatterState) === JSON.stringify(nextState);
    }
    scheduleSyncRetry(delayMs = 2000) {
        if (this.syncRetryTimer) {
            return;
        }
        this.syncRetryTimer = setTimeout(() => {
            this.syncRetryTimer = undefined;
            void this.requestSync();
        }, delayMs);
    }
    async pushMatterState(matterState) {
        if (!this.matterStatePushEnabled) {
            return { pushed: false, shouldRetry: false };
        }
        const matterApi = this.api.matter;
        if (!matterApi?.updateAccessoryState) {
            this.platformLogger.warn('api.matter.updateAccessoryState is unavailable; skipping Matter sync.');
            return { pushed: false, shouldRetry: true };
        }
        const clusterNames = {
            RvcRunMode: matterApi.clusterNames?.RvcRunMode ?? 'rvcRunMode',
            RvcOperationalState: matterApi.clusterNames?.RvcOperationalState ?? 'rvcOperationalState',
            PowerSource: matterApi.clusterNames?.PowerSource ?? 'powerSource',
        };
        for (const [clusterKey, payload] of Object.entries(matterState)) {
            const cluster = clusterNames[clusterKey] ?? clusterKey;
            try {
                await Promise.resolve(matterApi.updateAccessoryState(this.accessory.UUID, cluster, payload));
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes('not found or not registered')) {
                    this.platformLogger.debug(`Matter accessory ${this.accessory.UUID} is not registered yet; scheduling state sync retry.`);
                    return { pushed: false, shouldRetry: true };
                }
                if (message.toLowerCase().includes('unknown session')) {
                    this.platformLogger.debug(`Matter exchange session expired for ${this.accessory.UUID}; waiting for commissioner to re-open the session.`);
                    return { pushed: false, shouldRetry: true };
                }
                this.platformLogger.error(`Failed Matter state push for cluster ${cluster}: ${message}`);
                return { pushed: false, shouldRetry: false };
            }
        }
        const opState = mappers_1.MatterMappers.mapOperationalState(this.currentState);
        const runMode = this.currentState.activity.runMode;
        this.platformLogger.debug(`Synced Matter State => runMode=${runMode}, operationalState=${mappers_1.MatterOperationalState[opState]}, battery=${this.currentState.power.batteryPercent}%`);
        return { pushed: true, shouldRetry: false };
    }
}
exports.EufyRobovacAccessory = EufyRobovacAccessory;
