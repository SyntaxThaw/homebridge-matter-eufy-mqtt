"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EufyMqttClient = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const events_1 = require("events");
class EufyMqttClient extends events_1.EventEmitter {
    deviceId;
    deviceModel;
    userId;
    appName;
    openudid;
    certificatePem;
    privateKey;
    username;
    endpoint;
    log;
    client = null;
    clientId;
    connectPromise = null;
    constructor(deviceId, deviceModel, userId, appName, openudid, certificatePem, privateKey, username, endpoint, log) {
        super();
        this.deviceId = deviceId;
        this.deviceModel = deviceModel;
        this.userId = userId;
        this.appName = appName;
        this.openudid = openudid;
        this.certificatePem = certificatePem;
        this.privateKey = privateKey;
        this.username = username;
        this.endpoint = endpoint;
        this.log = log;
        this.clientId = `android-${this.appName}-eufy_android_${this.openudid}_${this.userId}-${Date.now()}`;
    }
    async connect() {
        if (this.client?.connected) {
            return;
        }
        if (this.connectPromise) {
            return this.connectPromise;
        }
        this.log.debug(`Connecting to MQTT broker at ${this.endpoint}:8883`);
        this.connectPromise = new Promise((resolve, reject) => {
            const client = mqtt_1.default.connect(`mqtts://${this.endpoint}:8883`, {
                clientId: this.clientId,
                username: this.username,
                cert: this.certificatePem,
                key: this.privateKey,
                protocolVersion: 4,
                rejectUnauthorized: false,
            });
            this.client = client;
            let settled = false;
            const settleResolve = () => {
                if (settled) {
                    return;
                }
                settled = true;
                this.connectPromise = null;
                resolve();
            };
            const settleReject = (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                this.connectPromise = null;
                this.client = null;
                client.end(true);
                reject(error);
            };
            client.on('connect', () => {
                this.log.info('Connected to MQTT broker.');
                const topic = `cmd/eufy_home/${this.deviceModel}/${this.deviceId}/res`;
                client.subscribe(topic, (error) => {
                    if (error) {
                        const subscriptionError = error instanceof Error ? error : new Error(String(error));
                        settleReject(subscriptionError);
                        return;
                    }
                    this.log.debug(`Subscribed to ${topic}`);
                    this.emit('connected');
                    settleResolve();
                });
            });
            client.on('message', (topic, message) => {
                this.log.debug(`Received MQTT message on ${topic}`);
                try {
                    const payload = JSON.parse(message.toString());
                    this.emit('message', payload);
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.log.error('Failed to parse MQTT message as JSON', errorMessage);
                }
            });
            client.on('error', (error) => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.log.error('MQTT client error', errorMessage);
                this.emit('error', error);
                if (!settled) {
                    settleReject(error instanceof Error ? error : new Error(errorMessage));
                }
            });
            client.on('close', () => {
                this.log.warn('MQTT connection closed');
                this.emit('disconnected');
                if (!settled) {
                    settleReject(new Error(`MQTT connection to ${this.endpoint} closed before startup completed.`));
                }
            });
        });
        return this.connectPromise;
    }
    disconnect() {
        this.connectPromise = null;
        const client = this.client;
        this.client = null;
        client?.end(true);
    }
    async sendCommand(dataPayload) {
        if (!this.client || !this.client.connected) {
            this.log.warn('MQTT client is disconnected while sending command. Attempting reconnect.');
            await this.connect();
        }
        if (!this.client || !this.client.connected) {
            throw new Error('Cannot send command: MQTT client not connected after reconnect attempt');
        }
        const timestamp = Date.now();
        const payloadBuffer = JSON.stringify({
            account_id: this.userId,
            data: dataPayload,
            device_sn: this.deviceId,
            protocol: 2,
            t: timestamp,
        });
        const mqttVal = {
            head: {
                client_id: this.clientId,
                cmd: 65537,
                cmd_status: 2,
                msg_seq: 1,
                seed: '',
                sess_id: this.clientId,
                sign_code: 0,
                timestamp: timestamp,
                version: '1.0.0.1',
            },
            payload: payloadBuffer,
        };
        const topic = `cmd/eufy_home/${this.deviceModel}/${this.deviceId}/req`;
        this.log.debug(`Sending command to ${topic}`, dataPayload);
        await new Promise((resolve, reject) => {
            this.client?.publish(topic, JSON.stringify(mqttVal), (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
}
exports.EufyMqttClient = EufyMqttClient;
