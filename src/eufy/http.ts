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

export class EufyHttpClient {
  private axiosInstance: AxiosInstance;
  private sessionData: any = null;
  private userInfo: any = null;

  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly openudid: string,
    private readonly log: Logger,
  ) {
    this.axiosInstance = axios.create({
      timeout: 30000,
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

      if (response.data && response.data.access_token) {
        this.sessionData = response.data;
        return true;
      }
      this.log.error('Login failed: Invalid response', response.data);
      return false;
    } catch (error: any) {
      this.log.error('Login error', error.message);
      return false;
    }
  }

  async getUserInfo(): Promise<any> {
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

      if (response.data && response.data.user_center_id) {
        this.userInfo = response.data;
        const hash = crypto.createHash('md5').update(this.userInfo.user_center_id).digest('hex');
        this.userInfo.gtoken = hash;
        return this.userInfo;
      }
      return null;
    } catch (error: any) {
      this.log.error('UserInfo fetch error', error.message);
      return null;
    }
  }

  async getMQTTInfo(): Promise<any> {
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

      if (response.data && response.data.data) {
        return response.data.data;
      }
      return null;
    } catch (error: any) {
      this.log.error('MQTT Info fetch error', error.message);
      return null;
    }
  }

  async getDeviceList(): Promise<any[]> {
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

      const devicesV2 = resV2.data?.devices || [];

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

      const devicesAIoT = resAIoT.data?.data?.devices || [];
      const aiotList = devicesAIoT.map((d: any) => d.device);

      return aiotList; // Returning the AIoT list primarily to match eufy-clean
    } catch (error: any) {
      this.log.error('Device list fetch error', error.message);
      return [];
    }
  }
}
