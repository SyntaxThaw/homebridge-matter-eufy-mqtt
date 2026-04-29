"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyRobovacMatterPlatform = void 0;
const config_1 = require("./config");
const logger_1 = require("./util/logger");
const codec_1 = require("./eufy/codec");
const parser_1 = require("./eufy/parser");
const client_1 = require("./eufy/client");
const commands_1 = require("./eufy/commands");
const handlers_1 = require("./matter/handlers");
const accessory_1 = require("./accessory");
const models_1 = require("./eufy/models");
const capabilities_1 = require("./eufy/capabilities");
const auth_1 = require("./eufy/auth");
const cloud_types_1 = require("./eufy/cloud-types");
const mappers_1 = require("./matter/mappers");
const PLUGIN_NAME = 'homebridge-eufy-robovac-matter';
const PLATFORM_NAME = 'EufyRobovacMatter';
class EufyRobovacMatterPlatform {
    api;
    config;
    log;
    accessories = [];
    activeAccessoryUuids = new Set();
    mqttClients = new Map();
    accessoryHandlers = new Map();
    constructor(log, config, api) {
        this.api = api;
        this.log = new logger_1.Logger(log, 'EufyPlatform');
        this.config = (0, config_1.parsePlatformConfig)(config);
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
        const matterApi = this.getMatterApi();
        if (matterApi?.isMatterAvailable && !matterApi.isMatterAvailable()) {
            this.log.error('Matter API is unavailable in this Homebridge runtime. Requires Homebridge >= 2.0.0-beta.0.');
            return;
        }
        if (matterApi?.isMatterEnabled && !matterApi.isMatterEnabled()) {
            this.log.warn('Matter is disabled for this bridge. Enable bridge.matter or _bridge.matter to expose accessories.');
            return;
        }
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
                const mqttClient = new client_1.EufyMqttClient(deviceId, deviceModel, userInfo.user_center_id, 'eufy_home', openudid, mqttConnection.settings.certificatePem, mqttConnection.settings.privateKey, mqttConnection.settings.username, mqttConnection.settings.endpoint, this.log, { reconnectMaxDelayMs: this.config.mqttReconnectMaxDelay });
                const caps = (0, capabilities_1.deriveCapabilitiesByModel)(deviceModel);
                const handlers = new handlers_1.MatterCommandHandlers(commandBuilder, mqttClient, this.log, caps);
                const identity = { deviceId, model: deviceModel, firmware: device.main_fw_version || '1.0' };
                const initialState = (0, models_1.createInitialState)(identity, caps);
                initialState.activity.cleanMode = this.config.defaultMode;
                initialState.activity.suctionLevel = this.config.defaultSuction;
                if (this.config.rooms.length > 0) {
                    initialState.activity.availableRooms = this.config.rooms.map((room) => ({ id: room.id, name: room.name }));
                }
                const setupResult = await this.registerOrUpdateMatterAccessory(accessory, isNewAccessory, handlers, caps, identity, () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.currentMapId);
                if (!setupResult.configured) {
                    this.log.warn(`Skipping MQTT binding for ${device.device_name || deviceId}: Matter accessory setup failed.`);
                    continue;
                }
                if (this.config.disableMatterStatePush === true) {
                    this.log.warn(`Matter state push updates are disabled by config for ${deviceName}; command control still works but Home status can lag.`);
                }
                const accessoryHandler = new accessory_1.EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
                    disableMatterStatePush: !setupResult.statePushSupported || this.config.disableMatterStatePush === true,
                });
                this.accessoryHandlers.set(uuid, accessoryHandler);
                mqttClient.on('message', (payload) => {
                    if (this.isDpsPayload(payload)) {
                        const currentState = accessoryHandler.getCurrentState();
                        const newState = parser.processDps(payload.data, currentState);
                        accessoryHandler.onStateUpdate(newState);
                    }
                    else {
                        this.log.debug(`Non-DPS MQTT payload (keys: ${Object.keys(payload).join(', ')}): ${JSON.stringify(payload).substring(0, 150)}`);
                    }
                });
                mqttClient.on('connected', () => {
                    this.log.info(`MQTT connected for ${deviceName}. Requesting device status...`);
                    void mqttClient.requestStatus().catch((err) => {
                        this.log.warn(`Device status request failed for ${deviceName}: ${String(err)}`);
                    });
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
    async registerOrUpdateMatterAccessory(accessory, isNewAccessory, handlers, capabilities, identity, getMapId = () => undefined) {
        const matterApi = this.getMatterApi();
        const roboticVacuumType = matterApi?.deviceTypes?.RoboticVacuumCleaner;
        if (!roboticVacuumType) {
            this.log.error('Matter device type RoboticVacuumCleaner is unavailable; cannot register accessory as vacuum.');
            return { configured: false, statePushSupported: false };
        }
        const wrapHandler = (name, fn) => {
            return async (...args) => {
                this.log.debug(`Matter command received: ${name}`);
                try {
                    await fn(...args);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.log.error(`Matter command ${name} failed: ${message}`);
                    throw error;
                }
            };
        };
        const operationalHandlers = {};
        const runModeHandlers = {
            changeToMode: wrapHandler('rvcRunMode.changeToMode', async (request) => {
                switch (request?.newMode) {
                    case 0x00:
                        await handlers.handleStopCommand();
                        return;
                    case 0x01:
                        await handlers.handleStartCommand();
                        return;
                    case 0x02:
                        await handlers.handleGoHomeCommand();
                        return;
                    default:
                        this.log.warn(`Unsupported Matter RvcRunMode changeToMode value: ${String(request?.newMode)}`);
                }
            }),
        };
        const cleanModeHandlers = {
            changeToMode: wrapHandler('rvcCleanMode.changeToMode', async (request) => {
                switch (request?.newMode) {
                    case 0x00:
                        await handlers.handleCleaningMode('AUTO');
                        return;
                    case 0x01:
                        await handlers.handleCleaningMode('VACUUM_ONLY');
                        return;
                    case 0x02:
                        await handlers.handleCleaningMode('MOP_ONLY');
                        return;
                    case 0x03:
                        await handlers.handleCleaningMode('VACUUM_AND_MOP');
                        return;
                    default:
                        this.log.warn(`Unsupported Matter RvcCleanMode changeToMode value: ${String(request?.newMode)}`);
                }
            }),
        };
        const serviceAreaHandlers = {
            selectAreas: wrapHandler('serviceArea.selectAreas', async (request) => {
                const areas = Array.isArray(request?.newAreas)
                    ? request.newAreas.filter((area) => Number.isFinite(area))
                    : [];
                if (areas.length === 0) {
                    return;
                }
                await handlers.handleRoomSelection(areas, getMapId());
            }),
        };
        if (capabilities.supportsPause) {
            operationalHandlers.pause = wrapHandler('rvcOperationalState.pause', () => handlers.handlePauseCommand());
        }
        if (capabilities.supportsResume) {
            operationalHandlers.resume = wrapHandler('rvcOperationalState.resume', () => handlers.handleResumeCommand());
        }
        if (capabilities.supportsGoHome) {
            operationalHandlers.goHome = wrapHandler('rvcOperationalState.goHome', () => handlers.handleGoHomeCommand());
        }
        const initialMatterState = (0, models_1.createInitialState)(identity, capabilities);
        const matterAccessory = accessory;
        matterAccessory.deviceType = roboticVacuumType;
        matterAccessory.serialNumber = identity.deviceId;
        matterAccessory.manufacturer = 'Eufy';
        matterAccessory.model = identity.model;
        matterAccessory.firmwareRevision = identity.firmware;
        matterAccessory.handlers = {
            rvcRunMode: runModeHandlers,
            rvcCleanMode: cleanModeHandlers,
            rvcOperationalState: operationalHandlers,
            serviceArea: serviceAreaHandlers,
        };
        matterAccessory.clusters = {
            rvcRunMode: {
                supportedModes: mappers_1.MatterMappers.getSupportedRunModes(),
                currentMode: mappers_1.MatterMappers.mapRvcRunMode(initialMatterState),
            },
            rvcCleanMode: {
                supportedModes: mappers_1.MatterMappers.getSupportedCleanModes(),
                currentMode: mappers_1.MatterMappers.mapRvcCleanMode(initialMatterState.activity.cleanMode),
            },
            rvcOperationalState: {
                operationalStateList: mappers_1.MatterMappers.getOperationalStateList(),
                operationalState: mappers_1.MatterMappers.mapOperationalState(initialMatterState),
                operationalError: mappers_1.MatterMappers.mapOperationalError(initialMatterState),
            },
            serviceArea: {
                supportedMaps: [],
                supportedAreas: [],
                selectedAreas: [],
            },
            powerSource: {
                batPercentRemaining: mappers_1.MatterMappers.mapBatteryLevel(initialMatterState.power.batteryPercent),
                batChargeState: mappers_1.MatterMappers.mapChargeState(initialMatterState.power.charging),
            },
        };
        const statePushSupported = true;
        if (matterApi?.configureMatterAccessory) {
            matterApi.configureMatterAccessory(accessory);
        }
        else {
            this.log.debug('Matter configureMatterAccessory API unavailable on this Homebridge build; using direct metadata assignment.');
        }
        if (matterApi?.registerPlatformAccessories) {
            if (isNewAccessory) {
                await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                this.accessories.push(accessory);
                this.log.info(`Registered Matter accessory: ${accessory.displayName}`);
            }
            else if (matterApi.updatePlatformAccessories) {
                await matterApi.updatePlatformAccessories([accessory]);
                this.log.debug(`Updated cached Matter accessory metadata: ${accessory.displayName}`);
            }
            else {
                await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                this.log.debug(`Re-registered cached Matter accessory for current session: ${accessory.displayName}`);
            }
            return { configured: true, statePushSupported };
        }
        if (isNewAccessory) {
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            this.accessories.push(accessory);
            this.log.info(`Registered Homebridge accessory: ${accessory.displayName}`);
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
        const accessoryHandler = this.accessoryHandlers.get(accessoryUuid);
        accessoryHandler?.dispose();
        this.accessoryHandlers.delete(accessoryUuid);
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
        // Coerce all values to strings so number/boolean DPS values are handled.
        const raw = payloadData;
        const coerced = {};
        for (const [k, v] of Object.entries(raw)) {
            if (v === null || v === undefined)
                continue;
            coerced[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
        // Mutate in place so the type cast holds downstream.
        Object.assign(payloadData, coerced);
        return true;
    }
}
exports.EufyRobovacMatterPlatform = EufyRobovacMatterPlatform;
