import { API, DynamicPlatformPlugin, Logger as HomebridgeLogger, PlatformConfig } from 'homebridge';
import { EufyPlatformConfig } from './config';
import { Logger } from './util/logger';
import { EufyCodec } from './eufy/codec';
import { StateParser } from './eufy/parser';
import { EufyMqttClient } from './eufy/mqtt';
import { CommandBuilder } from './eufy/commands';
import { MatterCommandHandlers } from './matter/handlers';
import { EufyRobovacAccessory } from './matter/accessory';
import { createInitialState, Identity, EufyCapabilities } from './eufy/models';
import { PlatformAccessory } from 'homebridge';
import { deriveCapabilitiesByModel } from './eufy/capabilities';
import { EufyAuthManager } from './eufy/auth';
import { EufyDevice, resolveMqttConnectionSettings } from './eufy/cloud-types';

const PLUGIN_NAME = 'homebridge-eufy-robovac-matter';
const PLATFORM_NAME = 'EufyRobovacMatter';

type MatterPlatformApi = {
  configureMatterAccessory?: (accessory: PlatformAccessory, config: unknown) => Promise<void>;
  configureAccessory?: (accessory: PlatformAccessory, config: unknown) => Promise<void>;
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

export class EufyRobovacMatterPlatform implements DynamicPlatformPlugin {
  private readonly config: EufyPlatformConfig;
  private readonly log: Logger;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly activeAccessoryUuids: Set<string> = new Set();
  private readonly mqttClients = new Map<string, EufyMqttClient>();

  constructor(
    log: HomebridgeLogger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log = new Logger(log, 'EufyPlatform');
    this.config = config as EufyPlatformConfig;

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
    this.activeAccessoryUuids.clear();
    this.disconnectAllMqttClients();
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

      const codec = new EufyCodec();
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
          accessory.category = this.api.hap.Categories.OTHER;
        }

        const parser = new StateParser(codec, this.log);
        const commandBuilder = new CommandBuilder(codec);

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
          this.log
        );

        const caps: EufyCapabilities = deriveCapabilitiesByModel(deviceModel);
        const handlers = new MatterCommandHandlers(commandBuilder, mqttClient, this.log, caps);

        const identity: Identity = { deviceId, model: deviceModel, firmware: device.main_fw_version || '1.0' };
        const initialState = createInitialState(identity, caps);

        const configured = await this.registerOrUpdateMatterAccessory(accessory!, isNewAccessory, handlers, caps);
        if (!configured) {
          this.log.warn(`Skipping MQTT binding for ${device.device_name || deviceId}: Matter accessory setup failed.`);
          continue;
        }

        const accessoryHandler = new EufyRobovacAccessory(this.log.getRaw(), accessory!, initialState, this.api);

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
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.log.error(`Failed to connect MQTT for ${deviceName}: ${message}`);
        }
      }
      await this.cleanupStaleAccessories();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error(`Device discovery failed: ${message}. Will retry on next Homebridge restart.`);
    }
  }

  private async registerOrUpdateMatterAccessory(
    accessory: PlatformAccessory,
    isNewAccessory: boolean,
    handlers: MatterCommandHandlers,
    capabilities: EufyCapabilities
  ): Promise<boolean> {
    const matterApi = this.getMatterApi();
    const roboticVacuumType = matterApi?.deviceTypes?.RoboticVacuumCleaner;
    if (!roboticVacuumType) {
      this.log.error('Matter device type RoboticVacuumCleaner is unavailable; cannot register accessory as vacuum.');
      return false;
    }
    const commandHandlers: Record<string, () => Promise<void>> = {
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

    if (matterApi?.configureMatterAccessory) {
      await matterApi.configureMatterAccessory(accessory, matterConfig);
    } else if (matterApi?.configureAccessory) {
      await matterApi.configureAccessory(accessory, matterConfig);
    } else {
      this.log.warn('Matter configureAccessory API unavailable; using cached accessory fallback.');
    }

    if (isNewAccessory) {
      if (matterApi?.registerPlatformAccessories) {
        await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      this.accessories.push(accessory);
      this.log.info(`Registered Matter accessory: ${accessory.displayName}`);
      return true;
    }

    if (matterApi?.updatePlatformAccessories) {
      await matterApi.updatePlatformAccessories([accessory]);
    } else {
      this.api.updatePlatformAccessories([accessory]);
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
      if (matterApi?.unregisterPlatformAccessories) {
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

    return Object.values(payloadData).every((value) => typeof value === 'string');
  }
}
