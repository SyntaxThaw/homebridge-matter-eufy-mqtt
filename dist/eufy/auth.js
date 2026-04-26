"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyAuthManager = void 0;
const http_1 = require("./http");
const crypto_1 = __importDefault(require("crypto"));
class EufyAuthManager {
    log;
    httpClient;
    openudid;
    constructor(username, password, log) {
        this.log = log;
        this.openudid = crypto_1.default.randomUUID().replace(/-/g, '').substring(0, 16);
        this.httpClient = new http_1.EufyHttpClient(username, password, this.openudid, log);
    }
    async connectAndFetchDevices() {
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
exports.EufyAuthManager = EufyAuthManager;
