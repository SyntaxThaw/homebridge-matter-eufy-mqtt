"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyRobovacMatterPlatform = void 0;
const logger_1 = require("./util/logger");
const codec_1 = require("./eufy/codec");
const parser_1 = require("./eufy/parser");
const mqtt_1 = require("./eufy/mqtt");
const commands_1 = require("./eufy/commands");
const handlers_1 = require("./matter/handlers");
const accessory_1 = require("./matter/accessory");
const models_1 = require("./eufy/models");
const capabilities_1 = require("./eufy/capabilities");
const auth_1 = require("./eufy/auth");
const cloud_types_1 = require("./eufy/cloud-types");
const PLUGIN_NAME = 'homebridge-eufy-robovac-matter';
const PLATFORM_NAME = 'EufyRobovacMatter';
class EufyRobovacMatterPlatform {
    api;
    config;
    log;
    accessories = [];
    activeAccessoryUuids = new Set();
    mqttClients = new Map();
    constructor(log, config, api) {
        this.api = api;
        this.log = new logger_1.Logger(log, 'EufyPlatform');
        this.config = config;
        this.log.debug('Finished initializing platform:', this.config.name);
        if (!this.config.username || !this.config.password) {
            this.log.error('Missing username or password in config. Cannot start plugin.');
            return;
        }
        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => {
            this.log.debug('Executed didFinishLaunching callback');
            void this.discoverDevices();
        });
        this.api.on('shutdown', () => {
            this.log.info('Homebridge shutdown detected. Disconnecting MQTT clients.');
            this.disconnectAllMqttClients();
        });
    }
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }
    getMatterApi() {
        return this.api.matter;
    }
    async discoverDevices() {
        this.log.info('Discovering Eufy devices...');
        this.activeAccessoryUuids.clear();
        this.disconnectAllMqttClients();
        try {
            const authManager = new auth_1.EufyAuthManager(this.config.username, this.config.password, this.log);
            const { devices, mqttConfig, userInfo, openudid } = await authManager.connectAndFetchDevices();
            const mqttConnection = (0, cloud_types_1.resolveMqttConnectionSettings)(mqttConfig);
            if (!mqttConnection.settings) {
                throw new Error(`MQTT configuration from Eufy Cloud is incomplete: ${mqttConnection.missingFields.join(', ')}.`);
            }
            if (!devices || devices.length === 0) {
                this.log.warn('No Eufy devices found under this account.');
                await this.cleanupStaleAccessories();
                return;
            }
            const codec = new codec_1.EufyCodec();
            await codec.loadSchemas();
            this.log.info(`Provisioning ${devices.length} devices over MQTT...`);
            for (const device of devices) {
                const deviceId = device.device_sn;
                const deviceModel = device.device_model;
                const deviceName = this.getDeviceName(device);
                const uuid = this.api.hap.uuid.generate(deviceId);
                this.activeAccessoryUuids.add(uuid);
                let accessory = this.accessories.find(acc => acc.UUID === uuid);
                const isNewAccessory = !accessory;
                if (isNewAccessory) {
                    accessory = new this.api.platformAccessory(deviceName, uuid);
                    accessory.category = 1 /* this.api.hap.Categories.OTHER */;
                }
                const parser = new parser_1.StateParser(codec, this.log);
                const commandBuilder = new commands_1.CommandBuilder(codec);
                const mqttClient = new mqtt_1.EufyMqttClient(deviceId, deviceModel, userInfo.user_center_id, 'eufy_home', openudid, mqttConnection.settings.certificatePem, mqttConnection.settings.privateKey, mqttConnection.settings.username, mqttConnection.settings.endpoint, this.log);
                const caps = (0, capabilities_1.deriveCapabilitiesByModel)(deviceModel);
                const handlers = new handlers_1.MatterCommandHandlers(commandBuilder, mqttClient, this.log, caps);
                const identity = { deviceId, model: deviceModel, firmware: device.main_fw_version || '1.0' };
                const initialState = (0, models_1.createInitialState)(identity, caps);
                const setupResult = await this.registerOrUpdateMatterAccessory(accessory, isNewAccessory, handlers, caps);
                if (!setupResult.configured) {
                    this.log.warn(`Skipping MQTT binding for ${device.device_name || deviceId}: Matter accessory setup failed.`);
                    continue;
                }
                const accessoryHandler = new accessory_1.EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
                    disableMatterStatePush: !setupResult.statePushSupported,
                });
                mqttClient.on('message', (payload) => {
                    if (this.isDpsPayload(payload)) {
                        const currentState = accessoryHandler.getCurrentState();
                        const newState = parser.processDps(payload.data, currentState);
                        accessoryHandler.onStateUpdate(newState);
                    }
                });
                mqttClient.on('error', (err) => {
                    const message = err instanceof Error ? err.message : String(err);
                    this.log.error(`MQTT error for ${deviceName}: ${message}`);
                });
                try {
                    await mqttClient.connect();
                    this.mqttClients.set(uuid, mqttClient);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.log.error(`Failed to connect MQTT for ${deviceName}: ${message}`);
                }
            }
            await this.cleanupStaleAccessories();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log.error(`Device discovery failed: ${message}. Will retry on next Homebridge restart.`);
        }
    }
    async registerOrUpdateMatterAccessory(accessory, isNewAccessory, handlers, capabilities) {
        const matterApi = this.getMatterApi();
        const roboticVacuumType = matterApi?.deviceTypes?.RoboticVacuumCleaner;
        if (!roboticVacuumType) {
            this.log.error('Matter device type RoboticVacuumCleaner is unavailable; cannot register accessory as vacuum.');
            return { configured: false, statePushSupported: false };
        }
        const commandHandlers = {
            start: () => handlers.handleStartCommand(),
            stop: () => handlers.handleStopCommand(),
        };
        if (capabilities.supportsPause) {
            commandHandlers.pause = () => handlers.handlePauseCommand();
        }
        if (capabilities.supportsResume) {
            commandHandlers.resume = () => handlers.handleResumeCommand();
        }
        if (capabilities.supportsGoHome) {
            commandHandlers.goHome = () => handlers.handleGoHomeCommand();
        }
        const matterConfig = {
            deviceType: roboticVacuumType,
            commandHandlers,
        };
        let statePushSupported = true;
        if (matterApi?.configureMatterAccessory) {
            await matterApi.configureMatterAccessory(accessory, matterConfig);
        }
        else if (matterApi?.configureAccessory) {
            await matterApi.configureAccessory(accessory, matterConfig);
        }
        else {
            this.log.warn('Matter configureAccessory API unavailable; using cached accessory fallback.');
            statePushSupported = false;
        }
        if (isNewAccessory) {
            if (matterApi?.registerPlatformAccessories) {
                await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
            else {
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
            this.accessories.push(accessory);
            this.log.info(`Registered Matter accessory: ${accessory.displayName}`);
            return { configured: true, statePushSupported };
        }
        if (matterApi?.updatePlatformAccessories) {
            await matterApi.updatePlatformAccessories([accessory]);
        }
        else {
            this.api.updatePlatformAccessories([accessory]);
        }
        return { configured: true, statePushSupported };
    }
    async cleanupStaleAccessories() {
        const stale = this.accessories.filter(accessory => !this.activeAccessoryUuids.has(accessory.UUID));
        if (stale.length === 0) {
            return;
        }
        this.log.warn(`Found ${stale.length} stale cached accessories. Removing to support model migration.`);
        const matterApi = this.getMatterApi();
        for (const accessory of stale) {
            this.disconnectMqttClient(accessory.UUID);
            if (matterApi?.unregisterPlatformAccessories) {
                await matterApi.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
            else {
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
            const staleIndex = this.accessories.findIndex(cached => cached.UUID === accessory.UUID);
            if (staleIndex >= 0) {
                this.accessories.splice(staleIndex, 1);
            }
            this.log.info(`Removed stale accessory from cache: ${accessory.displayName}`);
        }
    }
    getDeviceName(device) {
        return device.device_name || device.alias_name || `Eufy RoboVac ${device.device_sn}`;
    }
    disconnectMqttClient(accessoryUuid) {
        const mqttClient = this.mqttClients.get(accessoryUuid);
        if (!mqttClient) {
            return;
        }
        mqttClient.disconnect();
        this.mqttClients.delete(accessoryUuid);
    }
    disconnectAllMqttClients() {
        for (const accessoryUuid of this.mqttClients.keys()) {
            this.disconnectMqttClient(accessoryUuid);
        }
    }
    isDpsPayload(payload) {
        if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
            return false;
        }
        const payloadData = payload.data;
        if (typeof payloadData !== 'object' || payloadData === null || Array.isArray(payloadData)) {
            return false;
        }
        return Object.values(payloadData).every((value) => typeof value === 'string');
    }
}
exports.EufyRobovacMatterPlatform = EufyRobovacMatterPlatform;
