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
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.log.info('Logging into Eufy Cloud...');
        const loginSuccess = await this.httpClient.login();
        if (!loginSuccess) throw new Error('Failed to log into Eufy Cloud');

        const userInfo = await this.httpClient.getUserInfo();
        if (!userInfo) throw new Error('Failed to fetch Eufy User Info');

        const mqttConfig = await this.httpClient.getMQTTInfo();
        if (!mqttConfig) throw new Error('Failed to fetch MQTT Auth configuration from Cloud');

        const devices = await this.httpClient.getDeviceList();
        this.log.info(`Discovered ${devices.length} devices.`);

        return { devices, mqttConfig, userInfo, openudid: this.openudid };
      } catch (error: unknown) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const isCredentialError = message.includes('Failed to log into') || message.includes('401') || message.includes('403') || message.includes('Unauthorized');
        if (isCredentialError || attempt >= maxAttempts) break;
        const delayMs = 2000 * (2 ** (attempt - 1));
        this.log.warn(`Cloud auth attempt ${attempt}/${maxAttempts} failed: ${message}. Retrying in ${delayMs / 1000}s…`);
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
}
