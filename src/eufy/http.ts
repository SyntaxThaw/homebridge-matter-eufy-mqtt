import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import {
  APP_CLIENT_ID,
  APP_CLIENT_SECRET,
  APP_USER_AGENT,
  EUFY_API_DEVICE_LIST,
  EUFY_API_DEVICE_V2,
  EUFY_API_LOGIN,
  EUFY_API_MQTT_INFO,
  EUFY_API_USER_INFO,
} from './api-constants';
import { Logger } from '../util/logger';
import {
  EufyApiSession,
  EufyDevice,
  EufyMqttInfo,
  EufyUserInfo,
  extractDevicesFromAiotResponse,
  extractDevicesFromV2Response,
  mergeDevices,
} from './cloud-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getRecordProperty(value: unknown, propertyName: string): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  const nestedValue = value[propertyName];
  return isRecord(nestedValue) ? nestedValue : null;
}

function getArrayProperty(value: unknown, propertyName: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  const nestedValue = value[propertyName];
  return Array.isArray(nestedValue) ? nestedValue : [];
}

function isSessionData(value: unknown): value is EufyApiSession {
  return isRecord(value) && typeof value.access_token === 'string' && value.access_token.trim().length > 0;
}

function isUserInfo(value: unknown): value is EufyUserInfo {
  return (
    isRecord(value)
    && typeof value.user_center_id === 'string'
    && value.user_center_id.trim().length > 0
    && typeof value.user_center_token === 'string'
    && value.user_center_token.trim().length > 0
  );
}

export class EufyHttpClient {
  private axiosInstance: AxiosInstance;
  private sessionData: EufyApiSession | null = null;
  private userInfo: EufyUserInfo | null = null;

  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly openudid: string,
    private readonly log: Logger,
  ) {
    this.axiosInstance = axios.create({
      timeout: 30000,
      maxContentLength: 5 * 1024 * 1024, // 5MB limit to prevent DoS from oversized responses
      maxBodyLength: 5 * 1024 * 1024,    // 5MB limit to prevent DoS
      headers: {
        'User-Agent': APP_USER_AGENT,
      },
    });
  }

  async login(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.post(EUFY_API_LOGIN, {
        email: this.username,
        password: this.password,
        client_id: APP_CLIENT_ID,
        client_secret: APP_CLIENT_SECRET,
      }, {
        headers: {
          'category': 'Home',
          'openudid': this.openudid,
          'clientType': '1',
        },
      });

      if (isSessionData(response.data)) {
        this.sessionData = response.data;
        return true;
      }
      this.log.error('Login failed: response did not contain a usable access token.');
      return false;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Login error', message);
      return false;
    }
  }

  async getUserInfo(): Promise<EufyUserInfo | null> {
    if (!this.sessionData) {
      this.log.error('Cannot get UserInfo: Not logged in');
      return null;
    }

    try {
      const response = await this.axiosInstance.get(EUFY_API_USER_INFO, {
        headers: {
          'category': 'Home',
          'token': this.sessionData.access_token,
          'openudid': this.openudid,
          'clienttype': '2',
        },
      });

      if (isUserInfo(response.data)) {
        const hash = crypto.createHash('md5').update(response.data.user_center_id).digest('hex');
        this.userInfo = {
          ...response.data,
          gtoken: hash,
        };
        return this.userInfo;
      }
      this.log.error('UserInfo response missing required user identifiers.');
      return null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('UserInfo fetch error', message);
      return null;
    }
  }

  async getMQTTInfo(): Promise<EufyMqttInfo | null> {
    if (!this.userInfo) return null;

    try {
      const response = await this.axiosInstance.post(EUFY_API_MQTT_INFO, {}, {
        headers: {
          'openudid': this.openudid,
          'os-version': 'Android',
          'model-type': 'PHONE',
          'app-name': 'eufy_home',
          'x-auth-token': this.userInfo.user_center_token,
          'gtoken': this.userInfo.gtoken,
        },
      });

      const mqttInfo = getRecordProperty(response.data, 'data');
      if (mqttInfo) {
        return mqttInfo as EufyMqttInfo;
      }
      this.log.error('MQTT info response did not contain a data payload.');
      return null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('MQTT Info fetch error', message);
      return null;
    }
  }

  async getDeviceList(): Promise<EufyDevice[]> {
    if (!this.userInfo || !this.sessionData) return [];

    try {
      // Fetch from V2
      const resV2 = await this.axiosInstance.get(EUFY_API_DEVICE_V2, {
        headers: {
          'category': 'Home',
          'token': this.sessionData.access_token,
          'openudid': this.openudid,
          'clienttype': '2',
        },
      });

      const devicesV2 = extractDevicesFromV2Response(getArrayProperty(resV2.data, 'devices'));

      // Fetch from AIoT
      const resAIoT = await this.axiosInstance.post(EUFY_API_DEVICE_LIST, { attribute: 3 }, {
        headers: {
          'openudid': this.openudid,
          'os-version': 'Android',
          'model-type': 'PHONE',
          'app-name': 'eufy_home',
          'x-auth-token': this.userInfo.user_center_token,
          'gtoken': this.userInfo.gtoken,
        },
      });

      const aiotDevicesPayload = getRecordProperty(resAIoT.data, 'data');
      const devicesAIoT = extractDevicesFromAiotResponse(getArrayProperty(aiotDevicesPayload, 'devices'));
      const mergedDevices = mergeDevices(devicesAIoT, devicesV2);

      this.log.info(`Fetched ${devicesAIoT.length} AIoT devices and ${devicesV2.length} v2 devices.`);
      return mergedDevices;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Device list fetch error', message);
      return [];
    }
  }
}
