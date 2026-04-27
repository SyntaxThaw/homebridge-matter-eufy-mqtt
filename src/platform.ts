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
      this.discoverDevices();
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
    try {
      const authManager = new (require('./eufy/auth')).EufyAuthManager(
        this.config.username!,
        this.config.password!,
        this.log
      );
      
      const { devices, mqttConfig, userInfo, openudid } = await authManager.connectAndFetchDevices();
      
      if (!devices || devices.length === 0) {
        this.log.warn('No Eufy devices found under this account.');
        return;
      }
      
      const codec = new EufyCodec();
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
          accessory.category = this.api.hap.Categories.OTHER;
        } else {
          this.log.info(`[DEBUG] Accessory found in cache! UUID: ${accessory!.UUID}`);
        }

        const parser = new StateParser(codec, this.log);
        const commandBuilder = new CommandBuilder(codec);
        
        // Setup MQTT Client
        const mqttClient = new EufyMqttClient(
          deviceId,
          deviceModel,
          userInfo.user_center_id || 'unknown_user',
          'eufy_home',
          openudid,
          mqttConfig.certificate_pem || mqttConfig.certificate,
          mqttConfig.private_key,
          mqttConfig.thing_name || mqttConfig.username || 'eufy', // Eufy usually uses thing_name as username for AWS IoT
          mqttConfig.endpoint_addr || mqttConfig.url || mqttConfig.domain || 'mqtt.eufylife.com',
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

        this.log.info(`[DEBUG] Initializing EufyRobovacAccessory handler...`);
        const accessoryHandler = new EufyRobovacAccessory(this.log.getRaw(), accessory!, initialState, this.api);
        
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
    } catch (error: any) {
      this.log.error(`Device discovery failed: ${error.message}. Will retry on next Homebridge restart.`);
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
      this.log.info(`[DEBUG] Successfully registered new accessory: ${accessory.displayName}`);
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
}
