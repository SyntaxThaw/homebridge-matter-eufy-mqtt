"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyRobovacAccessory = void 0;
const mappers_1 = require("./mappers");
class EufyRobovacAccessory {
    platformLog;
    accessory;
    handlers;
    currentState;
    constructor(platformLog, accessory, handlers, initialState) {
        this.platformLog = platformLog;
        this.accessory = accessory;
        this.handlers = handlers;
        this.currentState = initialState;
        this.setupMatterClusters();
    }
    getCurrentState() {
        return this.currentState;
    }
    setupMatterClusters() {
        // 1. Setup RoboticVacuumCleaner Endpoints
        // (A mock API representing Homebridge v2 native Matter accessory patterns)
        // We bind to the specific Matter Clusters on our accessory object...
        // e.g. using specific Homebridge generic Matter bridges if exposed by `accessory.getCluster` 
        // This pseudo-code relies heavily on the upcoming @homebridge/matter bindings structure.
        this.platformLog.info(`Setting up Matter Clusters for ${this.currentState.identity.deviceId}...`);
        /*
        const opStateCluster = this.accessory.addMatterCluster(OperationalState.Cluster);
        opStateCluster.on('GoHome', () => this.handlers.handleGoHomeCommand());
        opStateCluster.on('Start', () => this.handlers.handleStartCommand());
        opStateCluster.on('Stop', () => this.handlers.handleStopCommand());
        opStateCluster.on('Pause', () => this.handlers.handlePauseCommand());
        opStateCluster.on('Resume', () => this.handlers.handleResumeCommand());
        */
    }
    /**
     * Called by the parser whenever new MQTT data updates the state.
     */
    onStateUpdate(newState) {
        this.currentState = newState;
        this.syncMatterAttributes();
    }
    syncMatterAttributes() {
        const matterState = mappers_1.MatterMappers.mapOperationalState(this.currentState);
        const batLevel = mappers_1.MatterMappers.mapBatteryLevel(this.currentState.power.batteryPercent);
        const chargeState = mappers_1.MatterMappers.mapChargeState(this.currentState.power.charging);
        // Sync values up to the Matter bridge
        // opStateCluster.setAttribute('OperationalState', matterState);
        // powerCluster.setAttribute('BatPercentRemaining', batLevel);
        // powerCluster.setAttribute('BatChargeState', chargeState);
        this.platformLog.debug(`Synced Matter State => OpState: ${matterState}, Bat: ${batLevel}%`);
    }
}
exports.EufyRobovacAccessory = EufyRobovacAccessory;
