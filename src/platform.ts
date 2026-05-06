import { API, DynamicPlatformPlugin, Logger as HomebridgeLogger, PlatformConfig } from 'homebridge';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EufyPlatformConfig, parsePlatformConfig } from './config';
import { Logger } from './util/logger';
import { EufyCodec } from './eufy/codec';
import { StateParser } from './eufy/parser';
import { CommandBuilder } from './eufy/commands';
import { MatterCommandHandlers } from './matter/handlers';
import { EufyRobovacAccessory } from './accessory';
import { createInitialState, Identity, EufyCapabilities, RoomInfo } from './eufy/models';
import { PlatformAccessory } from 'homebridge';
import { deriveCapabilitiesByModel } from './eufy/capabilities';
import { EufyAuthManager } from './eufy/auth';
import { EufyDevice, resolveMqttConnectionSettings } from './eufy/cloud-types';
import { MatterMappers } from './matter/mappers';
import { MatterClusterMapper } from './matter/clusters';
import { DeviceSession } from './device-session';

const PLUGIN_NAME = 'homebridge-eufy-robovac-matter';
const PLATFORM_NAME = 'EufyRobovacMatter';

type MatterPlatformApi = {
  isMatterAvailable?: () => boolean;
  isMatterEnabled?: () => boolean;
  configureMatterAccessory?: (accessory: PlatformAccessory) => void;
  registerPlatformAccessories?: (
    pluginName: string,
    platformName: string,
    accessories: PlatformAccessory[]
  ) => Promise<void>;
  updatePlatformAccessories?: (accessories: PlatformAccessory[]) => Promise<void>;
  unregisterPlatformAccessories?: (
    pluginName: string,
    platformName: string,
    accessories: PlatformAccessory[]
  ) => Promise<void>;
  deviceTypes?: { RoboticVacuumCleaner?: unknown };
};

type MatterAccessoryMetadata = {
  deviceType?: unknown;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  firmwareRevision?: string;
  handlers?: Record<string, Record<string, unknown>>;
  clusters?: Record<string, Record<string, unknown>>;
};

interface AccessoryContextShape {
  rooms?: RoomInfo[];
}

/** Per-device metadata retained for runtime ServiceArea re-wiring. */
type DeviceRegistrationMeta = {
  handlers: import('./matter/handlers').MatterCommandHandlers;
  capabilities: EufyCapabilities;
  identity: Identity;
};

export class EufyRobovacMatterPlatform implements DynamicPlatformPlugin {
  private readonly config: EufyPlatformConfig;
  private readonly log: Logger;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly activeAccessoryUuids: Set<string> = new Set();
  private readonly deviceSessions = new Map<string, DeviceSession>();
  private readonly accessoryHandlers = new Map<string, EufyRobovacAccessory>();
  /** Retained so handleRoomsDiscovered can attempt runtime ServiceArea re-wiring. */
  private readonly deviceMeta = new Map<string, DeviceRegistrationMeta>();

  constructor(
    log: HomebridgeLogger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log = new Logger(log, 'EufyPlatform');
    this.config = parsePlatformConfig(config);

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

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private getMatterApi(): MatterPlatformApi | undefined {
    return (this.api as unknown as { matter?: MatterPlatformApi }).matter;
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

    const codec = new EufyCodec();
    try {
      await codec.loadSchemas();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error(`Failed to load protobuf schemas: ${message}. Plugin cannot decode device payloads — check proto files.`);
      return;
    }

    // ── Phase 1: restore cached accessories immediately ──────────────────────
    const restoredHandlers = new Map<string, MatterCommandHandlers>();

    for (const accessory of this.accessories) {
      const meta = accessory as PlatformAccessory & MatterAccessoryMetadata;
      if (!meta.deviceType || !meta.serialNumber || !meta.model) continue;

      const deviceId = meta.serialNumber;
      const deviceModel = meta.model;
      const firmware = meta.firmwareRevision ?? '1.0';
      const uuid = this.api.hap.uuid.generate(deviceId);

      const caps = deriveCapabilitiesByModel(deviceModel);
      const commandBuilder = new CommandBuilder(codec);
      const handlers = new MatterCommandHandlers(commandBuilder, null, this.log, caps, this.config.defaultMode);
      const identity: Identity = { deviceId, model: deviceModel, firmware };

      const initialState = createInitialState(identity, caps);
      initialState.activity.cleanMode = this.config.defaultMode;
      initialState.activity.suctionLevel = this.config.defaultSuction as 1 | 2 | 3 | 4;

      const sidecarRooms = this.readRoomsFromSidecar(uuid);
      const persistedRooms = sidecarRooms ?? this.readRoomsFromContext(accessory);
      const configuredRooms: RoomInfo[] | undefined = this.config.rooms.length > 0
        ? this.config.rooms.map((r) => ({ id: r.id, name: r.name }))
        : undefined;
      const initialRooms = configuredRooms ?? persistedRooms;
      if (initialRooms && initialRooms.length > 0) {
        initialState.activity.availableRooms = initialRooms;
      }

      const setupResult = await this.registerOrUpdateMatterAccessory(
        accessory,
        false,
        handlers,
        caps,
        identity,
        initialState.activity.availableRooms,
        () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.currentMapId,
        () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.paused ?? false,
      );
      if (!setupResult.configured) continue;

      const accessoryHandler = new EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
        disableMatterStatePush: !setupResult.statePushSupported || this.config.disableMatterStatePush === true,
        serviceAreaActive: setupResult.serviceAreaActive,
        onRoomsDiscovered: (rooms) => this.handleRoomsDiscovered(uuid, rooms),
      });
      accessoryHandler.markRegistered();
      this.accessoryHandlers.set(uuid, accessoryHandler);
      restoredHandlers.set(uuid, handlers);
      this.deviceMeta.set(uuid, { handlers, capabilities: caps, identity });

      if (initialState.activity.availableRooms.length > 0) {
        this.log.info(
          `[Rooms] Phase 1: restored ${initialState.activity.availableRooms.length} rooms for ${accessory.displayName}: `
          + initialState.activity.availableRooms.map((r) => `${r.name}(${r.id})`).join(', '),
        );
      }
      this.log.info(
        `Phase 1: restored cached Matter accessory ${accessory.displayName} (${deviceId}); `
        + `serviceArea=${setupResult.serviceAreaActive ? 'enabled' : 'deferred (no rooms yet)'}`,
      );
    }

    // ── Phase 2: cloud auth + MQTT ────────────────────────────────────────────
    try {
      const authManager = new EufyAuthManager(
        this.config.username!,
        this.config.password!,
        this.log,
      );

      const { devices, mqttConfig, userInfo, openudid } = await authManager.connectAndFetchDevices();
      const mqttConnection = resolveMqttConnectionSettings(mqttConfig);
      if (!mqttConnection.settings) {
        throw new Error(
          `MQTT configuration from Eufy Cloud is incomplete: ${mqttConnection.missingFields.join(', ')}.`,
        );
      }

      if (!devices || devices.length === 0) {
        this.log.warn('No Eufy devices found under this account.');
        await this.cleanupStaleAccessories();
        return;
      }

      const parser = new StateParser(codec, this.log);

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
          accessory.category = this.api.hap.Categories.OTHER;

          const caps = deriveCapabilitiesByModel(deviceModel);
          const commandBuilder = new CommandBuilder(codec);
          handlers = new MatterCommandHandlers(commandBuilder, null, this.log, caps, this.config.defaultMode);
          const identity: Identity = { deviceId, model: deviceModel, firmware: device.main_fw_version || '1.0' };

          const initialState = createInitialState(identity, caps);
          initialState.activity.cleanMode = this.config.defaultMode;
          initialState.activity.suctionLevel = this.config.defaultSuction as 1 | 2 | 3 | 4;

          const sidecarRooms = this.readRoomsFromSidecar(uuid);
          const persistedRooms = sidecarRooms ?? this.readRoomsFromContext(accessory);
          const configuredRooms: RoomInfo[] | undefined = this.config.rooms.length > 0
            ? this.config.rooms.map((r) => ({ id: r.id, name: r.name }))
            : undefined;
          const initialRooms = configuredRooms ?? persistedRooms;
          if (initialRooms && initialRooms.length > 0) {
            initialState.activity.availableRooms = initialRooms;
          }

          const setupResult = await this.registerOrUpdateMatterAccessory(
            accessory,
            true,
            handlers,
            caps,
            identity,
            initialState.activity.availableRooms,
            () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.currentMapId,
            () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.paused ?? false,
          );
          if (!setupResult.configured) {
            this.log.warn(`Skipping MQTT binding for ${deviceName}: Matter accessory setup failed.`);
            continue;
          }
          if (this.config.disableMatterStatePush === true) {
            this.log.warn(
              `Matter state push updates are disabled by config for ${deviceName}; command control still works but Home status can lag.`,
            );
          }

          const accessoryHandler = new EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
            disableMatterStatePush: !setupResult.statePushSupported || this.config.disableMatterStatePush === true,
            serviceAreaActive: setupResult.serviceAreaActive,
            onRoomsDiscovered: (rooms) => this.handleRoomsDiscovered(uuid, rooms),
          });
          accessoryHandler.markRegistered();
          this.accessoryHandlers.set(uuid, accessoryHandler);
          this.deviceMeta.set(uuid, { handlers: handlers!, capabilities: caps, identity });
        }

        const accessoryHandler = this.accessoryHandlers.get(uuid)!;
        const session = new DeviceSession(
          deviceId, deviceModel, deviceName,
          handlers!, accessoryHandler, parser, this.log,
        );
        try {
          await session.connect(
            userInfo.user_center_id,
            'eufy_home',
            openudid,
            mqttConnection.settings,
            this.config.mqttReconnectMaxDelay,
          );
          this.deviceSessions.set(uuid, session);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.log.error(`Failed to connect MQTT for ${deviceName}: ${message}`);
        }
      }

      await this.cleanupStaleAccessories();
    } catch (error: unknown) {
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
  private async registerOrUpdateMatterAccessory(
    accessory: PlatformAccessory,
    isNewAccessory: boolean,
    handlers: MatterCommandHandlers,
    capabilities: EufyCapabilities,
    identity: Identity,
    availableRooms: RoomInfo[],
    getMapId: () => number | undefined = () => undefined,
    getIsPaused: () => boolean = () => false,
  ): Promise<{ configured: boolean; statePushSupported: boolean; serviceAreaActive: boolean }> {
    const matterApi = this.getMatterApi();
    const roboticVacuumType = matterApi?.deviceTypes?.RoboticVacuumCleaner;
    if (!roboticVacuumType) {
      this.log.error('Matter device type RoboticVacuumCleaner is unavailable; cannot register accessory as vacuum.');
      return { configured: false, statePushSupported: false, serviceAreaActive: false };
    }
    const wrapHandler = <T extends unknown[]>(name: string, fn: (...args: T) => Promise<void>): (...args: T) => Promise<void> => {
      return async (...args: T) => {
        this.log.debug(`Matter command received: ${name}`);
        try {
          await fn(...args);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.log.error(`Matter command ${name} failed: ${message}`);
          throw error;
        }
      };
    };

    const operationalHandlers: Record<string, () => Promise<void>> = {};
    const runModeHandlers: Record<string, (request?: { newMode?: number }) => Promise<void>> = {
      changeToMode: wrapHandler('rvcRunMode.changeToMode', async (request?: { newMode?: number }) => {
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
    const cleanModeHandlers: Record<string, (request?: { newMode?: number }) => Promise<void>> = {
      changeToMode: wrapHandler('rvcCleanMode.changeToMode', async (request?: { newMode?: number }) => {
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

    const initialMatterState = createInitialState(identity, capabilities);
    if (availableRooms.length > 0) {
      initialMatterState.activity.availableRooms = availableRooms;
    }
    const serviceAreaPayload = MatterClusterMapper.buildServiceArea(initialMatterState);
    const serviceAreaActive = serviceAreaPayload !== undefined;

    const matterAccessory = accessory as PlatformAccessory & MatterAccessoryMetadata;
    matterAccessory.deviceType = roboticVacuumType;
    matterAccessory.serialNumber = identity.deviceId;
    matterAccessory.manufacturer = 'Eufy';
    matterAccessory.model = identity.model;
    matterAccessory.firmwareRevision = identity.firmware;

    const accessoryHandlers: Record<string, Record<string, unknown>> = {
      rvcRunMode: runModeHandlers,
      rvcCleanMode: cleanModeHandlers,
      rvcOperationalState: operationalHandlers,
    };
    const clusters: Record<string, Record<string, unknown>> = {
      rvcRunMode: {
        supportedModes: MatterMappers.getSupportedRunModes(),
        currentMode: MatterMappers.mapRvcRunMode(initialMatterState),
      },
      rvcCleanMode: {
        supportedModes: MatterMappers.getSupportedCleanModes(),
        currentMode: MatterMappers.mapRvcCleanMode(initialMatterState.activity.cleanMode),
      },
      rvcOperationalState: {
        operationalStateList: MatterMappers.getOperationalStateList(),
        operationalState: MatterMappers.mapOperationalState(initialMatterState),
        operationalError: MatterMappers.mapOperationalError(initialMatterState),
      },
      powerSource: {
        batPercentRemaining: MatterMappers.mapBatteryLevel(initialMatterState.power.batteryPercent),
        batChargeState: MatterMappers.mapChargeState(initialMatterState.power),
      },
    };

    if (serviceAreaPayload) {
      accessoryHandlers.serviceArea = {
        selectAreas: wrapHandler('serviceArea.selectAreas', async (request?: { newAreas?: number[] }) => {
          const areas = Array.isArray(request?.newAreas)
            ? request.newAreas.filter((area): area is number => Number.isFinite(area))
            : [];
          if (areas.length === 0) return;
          await handlers.handleRoomSelection(areas);
        }),
      };
      clusters.serviceArea = serviceAreaPayload as unknown as Record<string, unknown>;
    }

    matterAccessory.handlers = accessoryHandlers;
    matterAccessory.clusters = clusters;

    if (matterApi?.configureMatterAccessory) {
      try {
        matterApi.configureMatterAccessory(accessory);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.error(
          `Matter behavior configuration failed for ${accessory.displayName}: ${message}. `
          + 'Skipping registration to avoid stale undead accessory.',
        );
        return { configured: false, statePushSupported: false, serviceAreaActive: false };
      }
    } else {
      this.log.debug(
        'Matter configureMatterAccessory API unavailable on this Homebridge build; using direct metadata assignment.',
      );
    }

    const statePushSupported = true;

    if (matterApi?.registerPlatformAccessories) {
      try {
        if (isNewAccessory) {
          await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.accessories.push(accessory);
          this.log.info(
            `Registered Matter accessory: ${accessory.displayName} `
            + `(serviceArea=${serviceAreaActive ? `${availableRooms.length} rooms` : 'disabled'})`,
          );
        } else if (matterApi.updatePlatformAccessories) {
          await matterApi.updatePlatformAccessories([accessory]);
          this.log.debug(
            `Updated cached Matter accessory metadata: ${accessory.displayName} `
            + `(serviceArea=${serviceAreaActive ? `${availableRooms.length} rooms` : 'disabled'})`,
          );
        } else {
          await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.log.debug(`Re-registered cached Matter accessory for current session: ${accessory.displayName}`);
        }
      } catch (error: unknown) {
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
    } else {
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
  private handleRoomsDiscovered(uuid: string, rooms: RoomInfo[]): void {
    const accessory = this.accessories.find((acc) => acc.UUID === uuid);
    if (!accessory) return;

    this.log.info(
      `[Rooms] Discovered ${rooms.length} rooms for ${accessory.displayName}: `
      + rooms.map((r) => `${r.name}(${r.id})`).join(', '),
    );

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
      this.log.info(
        `[Rooms] Persisted ${rooms.length} rooms for ${accessory.displayName} to ${this.roomsSidecarPath(uuid)}.`,
      );
    }

    // ── Attempt live ServiceArea activation in the current session ────────────
    const accessoryHandler = this.accessoryHandlers.get(uuid);
    const meta = this.deviceMeta.get(uuid);
    if (!accessoryHandler || !meta) return;

    // Build the serviceArea payload for the newly discovered rooms.
    const tempState = createInitialState(meta.identity, meta.capabilities);
    tempState.activity.availableRooms = rooms;
    const serviceAreaPayload = MatterClusterMapper.buildServiceArea(tempState);
    if (!serviceAreaPayload) return;

    // Wire handlers and cluster metadata onto the accessory object, then try to
    // (re-)configure behaviors. If the Matter runtime allows late registration this
    // will activate rooms immediately; otherwise it's a no-op and the next restart
    // picks them up via the persisted context.
    const matterAccessory = accessory as PlatformAccessory & MatterAccessoryMetadata;
    if (!matterAccessory.handlers) matterAccessory.handlers = {};
    if (!matterAccessory.clusters) matterAccessory.clusters = {};

    matterAccessory.handlers.serviceArea = {
      selectAreas: async (request?: { newAreas?: number[] }) => {
        const areas = Array.isArray(request?.newAreas)
          ? request.newAreas.filter((area): area is number => Number.isFinite(area))
          : [];
        if (areas.length === 0) return;
        this.log.debug(`[Rooms] ServiceArea selectAreas (runtime-wired): [${areas.join(', ')}]`);
        await meta.handlers.handleRoomSelection(areas);
      },
    };
    matterAccessory.clusters.serviceArea = serviceAreaPayload as unknown as Record<string, unknown>;

    const matterApi = this.getMatterApi();
    let serviceAreaLiveConfigured = false;
    if (matterApi?.configureMatterAccessory) {
      try {
        matterApi.configureMatterAccessory(accessory);
        serviceAreaLiveConfigured = true;
        this.log.info(
          `[Rooms] ServiceArea re-configured live for ${accessory.displayName} with ${rooms.length} rooms.`,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.info(
          `[Rooms] Live ServiceArea re-configuration not supported (${message}); `
          + 'rooms will be selectable after next Homebridge restart.',
        );
      }
    }

    // Only flip the gate when the cluster was successfully attached at runtime.
    // Without a live cluster registration, pushing ServiceArea state causes
    // "not registered or missing endpoint" errors from the Matter runtime.
    if (serviceAreaLiveConfigured) {
      accessoryHandler.activateServiceArea();
    }
  }

  private readRoomsFromContext(accessory: PlatformAccessory): RoomInfo[] | undefined {
    const ctx = accessory.context as AccessoryContextShape | undefined;
    if (!ctx || !Array.isArray(ctx.rooms)) return undefined;
    const filtered = ctx.rooms.filter((r): r is RoomInfo =>
      typeof r === 'object' && r !== null && typeof r.id === 'string' && typeof r.name === 'string',
    );
    return filtered.length > 0 ? filtered : undefined;
  }

  private writeRoomsToContext(accessory: PlatformAccessory, rooms: RoomInfo[]): void {
    const ctx = (accessory.context as AccessoryContextShape | undefined) ?? {};
    ctx.rooms = rooms.map((r) => ({ id: r.id, name: r.name }));
    accessory.context = ctx;
  }

  private roomsSidecarPath(uuid: string): string {
    return path.join(this.api.user.persistPath(), `eufy-robovac-matter-rooms-${uuid}.json`);
  }

  private readRoomsFromSidecar(uuid: string): RoomInfo[] | undefined {
    const file = this.roomsSidecarPath(uuid);
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') return undefined;
      this.log.warn(`[Rooms] Failed to read rooms sidecar ${file}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as { rooms?: unknown };
      if (!Array.isArray(parsed.rooms)) return undefined;
      const filtered = parsed.rooms.filter((r): r is RoomInfo =>
        typeof r === 'object' && r !== null
        && typeof (r as RoomInfo).id === 'string'
        && typeof (r as RoomInfo).name === 'string',
      );
      return filtered.length > 0 ? filtered : undefined;
    } catch (error: unknown) {
      this.log.warn(`[Rooms] Failed to parse rooms sidecar ${file}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private writeRoomsToSidecar(uuid: string, rooms: RoomInfo[]): void {
    const file = this.roomsSidecarPath(uuid);
    const payload = JSON.stringify({ rooms: rooms.map((r) => ({ id: r.id, name: r.name })) });
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, payload, 'utf8');
    } catch (error: unknown) {
      this.log.warn(`[Rooms] Failed to write rooms sidecar ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private roomsEqual(a: RoomInfo[] | undefined, b: RoomInfo[]): boolean {
    if (!a || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.id !== b[i]!.id || a[i]!.name !== b[i]!.name) return false;
    }
    return true;
  }

  private async cleanupStaleAccessories(): Promise<void> {
    const stale = this.accessories.filter(accessory => !this.activeAccessoryUuids.has(accessory.UUID));
    if (stale.length === 0) {
      return;
    }

    this.log.warn(`Found ${stale.length} stale cached accessories. Removing to support model migration.`);
    const matterApi = this.getMatterApi();
    for (const accessory of stale) {
      this.disconnectMqttClient(accessory.UUID);
      const isMatter = !!(accessory as MatterAccessoryMetadata).deviceType;
      if (isMatter && matterApi?.unregisterPlatformAccessories) {
        await matterApi.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      const staleIndex = this.accessories.findIndex(cached => cached.UUID === accessory.UUID);
      if (staleIndex >= 0) {
        this.accessories.splice(staleIndex, 1);
      }
      this.log.info(`Removed stale accessory from cache: ${accessory.displayName}`);
    }
  }

  private getDeviceName(device: EufyDevice): string {
    return device.device_name || device.alias_name || `Eufy RoboVac ${device.device_sn}`;
  }

  private disconnectMqttClient(accessoryUuid: string): void {
    const session = this.deviceSessions.get(accessoryUuid);
    if (session) {
      session.dispose();
      this.deviceSessions.delete(accessoryUuid);
    } else {
      const accessoryHandler = this.accessoryHandlers.get(accessoryUuid);
      accessoryHandler?.dispose();
    }
    this.accessoryHandlers.delete(accessoryUuid);
  }

  private disconnectAllMqttClients(): void {
    for (const accessoryUuid of [...this.deviceSessions.keys(), ...this.accessoryHandlers.keys()]) {
      this.disconnectMqttClient(accessoryUuid);
    }
  }

}
