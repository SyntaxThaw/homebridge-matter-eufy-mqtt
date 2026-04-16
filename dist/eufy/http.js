"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyHttpClient = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const api_constants_1 = require("./api-constants");
class EufyHttpClient {
    username;
    password;
    openudid;
    log;
    axiosInstance;
    sessionData = null;
    userInfo = null;
    constructor(username, password, openudid, log) {
        this.username = username;
        this.password = password;
        this.openudid = openudid;
        this.log = log;
        this.axiosInstance = axios_1.default.create({
            timeout: 30000,
            headers: {
                'User-Agent': api_constants_1.APP_USER_AGENT,
            },
        });
    }
    async login() {
        try {
            const response = await this.axiosInstance.post(api_constants_1.EUFY_API_LOGIN, {
                email: this.username,
                password: this.password,
                client_id: api_constants_1.APP_CLIENT_ID,
                client_secret: api_constants_1.APP_CLIENT_SECRET,
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
        }
        catch (error) {
            this.log.error('Login error', error.message);
            return false;
        }
    }
    async getUserInfo() {
        if (!this.sessionData) {
            this.log.error('Cannot get UserInfo: Not logged in');
            return null;
        }
        try {
            const response = await this.axiosInstance.get(api_constants_1.EUFY_API_USER_INFO, {
                headers: {
                    'category': 'Home',
                    'token': this.sessionData.access_token,
                    'openudid': this.openudid,
                    'clienttype': '2',
                },
            });
            if (response.data && response.data.user_center_id) {
                this.userInfo = response.data;
                const hash = crypto_1.default.createHash('md5').update(this.userInfo.user_center_id).digest('hex');
                this.userInfo.gtoken = hash;
                return this.userInfo;
            }
            return null;
        }
        catch (error) {
            this.log.error('UserInfo fetch error', error.message);
            return null;
        }
    }
    async getMQTTInfo() {
        if (!this.userInfo)
            return null;
        try {
            const response = await this.axiosInstance.post(api_constants_1.EUFY_API_MQTT_INFO, {}, {
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
        }
        catch (error) {
            this.log.error('MQTT Info fetch error', error.message);
            return null;
        }
    }
    async getDeviceList() {
        if (!this.userInfo || !this.sessionData)
            return [];
        try {
            // Fetch from V2
            const resV2 = await this.axiosInstance.get(api_constants_1.EUFY_API_DEVICE_V2, {
                headers: {
                    'category': 'Home',
                    'token': this.sessionData.access_token,
                    'openudid': this.openudid,
                    'clienttype': '2',
                },
            });
            const devicesV2 = resV2.data?.devices || [];
            // Fetch from AIoT
            const resAIoT = await this.axiosInstance.post(api_constants_1.EUFY_API_DEVICE_LIST, { attribute: 3 }, {
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
            const aiotList = devicesAIoT.map((d) => d.device);
            return aiotList; // Returning the AIoT list primarily to match eufy-clean
        }
        catch (error) {
            this.log.error('Device list fetch error', error.message);
            return [];
        }
    }
}
exports.EufyHttpClient = EufyHttpClient;
