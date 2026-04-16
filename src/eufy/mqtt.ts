import mqtt, { MqttClient } from 'mqtt';
import { Logger } from '../util/logger';
import { EventEmitter } from 'events';

export class EufyMqttClient extends EventEmitter {
  private client: MqttClient | null = null;
  private readonly clientId: string;

  constructor(
    private readonly deviceId: string,
    private readonly deviceModel: string,
    private readonly userId: string,
    private readonly appName: string,
    private readonly openudid: string,
    private readonly certificatePem: string,
    private readonly privateKey: string,
    private readonly username: string,
    private readonly endpoint: string,
    private readonly log: Logger,
  ) {
    super();
    this.clientId = `android-${this.appName}-eufy_android_${this.openudid}_${this.userId}-${Date.now()}`;
  }

  async connect(): Promise<void> {
    this.log.debug(`Connecting to MQTT broker at ${this.endpoint}:8883`);

    this.client = mqtt.connect(`mqtts://${this.endpoint}:8883`, {
      clientId: this.clientId,
      username: this.username,
      cert: this.certificatePem,
      key: this.privateKey,
      protocolVersion: 4,
      rejectUnauthorized: false,
    });

    this.client.on('connect', () => {
      this.log.info('Connected to MQTT Broker!');
      const topic = `cmd/eufy_home/${this.deviceModel}/${this.deviceId}/res`;
      this.client?.subscribe(topic, (err) => {
        if (!err) {
          this.log.debug(`Subscribed to ${topic}`);
          this.emit('connected');
        }
      });
    });

    this.client.on('message', (topic, message) => {
      this.log.debug(`Received MQTT message on ${topic}`);
      try {
        const payload = JSON.parse(message.toString());
        this.emit('message', payload);
      } catch (err: any) {
        this.log.error('Failed to parse MQTT message as JSON', err.message);
      }
    });

    this.client.on('error', (err) => {
      this.log.error('MQTT Client Error', err);
      this.emit('error', err);
    });

    this.client.on('close', () => {
      this.log.warn('MQTT Connection closed');
      this.emit('disconnected');
    });
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }

  async sendCommand(dataPayload: any): Promise<void> {
    if (!this.client || !this.client.connected) {
      this.log.error('Cannot send command: MQTT client not connected');
      return;
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

    this.client.publish(topic, JSON.stringify(mqttVal));
  }
}
