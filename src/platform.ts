import { API, DynamicPlatformPlugin, Logger as HomebridgeLogger, PlatformConfig } from 'homebridge';
import { EufyPlatformConfig, parsePlatformConfig } from './config';
import { Logger } from './util/logger';
import { EufyCodec } from './eufy/codec';
import { StateParser } from './eufy/parser';
import { EufyMqttClient } from './eufy/client';
import { CommandBuilder } from './eufy/commands';
import { MatterCommandHandlers } from './matter/handlers';
import { EufyRobovacAccessory } from './accessory';
import { createInitialState, Identity, EufyCapabilities } from './eufy/models';
import { PlatformAccessory } from 'homebridge';
import { deriveCapabilitiesByModel } from './eufy/capabilities';
import { EufyAuthManager } from './eufy/auth';
import { EufyDevice, resolveMqttConnectionSettings } from './eufy/cloud-types';
import { MatterMappers } from './matter/mappers';

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

export class EufyRobovacMatterPlatform implements DynamicPlatformPlugin {
  private readonly config: EufyPlatformConfig;
  private readonly log: Logger;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly activeAccessoryUuids: Set<string> = new Set();
  private readonly mqttClients = new Map<string, EufyMqttClient>();
  private readonly accessoryHandlers = new Map<string, EufyRobovacAccessory>();

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

    // Load protobuf schemas from disk — fast (filesystem-only, no network).
    const codec = new EufyCodec();
    try {
      await codec.loadSchemas();
    } catch (error: unknown) {
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
      // MQTT client is null until Phase 2 provides credentials from the cloud.
      const handlers = new MatterCommandHandlers(commandBuilder, null, this.log, caps, this.config.defaultMode);
      const identity: Identity = { deviceId, model: deviceModel, firmware };

      const initialState = createInitialState(identity, caps);
      initialState.activity.cleanMode = this.config.defaultMode;
      initialState.activity.suctionLevel = this.config.defaultSuction as 1 | 2 | 3 | 4;
      if (this.config.rooms.length > 0) {
        initialState.activity.availableRooms = this.config.rooms.map((r) => ({ id: r.id, name: r.name }));
      }

      const setupResult = await this.registerOrUpdateMatterAccessory(
        accessory,
        false, // already cached — not a new accessory
        handlers,
        caps,
        identity,
        () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.currentMapId,
        () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.paused ?? false,
      );
      if (!setupResult.configured) continue;

      const accessoryHandler = new EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
        disableMatterStatePush: !setupResult.statePushSupported || this.config.disableMatterStatePush === true,
      });
      this.accessoryHandlers.set(uuid, accessoryHandler);
      restoredHandlers.set(uuid, handlers);

      this.log.debug(`Phase 1: restored cached Matter accessory ${accessory.displayName} (${deviceId})`);
    }

    // ── Phase 2: cloud auth + MQTT (runs after Matter is already advertising) ─
    try {
      const authManager = new EufyAuthManager(
        this.config.username!,
        this.config.password!,
        this.log
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
          // Device not in cache — register it now for the first time.
          accessory = new this.api.platformAccessory(deviceName, uuid);
          accessory.category = this.api.hap.Categories.OTHER;

          const caps = deriveCapabilitiesByModel(deviceModel);
          const commandBuilder = new CommandBuilder(codec);
          handlers = new MatterCommandHandlers(commandBuilder, null, this.log, caps, this.config.defaultMode);
          const identity: Identity = { deviceId, model: deviceModel, firmware: device.main_fw_version || '1.0' };

          const initialState = createInitialState(identity, caps);
          initialState.activity.cleanMode = this.config.defaultMode;
          initialState.activity.suctionLevel = this.config.defaultSuction as 1 | 2 | 3 | 4;
          if (this.config.rooms.length > 0) {
            initialState.activity.availableRooms = this.config.rooms.map((r) => ({ id: r.id, name: r.name }));
          }

          const setupResult = await this.registerOrUpdateMatterAccessory(
            accessory,
            true,
            handlers,
            caps,
            identity,
            () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.currentMapId,
            () => this.accessoryHandlers.get(uuid)?.getCurrentState().activity.paused ?? false,
          );
          if (!setupResult.configured) {
            this.log.warn(`Skipping MQTT binding for ${deviceName}: Matter accessory setup failed.`);
            continue;
          }
          if (this.config.disableMatterStatePush === true) {
            this.log.warn(
              `Matter state push updates are disabled by config for ${deviceName}; command control still works but Home status can lag.`
            );
          }

          const accessoryHandler = new EufyRobovacAccessory(this.log.getRaw(), accessory, initialState, this.api, {
            disableMatterStatePush: !setupResult.statePushSupported || this.config.disableMatterStatePush === true,
          });
          this.accessoryHandlers.set(uuid, accessoryHandler);
        }

        // Wire the real MQTT client into the (possibly pre-created) handlers.
        const mqttClient = new EufyMqttClient(
          deviceId,
          deviceModel,
          userInfo.user_center_id,
          'eufy_home',
          openudid,
          mqttConnection.settings.certificatePem,
          mqttConnection.settings.privateKey,
          mqttConnection.settings.username,
          mqttConnection.settings.endpoint,
          this.log,
          { reconnectMaxDelayMs: this.config.mqttReconnectMaxDelay }
        );

        handlers!.setMqttClient(mqttClient);

        const accessoryHandler = this.accessoryHandlers.get(uuid)!;
        mqttClient.on('message', (payload) => {
          if (this.isDpsPayload(payload)) {
            const currentState = accessoryHandler.getCurrentState();
            const newState = parser.processDps(payload.data, currentState);
            accessoryHandler.onStateUpdate(newState);
            if (newState.activity.cleanMode !== currentState.activity.cleanMode) {
              handlers!.syncCleanModeFromDevice(newState.activity.cleanMode);
            }
          } else {
            this.log.debug(`Non-DPS MQTT payload (keys: ${Object.keys(payload as object).join(', ')}): ${JSON.stringify(payload).substring(0, 150)}`);
          }
        });

        mqttClient.on('connected', () => {
          this.log.info(`MQTT connected for ${deviceName}. Requesting device status...`);
          void mqttClient.requestStatus().catch((err: unknown) => {
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

  private async registerOrUpdateMatterAccessory(
    accessory: PlatformAccessory,
    isNewAccessory: boolean,
    handlers: MatterCommandHandlers,
    capabilities: EufyCapabilities,
    identity: Identity,
    getMapId: () => number | undefined = () => undefined,
    getIsPaused: () => boolean = () => false,
  ): Promise<{ configured: boolean; statePushSupported: boolean }> {
    const matterApi = this.getMatterApi();
    const roboticVacuumType = matterApi?.deviceTypes?.RoboticVacuumCleaner;
    if (!roboticVacuumType) {
      this.log.error('Matter device type RoboticVacuumCleaner is unavailable; cannot register accessory as vacuum.');
      return { configured: false, statePushSupported: false };
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
    const serviceAreaHandlers: Record<string, (request?: { newAreas?: number[] }) => Promise<void>> = {
      selectAreas: wrapHandler('serviceArea.selectAreas', async (request?: { newAreas?: number[] }) => {
        const areas = Array.isArray(request?.newAreas)
          ? request.newAreas.filter((area): area is number => Number.isFinite(area))
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

    const initialMatterState = createInitialState(identity, capabilities);
    const matterAccessory = accessory as PlatformAccessory & MatterAccessoryMetadata;
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
      serviceArea: {
        supportedMaps: [],
        supportedAreas: [],
        selectedAreas: [],
      },
      powerSource: {
        batPercentRemaining: MatterMappers.mapBatteryLevel(initialMatterState.power.batteryPercent),
        batChargeState: MatterMappers.mapChargeState(initialMatterState.power),
      },
    };

    const statePushSupported = true;

    if (matterApi?.configureMatterAccessory) {
      matterApi.configureMatterAccessory(accessory);
    } else {
      this.log.debug(
        'Matter configureMatterAccessory API unavailable on this Homebridge build; using direct metadata assignment.',
      );
    }

    if (matterApi?.registerPlatformAccessories) {
      if (isNewAccessory) {
        await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
        this.log.info(`Registered Matter accessory: ${accessory.displayName}`);
      } else if (matterApi.updatePlatformAccessories) {
        await matterApi.updatePlatformAccessories([accessory]);
        this.log.debug(`Updated cached Matter accessory metadata: ${accessory.displayName}`);
      } else {
        await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.log.debug(`Re-registered cached Matter accessory for current session: ${accessory.displayName}`);
      }
      return { configured: true, statePushSupported };
    }

    if (isNewAccessory) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info(`Registered Homebridge accessory: ${accessory.displayName}`);
    } else {
      this.api.updatePlatformAccessories([accessory]);
    }
    return { configured: true, statePushSupported };
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

  private disconnectAllMqttClients(): void {
    for (const accessoryUuid of this.mqttClients.keys()) {
      this.disconnectMqttClient(accessoryUuid);
    }
  }

  private isDpsPayload(payload: unknown): payload is { data: Record<string, string> } {
    if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
      return false;
    }

    const payloadData = (payload as { data?: unknown }).data;
    if (typeof payloadData !== 'object' || payloadData === null || Array.isArray(payloadData)) {
      return false;
    }

    // Coerce all values to strings so number/boolean DPS values are handled.
    const raw = payloadData as Record<string, unknown>;
    const coerced: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === null || v === undefined) continue;
      coerced[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    // Mutate in place so the type cast holds downstream.
    Object.assign(payloadData, coerced);
    return true;
  }
}
