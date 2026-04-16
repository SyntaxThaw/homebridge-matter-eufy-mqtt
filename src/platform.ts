import { API, IndependentPlatformPlugin, Logger as HomebridgeLogger, PlatformConfig } from 'homebridge';
import { EufyPlatformConfig } from './config';
import { Logger } from './util/logger';

export class EufyRobovacMatterPlatform implements IndependentPlatformPlugin {
  private readonly config: EufyPlatformConfig;
  private readonly log: Logger;

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

  async discoverDevices() {
    this.log.info('Discovering Eufy devices...');
    try {
      const authManager = new (require('./eufy/auth')).EufyAuthManager(
        this.config.username!,
        this.config.password!,
        this.log
      );
      
      const { devices, mqttConfig } = await authManager.connectAndFetchDevices();
      
      if (!devices || devices.length === 0) {
        this.log.warn('No Eufy devices found under this account.');
        return;
      }
      
      this.log.info(`Provisioning ${devices.length} devices over MQTT...`);
      // Here we would iterate, generate PlatformAccessory UUIDs, bind EufyMqttClient, and create our Matter Accessories!
    } catch (error: any) {
      this.log.error(`Device discovery failed: ${error.message}. Will retry on next Homebridge restart.`);
    }
  }
}
