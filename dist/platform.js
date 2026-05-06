"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyRobovacMatterPlatform = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
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
const clusters_1 = require("./matter/clusters");
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
    /** Retained so handleRoomsDiscovered can attempt runtime ServiceArea re-wiring. */
    deviceMeta = new Map();
    constructor(log, config, api) {
        this.api = api;
        this.log = new logger_1.Logger(log, 'EufyPlatform');
        this.config = (0, config_1.parsePlatformConfig)(config);
        this.log.debug('Finished initializing platform:', this.config.name);
        if (!this.config.username || !this.config.password) {
            this.log.error('Missing username or password in config. Cannot start plugin.');
            return;
        }
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
            const handlers = new handlers_1.MatterCommandHandlers(commandBuilder, null, this.log, caps, this.config.defaultMode);
            const identity = { deviceId, model: deviceModel, firmware };
            const initialState = (0, models_1.createInitialState)(identity, caps);
            initialState.activity.cleanMode = this.config.defaultMode;
            initialState.activity.suctionLevel = this.config.defaultSuction;
            const sidecarRooms = this.readRoomsFromSidecar(uuid);
            const persistedRooms = sidecarRooms ?? this.readRoomsFromContext(accessory);
            const configuredRooms = this.config.rooms.length > 0
                ? this.config.rooms.map((r) => ({ id: r.id, name: r.name }))
                : undefined;
            const initialRooms = configuredRooms ?? persistedRooms;
            if (initialRooms && initialRooms.length > 0) {
                initialState.activity.availableRooms = initialRooms;
            }
            const setupResult = await this.registerOrUpdateMatterAccessory(accessory, false, handlers, caps, identity, initialState.activity.availableRooms, () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.currentMapId, () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.paused ?? false);
            if (!setupResult.configured)
                continue;
            const accessoryHandler = new accessory_1.EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
                disableMatterStatePush: !setupResult.statePushSupported || this.config.disableMatterStatePush === true,
                serviceAreaActive: setupResult.serviceAreaActive,
                onRoomsDiscovered: (rooms) => this.handleRoomsDiscovered(uuid, rooms),
            });
            accessoryHandler.markRegistered();
            this.accessoryHandlers.set(uuid, accessoryHandler);
            restoredHandlers.set(uuid, handlers);
            this.deviceMeta.set(uuid, { handlers, capabilities: caps, identity });
            if (initialState.activity.availableRooms.length > 0) {
                this.log.info(`[Rooms] Phase 1: restored ${initialState.activity.availableRooms.length} rooms for ${accessory.displayName}: `
                    + initialState.activity.availableRooms.map((r) => `${r.name}(${r.id})`).join(', '));
            }
            this.log.info(`Phase 1: restored cached Matter accessory ${accessory.displayName} (${deviceId}); `
                + `serviceArea=${setupResult.serviceAreaActive ? 'enabled' : 'deferred (no rooms yet)'}`);
        }
        // ── Phase 2: cloud auth + MQTT ────────────────────────────────────────────
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
                    accessory = new this.api.platformAccessory(deviceName, uuid);
                    accessory.category = 1 /* this.api.hap.Categories.OTHER */;
                    const caps = (0, capabilities_1.deriveCapabilitiesByModel)(deviceModel);
                    const commandBuilder = new commands_1.CommandBuilder(codec);
                    handlers = new handlers_1.MatterCommandHandlers(commandBuilder, null, this.log, caps, this.config.defaultMode);
                    const identity = { deviceId, model: deviceModel, firmware: device.main_fw_version || '1.0' };
                    const initialState = (0, models_1.createInitialState)(identity, caps);
                    initialState.activity.cleanMode = this.config.defaultMode;
                    initialState.activity.suctionLevel = this.config.defaultSuction;
                    const sidecarRooms = this.readRoomsFromSidecar(uuid);
                    const persistedRooms = sidecarRooms ?? this.readRoomsFromContext(accessory);
                    const configuredRooms = this.config.rooms.length > 0
                        ? this.config.rooms.map((r) => ({ id: r.id, name: r.name }))
                        : undefined;
                    const initialRooms = configuredRooms ?? persistedRooms;
                    if (initialRooms && initialRooms.length > 0) {
                        initialState.activity.availableRooms = initialRooms;
                    }
                    const setupResult = await this.registerOrUpdateMatterAccessory(accessory, true, handlers, caps, identity, initialState.activity.availableRooms, () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.currentMapId, () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.paused ?? false);
                    if (!setupResult.configured) {
                        this.log.warn(`Skipping MQTT binding for ${deviceName}: Matter accessory setup failed.`);
                        continue;
                    }
                    if (this.config.disableMatterStatePush === true) {
                        this.log.warn(`Matter state push updates are disabled by config for ${deviceName}; command control still works but Home status can lag.`);
                    }
                    const accessoryHandler = new accessory_1.EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
                        disableMatterStatePush: !setupResult.statePushSupported || this.config.disableMatterStatePush === true,
                        serviceAreaActive: setupResult.serviceAreaActive,
                        onRoomsDiscovered: (rooms) => this.handleRoomsDiscovered(uuid, rooms),
                    });
                    accessoryHandler.markRegistered();
                    this.accessoryHandlers.set(uuid, accessoryHandler);
                    this.deviceMeta.set(uuid, { handlers: handlers, capabilities: caps, identity });
                }
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
    /**
     * Configures matter metadata (handlers + clusters) on the accessory and
     * registers/updates it with Homebridge. ServiceArea behavior is only
     * attached when room data is available — registering it with empty
     * supportedAreas crashes ServiceAreaServer#assertSupportedMaps.
     */
    async registerOrUpdateMatterAccessory(accessory, isNewAccessory, handlers, capabilities, identity, availableRooms, getMapId = () => undefined, getIsPaused = () => false) {
        const matterApi = this.getMatterApi();
        const roboticVacuumType = matterApi?.deviceTypes?.RoboticVacuumCleaner;
        if (!roboticVacuumType) {
            this.log.error('Matter device type RoboticVacuumCleaner is unavailable; cannot register accessory as vacuum.');
            return { configured: false, statePushSupported: false, serviceAreaActive: false };
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
        if (availableRooms.length > 0) {
            initialMatterState.activity.availableRooms = availableRooms;
        }
        const serviceAreaPayload = clusters_1.MatterClusterMapper.buildServiceArea(initialMatterState);
        const serviceAreaActive = serviceAreaPayload !== undefined;
        const matterAccessory = accessory;
        matterAccessory.deviceType = roboticVacuumType;
        matterAccessory.serialNumber = identity.deviceId;
        matterAccessory.manufacturer = 'Eufy';
        matterAccessory.model = identity.model;
        matterAccessory.firmwareRevision = identity.firmware;
        const accessoryHandlers = {
            rvcRunMode: runModeHandlers,
            rvcCleanMode: cleanModeHandlers,
            rvcOperationalState: operationalHandlers,
        };
        const clusters = {
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
            powerSource: {
                batPercentRemaining: mappers_1.MatterMappers.mapBatteryLevel(initialMatterState.power.batteryPercent),
                batChargeState: mappers_1.MatterMappers.mapChargeState(initialMatterState.power),
            },
        };
        if (serviceAreaPayload) {
            accessoryHandlers.serviceArea = {
                selectAreas: wrapHandler('serviceArea.selectAreas', async (request) => {
                    const areas = Array.isArray(request?.newAreas)
                        ? request.newAreas.filter((area) => Number.isFinite(area))
                        : [];
                    if (areas.length === 0)
                        return;
                    await handlers.handleRoomSelection(areas);
                }),
            };
            clusters.serviceArea = serviceAreaPayload;
        }
        matterAccessory.handlers = accessoryHandlers;
        matterAccessory.clusters = clusters;
        if (matterApi?.configureMatterAccessory) {
            try {
                matterApi.configureMatterAccessory(accessory);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.log.error(`Matter behavior configuration failed for ${accessory.displayName}: ${message}. `
                    + 'Skipping registration to avoid stale undead accessory.');
                return { configured: false, statePushSupported: false, serviceAreaActive: false };
            }
        }
        else {
            this.log.debug('Matter configureMatterAccessory API unavailable on this Homebridge build; using direct metadata assignment.');
        }
        const statePushSupported = true;
        if (matterApi?.registerPlatformAccessories) {
            try {
                if (isNewAccessory) {
                    await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                    this.accessories.push(accessory);
                    this.log.info(`Registered Matter accessory: ${accessory.displayName} `
                        + `(serviceArea=${serviceAreaActive ? `${availableRooms.length} rooms` : 'disabled'})`);
                }
                else if (matterApi.updatePlatformAccessories) {
                    await matterApi.updatePlatformAccessories([accessory]);
                    this.log.debug(`Updated cached Matter accessory metadata: ${accessory.displayName} `
                        + `(serviceArea=${serviceAreaActive ? `${availableRooms.length} rooms` : 'disabled'})`);
                }
                else {
                    await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                    this.log.debug(`Re-registered cached Matter accessory for current session: ${accessory.displayName}`);
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.log.error(`Matter registration failed for ${accessory.displayName}: ${message}`);
                return { configured: false, statePushSupported: false, serviceAreaActive: false };
            }
            return { configured: true, statePushSupported, serviceAreaActive };
        }
        if (isNewAccessory) {
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            this.accessories.push(accessory);
            this.log.info(`Registered Homebridge accessory: ${accessory.displayName}`);
        }
        else {
            this.api.updatePlatformAccessories([accessory]);
        }
        return { configured: true, statePushSupported, serviceAreaActive };
    }
    /**
     * Called when DPS 165 first delivers a non-empty room list.
     *
     * 1. Persists rooms to accessory.context so ServiceArea is available on next restart.
     * 2. Attempts to re-configure the Matter accessory with ServiceArea in the current
     *    session — this works when homebridge-matter supports updating live behaviors.
     *    If configureMatterAccessory throws (e.g., behavior already frozen), the error is
     *    swallowed and the restart path acts as fallback.
     */
    handleRoomsDiscovered(uuid, rooms) {
        const accessory = this.accessories.find((acc) => acc.UUID === uuid);
        if (!accessory)
            return;
        this.log.info(`[Rooms] Discovered ${rooms.length} rooms for ${accessory.displayName}: `
            + rooms.map((r) => `${r.name}(${r.id})`).join(', '));
        const previouslyPersisted = this.readRoomsFromSidecar(uuid) ?? this.readRoomsFromContext(accessory);
        if (!this.roomsEqual(previouslyPersisted, rooms)) {
            // Update accessory.context for the current session. We deliberately do
            // NOT call matterApi.updatePlatformAccessories here: Homebridge core's
            // matter server (server.js:96 — `this.accessories.set(uuid, internal)`)
            // overwrites the registered wrapper that holds `endpoint`, `_parts`,
            // and `_eventEmitter`, which permanently breaks every subsequent
            // updateAccessoryState call with "Accessory ... not registered or
            // missing endpoint". See the upstream tracking issue. Until that's
            // fixed in core, persist rooms to a sidecar JSON in the plugin's
            // persistPath so they survive restarts without poisoning the matter
            // accessory registry.
            this.writeRoomsToContext(accessory, rooms);
            this.writeRoomsToSidecar(uuid, rooms);
            this.log.info(`[Rooms] Persisted ${rooms.length} rooms for ${accessory.displayName} to ${this.roomsSidecarPath(uuid)}.`);
        }
        // ── Attempt live ServiceArea activation in the current session ────────────
        const accessoryHandler = this.accessoryHandlers.get(uuid);
        const meta = this.deviceMeta.get(uuid);
        if (!accessoryHandler || !meta)
            return;
        // Build the serviceArea payload for the newly discovered rooms.
        const tempState = (0, models_1.createInitialState)(meta.identity, meta.capabilities);
        tempState.activity.availableRooms = rooms;
        const serviceAreaPayload = clusters_1.MatterClusterMapper.buildServiceArea(tempState);
        if (!serviceAreaPayload)
            return;
        // Wire handlers and cluster metadata onto the accessory object, then try to
        // (re-)configure behaviors. If the Matter runtime allows late registration this
        // will activate rooms immediately; otherwise it's a no-op and the next restart
        // picks them up via the persisted context.
        const matterAccessory = accessory;
        if (!matterAccessory.handlers)
            matterAccessory.handlers = {};
        if (!matterAccessory.clusters)
            matterAccessory.clusters = {};
        matterAccessory.handlers.serviceArea = {
            selectAreas: async (request) => {
                const areas = Array.isArray(request?.newAreas)
                    ? request.newAreas.filter((area) => Number.isFinite(area))
                    : [];
                if (areas.length === 0)
                    return;
                this.log.debug(`[Rooms] ServiceArea selectAreas (runtime-wired): [${areas.join(', ')}]`);
                await meta.handlers.handleRoomSelection(areas);
            },
        };
        matterAccessory.clusters.serviceArea = serviceAreaPayload;
        const matterApi = this.getMatterApi();
        let serviceAreaLiveConfigured = false;
        if (matterApi?.configureMatterAccessory) {
            try {
                matterApi.configureMatterAccessory(accessory);
                serviceAreaLiveConfigured = true;
                this.log.info(`[Rooms] ServiceArea re-configured live for ${accessory.displayName} with ${rooms.length} rooms.`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.log.info(`[Rooms] Live ServiceArea re-configuration not supported (${message}); `
                    + 'rooms will be selectable after next Homebridge restart.');
            }
        }
        // Only flip the gate when the cluster was successfully attached at runtime.
        // Without a live cluster registration, pushing ServiceArea state causes
        // "not registered or missing endpoint" errors from the Matter runtime.
        if (serviceAreaLiveConfigured) {
            accessoryHandler.activateServiceArea();
        }
    }
    readRoomsFromContext(accessory) {
        const ctx = accessory.context;
        if (!ctx || !Array.isArray(ctx.rooms))
            return undefined;
        const filtered = ctx.rooms.filter((r) => typeof r === 'object' && r !== null && typeof r.id === 'string' && typeof r.name === 'string');
        return filtered.length > 0 ? filtered : undefined;
    }
    writeRoomsToContext(accessory, rooms) {
        const ctx = accessory.context ?? {};
        ctx.rooms = rooms.map((r) => ({ id: r.id, name: r.name }));
        accessory.context = ctx;
    }
    roomsSidecarPath(uuid) {
        return path.join(this.api.user.persistPath(), `eufy-robovac-matter-rooms-${uuid}.json`);
    }
    readRoomsFromSidecar(uuid) {
        const file = this.roomsSidecarPath(uuid);
        let raw;
        try {
            raw = fs.readFileSync(file, 'utf8');
        }
        catch (error) {
            const code = error?.code;
            if (code === 'ENOENT')
                return undefined;
            this.log.warn(`[Rooms] Failed to read rooms sidecar ${file}: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed.rooms))
                return undefined;
            const filtered = parsed.rooms.filter((r) => typeof r === 'object' && r !== null
                && typeof r.id === 'string'
                && typeof r.name === 'string');
            return filtered.length > 0 ? filtered : undefined;
        }
        catch (error) {
            this.log.warn(`[Rooms] Failed to parse rooms sidecar ${file}: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
    writeRoomsToSidecar(uuid, rooms) {
        const file = this.roomsSidecarPath(uuid);
        const payload = JSON.stringify({ rooms: rooms.map((r) => ({ id: r.id, name: r.name })) });
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, payload, 'utf8');
        }
        catch (error) {
            this.log.warn(`[Rooms] Failed to write rooms sidecar ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    roomsEqual(a, b) {
        if (!a || a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i].id !== b[i].id || a[i].name !== b[i].name)
                return false;
        }
        return true;
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
