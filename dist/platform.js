"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyRobovacMatterPlatform = void 0;
const config_1 = require("./config");
const logger_1 = require("./util/logger");
const codec_1 = require("./eufy/codec");
const parser_1 = require("./eufy/parser");
const commands_1 = require("./eufy/commands");
const handlers_1 = require("./matter/handlers");
const accessory_1 = require("./accessory");
const models_1 = require("./eufy/models");
const capabilities_1 = require("./eufy/capabilities");
const auth_1 = require("./eufy/auth");
const cloud_types_1 = require("./eufy/cloud-types");
const mappers_1 = require("./matter/mappers");
const device_session_1 = require("./device-session");
const PLUGIN_NAME = 'homebridge-eufy-robovac-matter';
const PLATFORM_NAME = 'EufyRobovacMatter';
class EufyRobovacMatterPlatform {
    api;
    config;
    log;
    accessories = [];
    activeAccessoryUuids = new Set();
    deviceSessions = new Map();
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
        // Load protobuf schemas from disk — fast (filesystem-only, no network).
        const codec = new codec_1.EufyCodec();
        try {
            await codec.loadSchemas();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log.error(`Failed to load protobuf schemas: ${message}. Plugin cannot decode device payloads — check proto files.`);
            return;
        }
        // ── Phase 1: restore cached accessories immediately ──────────────────────
        // For accessories already in the Homebridge cache we have everything we
        // need (serialNumber, model, firmware) stored on the accessory object.
        // Registering them with Matter NOW — before the Eufy cloud round-trips —
        // makes the bridge discoverable in Apple Home in milliseconds rather than
        // 30+ seconds later when cloud auth finally completes.
        const restoredHandlers = new Map();
        for (const accessory of this.accessories) {
            const meta = accessory;
            if (!meta.deviceType || !meta.serialNumber || !meta.model)
                continue;
            const deviceId = meta.serialNumber;
            const deviceModel = meta.model;
            const firmware = meta.firmwareRevision ?? '1.0';
            const uuid = this.api.hap.uuid.generate(deviceId);
            const caps = (0, capabilities_1.deriveCapabilitiesByModel)(deviceModel);
            const commandBuilder = new commands_1.CommandBuilder(codec);
            // MQTT client is null until Phase 2 provides credentials from the cloud.
            const handlers = new handlers_1.MatterCommandHandlers(commandBuilder, null, this.log, caps, this.config.defaultMode);
            const identity = { deviceId, model: deviceModel, firmware };
            const initialState = (0, models_1.createInitialState)(identity, caps);
            initialState.activity.cleanMode = this.config.defaultMode;
            initialState.activity.suctionLevel = this.config.defaultSuction;
            if (this.config.rooms.length > 0) {
                initialState.activity.availableRooms = this.config.rooms.map((r) => ({ id: r.id, name: r.name }));
            }
            const setupResult = await this.registerOrUpdateMatterAccessory(accessory, false, // already cached — not a new accessory
            handlers, caps, identity, () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.currentMapId, () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.paused ?? false);
            if (!setupResult.configured)
                continue;
            const accessoryHandler = new accessory_1.EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
                disableMatterStatePush: !setupResult.statePushSupported || this.config.disableMatterStatePush === true,
            });
            this.accessoryHandlers.set(uuid, accessoryHandler);
            restoredHandlers.set(uuid, handlers);
            this.log.debug(`Phase 1: restored cached Matter accessory ${accessory.displayName} (${deviceId})`);
        }
        // ── Phase 2: cloud auth + MQTT (runs after Matter is already advertising) ─
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
            const parser = new parser_1.StateParser(codec, this.log);
            this.log.info(`Provisioning ${devices.length} devices over MQTT...`);
            for (const device of devices) {
                const deviceId = device.device_sn;
                const deviceModel = device.device_model;
                const deviceName = this.getDeviceName(device);
                const uuid = this.api.hap.uuid.generate(deviceId);
                this.activeAccessoryUuids.add(uuid);
                let accessory = this.accessories.find(acc => acc.UUID === uuid);
                const isNewAccessory = !accessory;
                let handlers = restoredHandlers.get(uuid);
                if (isNewAccessory) {
                    // Device not in cache — register it now for the first time.
                    accessory = new this.api.platformAccessory(deviceName, uuid);
                    accessory.category = 1 /* this.api.hap.Categories.OTHER */;
                    const caps = (0, capabilities_1.deriveCapabilitiesByModel)(deviceModel);
                    const commandBuilder = new commands_1.CommandBuilder(codec);
                    handlers = new handlers_1.MatterCommandHandlers(commandBuilder, null, this.log, caps, this.config.defaultMode);
                    const identity = { deviceId, model: deviceModel, firmware: device.main_fw_version || '1.0' };
                    const initialState = (0, models_1.createInitialState)(identity, caps);
                    initialState.activity.cleanMode = this.config.defaultMode;
                    initialState.activity.suctionLevel = this.config.defaultSuction;
                    if (this.config.rooms.length > 0) {
                        initialState.activity.availableRooms = this.config.rooms.map((r) => ({ id: r.id, name: r.name }));
                    }
                    const setupResult = await this.registerOrUpdateMatterAccessory(accessory, true, handlers, caps, identity, () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.currentMapId, () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.paused ?? false);
                    if (!setupResult.configured) {
                        this.log.warn(`Skipping MQTT binding for ${deviceName}: Matter accessory setup failed.`);
                        continue;
                    }
                    if (this.config.disableMatterStatePush === true) {
                        this.log.warn(`Matter state push updates are disabled by config for ${deviceName}; command control still works but Home status can lag.`);
                    }
                    const accessoryHandler = new accessory_1.EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
                        disableMatterStatePush: !setupResult.statePushSupported || this.config.disableMatterStatePush === true,
                    });
                    this.accessoryHandlers.set(uuid, accessoryHandler);
                }
                // Wire the MQTT client via DeviceSession, which owns the message/event wiring.
                const accessoryHandler = this.accessoryHandlers.get(uuid);
                const session = new device_session_1.DeviceSession(deviceId, deviceModel, deviceName, handlers, accessoryHandler, parser, this.log);
                try {
                    await session.connect(userInfo.user_center_id, 'eufy_home', openudid, mqttConnection.settings, this.config.mqttReconnectMaxDelay);
                    this.deviceSessions.set(uuid, session);
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
            this.log.error(`Device discovery failed: ${message}. Cached accessories remain active but live state won't update until next restart.`);
        }
    }
    async registerOrUpdateMatterAccessory(accessory, isNewAccessory, handlers, capabilities, identity, getMapId = () => undefined, getIsPaused = () => false) {
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
                        await handlers.handleStartCommand(getIsPaused(), getMapId());
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
                    case 0x04:
                        await handlers.handleCleaningMode('SPOT_CLEAN');
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
                await handlers.handleRoomSelection(areas);
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
                supportedAreas: [],
                selectedAreas: [],
            },
            powerSource: {
                batPercentRemaining: mappers_1.MatterMappers.mapBatteryLevel(initialMatterState.power.batteryPercent),
                batChargeState: mappers_1.MatterMappers.mapChargeState(initialMatterState.power),
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
            const isMatter = !!accessory.deviceType;
            if (isMatter && matterApi?.unregisterPlatformAccessories) {
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
        const session = this.deviceSessions.get(accessoryUuid);
        if (session) {
            session.dispose();
            this.deviceSessions.delete(accessoryUuid);
        }
        else {
            // Accessory may have been restored in Phase 1 without a session (no MQTT yet)
            const accessoryHandler = this.accessoryHandlers.get(accessoryUuid);
            accessoryHandler?.dispose();
        }
        this.accessoryHandlers.delete(accessoryUuid);
    }
    disconnectAllMqttClients() {
        for (const accessoryUuid of [...this.deviceSessions.keys(), ...this.accessoryHandlers.keys()]) {
            this.disconnectMqttClient(accessoryUuid);
        }
    }
}
exports.EufyRobovacMatterPlatform = EufyRobovacMatterPlatform;
