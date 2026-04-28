import mqtt, { MqttClient } from 'mqtt';
import { Logger } from '../util/logger';
import { EventEmitter } from 'events';

export class EufyMqttClient extends EventEmitter {
  private client: MqttClient | null = null;
  private readonly clientId: string;
  private connectPromise: Promise<void> | null = null;

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
    if (this.client?.connected) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.log.debug(`Connecting to MQTT broker at ${this.endpoint}:8883`);

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(`mqtts://${this.endpoint}:8883`, {
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

      const settleReject = (error: Error) => {
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
          const payload = JSON.parse(message.toString()) as Record<string, unknown>;
          this.emit('message', payload);
        } catch (error: unknown) {
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

  async sendCommand(dataPayload: Record<string, string>): Promise<void> {
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

    await new Promise<void>((resolve, reject) => {
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
