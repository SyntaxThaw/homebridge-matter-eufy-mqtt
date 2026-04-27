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
class EufyRobovacMatterPlatform {
    api;
    config;
    log;
    accessories = [];
    activeAccessoryUuids = new Set();
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
            this.discoverDevices();
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
        try {
            const authManager = new (require('./eufy/auth')).EufyAuthManager(this.config.username, this.config.password, this.log);
            const { devices, mqttConfig, userInfo, openudid } = await authManager.connectAndFetchDevices();
            if (!devices || devices.length === 0) {
                this.log.warn('No Eufy devices found under this account.');
                return;
            }
            const codec = new codec_1.EufyCodec();
            await codec.loadSchemas();
            this.log.info(`Provisioning ${devices.length} devices over MQTT...`);
            this.log.info(`MQTT Config keys available:`, Object.keys(mqttConfig).join(', '));
            for (const device of devices) {
                const deviceId = device.device_sn;
                const deviceModel = device.device_model;
                const uuid = this.api.hap.uuid.generate(deviceId);
                this.log.info(`[DEBUG] Generated UUID for ${deviceId}: ${uuid}`);
                this.activeAccessoryUuids.add(uuid);
                let accessory = this.accessories.find(acc => acc.UUID === uuid);
                const isNewAccessory = !accessory;
                if (isNewAccessory) {
                    this.log.info(`[DEBUG] Accessory not found in cache, creating new accessory for ${device.device_name || 'Eufy RoboVac'}`);
                    accessory = new this.api.platformAccessory(device.device_name || 'Eufy RoboVac', uuid);
                    accessory.category = 1 /* this.api.hap.Categories.OTHER */;
                }
                else {
                    this.log.info(`[DEBUG] Accessory found in cache! UUID: ${accessory.UUID}`);
                }
                const parser = new parser_1.StateParser(codec, this.log);
                const commandBuilder = new commands_1.CommandBuilder(codec);
                // Setup MQTT Client
                const mqttClient = new mqtt_1.EufyMqttClient(deviceId, deviceModel, userInfo.user_center_id || 'unknown_user', 'eufy_home', openudid, mqttConfig.certificate_pem || mqttConfig.certificate, mqttConfig.private_key, mqttConfig.thing_name || mqttConfig.username || 'eufy', // Eufy usually uses thing_name as username for AWS IoT
                mqttConfig.endpoint_addr || mqttConfig.url || mqttConfig.domain || 'mqtt.eufylife.com', this.log);
                const caps = (0, capabilities_1.deriveCapabilitiesByModel)(deviceModel);
                const handlers = new handlers_1.MatterCommandHandlers(commandBuilder, mqttClient, this.log, caps);
                const identity = { deviceId, model: deviceModel, firmware: device.main_fw_version || '1.0' };
                const initialState = (0, models_1.createInitialState)(identity, caps);
                this.log.info(`[DEBUG] Initializing EufyRobovacAccessory handler...`);
                const accessoryHandler = new accessory_1.EufyRobovacAccessory(this.log.getRaw(), accessory, handlers, initialState, this.api);
                await this.registerOrUpdateMatterAccessory(accessory, isNewAccessory, handlers);
                mqttClient.on('message', (payload) => {
                    if (payload && payload.data) {
                        const currentState = accessoryHandler.getCurrentState();
                        const newState = parser.processDps(payload.data, currentState);
                        accessoryHandler.onStateUpdate(newState);
                    }
                });
                mqttClient.on('error', (err) => {
                    this.log.error('MQTT connection error caught in platform:', err.message);
                });
                await mqttClient.connect();
            }
            await this.cleanupStaleAccessories();
        }
        catch (error) {
            this.log.error(`Device discovery failed: ${error.message}. Will retry on next Homebridge restart.`);
        }
    }
    async registerOrUpdateMatterAccessory(accessory, isNewAccessory, handlers) {
        const matterApi = this.getMatterApi();
        const roboticVacuumType = matterApi?.deviceTypes?.RoboticVacuumCleaner;
        const matterConfig = {
            deviceType: roboticVacuumType,
            commandHandlers: {
                start: () => handlers.handleStartCommand(),
                stop: () => handlers.handleStopCommand(),
                pause: () => handlers.handlePauseCommand(),
                resume: () => handlers.handleResumeCommand(),
                goHome: () => handlers.handleGoHomeCommand(),
            },
        };
        if (matterApi?.configureAccessory) {
            await matterApi.configureAccessory(accessory, matterConfig);
        }
        else {
            this.log.warn('Matter configureAccessory API unavailable; using cached accessory fallback.');
        }
        if (isNewAccessory) {
            if (matterApi?.registerAccessory) {
                await matterApi.registerAccessory(accessory);
            }
            else {
                this.api.registerPlatformAccessories('homebridge-eufy-robovac-matter', 'EufyRobovacMatter', [accessory]);
            }
            this.accessories.push(accessory);
            this.log.info(`[DEBUG] Successfully registered new accessory: ${accessory.displayName}`);
            return;
        }
        if (matterApi?.updateAccessory) {
            await matterApi.updateAccessory(accessory);
        }
        else {
            this.api.updatePlatformAccessories([accessory]);
        }
    }
    async cleanupStaleAccessories() {
        const stale = this.accessories.filter(accessory => !this.activeAccessoryUuids.has(accessory.UUID));
        if (stale.length === 0) {
            return;
        }
        this.log.warn(`Found ${stale.length} stale cached accessories. Removing to support model migration.`);
        const matterApi = this.getMatterApi();
        for (const accessory of stale) {
            if (matterApi?.unregisterAccessory) {
                await matterApi.unregisterAccessory(accessory);
            }
            else {
                this.api.unregisterPlatformAccessories('homebridge-eufy-robovac-matter', 'EufyRobovacMatter', [accessory]);
            }
            this.log.info(`Removed stale accessory from cache: ${accessory.displayName}`);
        }
    }
}
exports.EufyRobovacMatterPlatform = EufyRobovacMatterPlatform;
