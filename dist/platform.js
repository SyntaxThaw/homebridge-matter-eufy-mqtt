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
class EufyRobovacMatterPlatform {
    api;
    config;
    log;
    accessories = [];
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
    async discoverDevices() {
        this.log.info('Discovering Eufy devices...');
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
                let accessory = this.accessories.find(acc => acc.UUID === uuid);
                if (!accessory) {
                    accessory = new this.api.platformAccessory(device.device_name || 'Eufy RoboVac', uuid);
                    this.api.registerPlatformAccessories('homebridge-eufy-robovac-matter', 'EufyRobovacMatter', [accessory]);
                }
                const parser = new parser_1.StateParser(codec, this.log);
                const commandBuilder = new commands_1.CommandBuilder(codec);
                // Setup MQTT Client
                const mqttClient = new mqtt_1.EufyMqttClient(deviceId, deviceModel, userInfo.user_center_id || 'unknown_user', 'eufy_home', openudid, mqttConfig.certificate, mqttConfig.private_key, mqttConfig.domain || 'eufy', // sometimes username is domain
                mqttConfig.url || mqttConfig.domain || 'mqtt.eufylife.com', this.log);
                const handlers = new handlers_1.MatterCommandHandlers(commandBuilder, mqttClient, this.log);
                const identity = { deviceId, model: deviceModel, firmware: device.main_fw_version || '1.0' };
                const caps = { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true };
                const initialState = (0, models_1.createInitialState)(identity, caps);
                const accessoryHandler = new accessory_1.EufyRobovacAccessory(this.log.getRaw(), accessory, handlers, initialState);
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
        }
        catch (error) {
            this.log.error(`Device discovery failed: ${error.message}. Will retry on next Homebridge restart.`);
        }
    }
}
exports.EufyRobovacMatterPlatform = EufyRobovacMatterPlatform;
