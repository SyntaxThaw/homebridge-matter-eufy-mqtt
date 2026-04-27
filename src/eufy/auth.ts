import { Logger } from '../util/logger';
import { EufyHttpClient } from './http';
import crypto from 'crypto';
import { EufyDevice, EufyMqttInfo, EufyUserInfo } from './cloud-types';

export interface EufyAccountContext {
  devices: EufyDevice[];
  mqttConfig: EufyMqttInfo;
  userInfo: EufyUserInfo;
  openudid: string;
}

export class EufyAuthManager {
  private httpClient: EufyHttpClient;
  private openudid: string;

  constructor(username: string, password: string, private log: Logger) {
    this.openudid = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    this.httpClient = new EufyHttpClient(username, password, this.openudid, log);
  }

  async connectAndFetchDevices(): Promise<EufyAccountContext> {
    this.log.info('Logging into Eufy Cloud...');
    const loginSuccess = await this.httpClient.login();
    if (!loginSuccess) {
      throw new Error('Failed to log into Eufy Cloud');
    }

    const userInfo = await this.httpClient.getUserInfo();
    if (!userInfo) {
      throw new Error('Failed to fetch Eufy User Info');
    }

    const mqttConfig = await this.httpClient.getMQTTInfo();
    if (!mqttConfig) {
      throw new Error('Failed to fetch MQTT Auth configuration from Cloud');
    }

    const devices = await this.httpClient.getDeviceList();
    this.log.info(`Discovered ${devices.length} devices.`);

    return { devices, mqttConfig, userInfo, openudid: this.openudid };
  }
}
