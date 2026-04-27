"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyHttpClient = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const api_constants_1 = require("./api-constants");
const cloud_types_1 = require("./cloud-types");
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function getRecordProperty(value, propertyName) {
    if (!isRecord(value)) {
        return null;
    }
    const nestedValue = value[propertyName];
    return isRecord(nestedValue) ? nestedValue : null;
}
function getArrayProperty(value, propertyName) {
    if (!isRecord(value)) {
        return [];
    }
    const nestedValue = value[propertyName];
    return Array.isArray(nestedValue) ? nestedValue : [];
}
function isSessionData(value) {
    return isRecord(value) && typeof value.access_token === 'string' && value.access_token.trim().length > 0;
}
function isUserInfo(value) {
    return (isRecord(value)
        && typeof value.user_center_id === 'string'
        && value.user_center_id.trim().length > 0
        && typeof value.user_center_token === 'string'
        && value.user_center_token.trim().length > 0);
}
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
            if (isSessionData(response.data)) {
                this.sessionData = response.data;
                return true;
            }
            this.log.error('Login failed: response did not contain a usable access token.');
            return false;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log.error('Login error', message);
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
            if (isUserInfo(response.data)) {
                const hash = crypto_1.default.createHash('md5').update(response.data.user_center_id).digest('hex');
                this.userInfo = {
                    ...response.data,
                    gtoken: hash,
                };
                return this.userInfo;
            }
            this.log.error('UserInfo response missing required user identifiers.');
            return null;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log.error('UserInfo fetch error', message);
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
            const mqttInfo = getRecordProperty(response.data, 'data');
            if (mqttInfo) {
                return mqttInfo;
            }
            this.log.error('MQTT info response did not contain a data payload.');
            return null;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log.error('MQTT Info fetch error', message);
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
            const devicesV2 = (0, cloud_types_1.extractDevicesFromV2Response)(getArrayProperty(resV2.data, 'devices'));
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
            const aiotDevicesPayload = getRecordProperty(resAIoT.data, 'data');
            const devicesAIoT = (0, cloud_types_1.extractDevicesFromAiotResponse)(getArrayProperty(aiotDevicesPayload, 'devices'));
            const mergedDevices = (0, cloud_types_1.mergeDevices)(devicesAIoT, devicesV2);
            this.log.info(`Fetched ${devicesAIoT.length} AIoT devices and ${devicesV2.length} v2 devices.`);
            return mergedDevices;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log.error('Device list fetch error', message);
            return [];
        }
    }
}
exports.EufyHttpClient = EufyHttpClient;
